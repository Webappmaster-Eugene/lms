import type { CollectionAfterChangeHook, PayloadRequest } from 'payload'
import { ensureCertificate } from '@/payload/hooks/createCertificate'
import { DEFAULT_POINTS } from '@/lib/points-config'
import type { PointsReason } from '@/lib/points-config'
import { relationId } from '@/lib/relation-id'
import { withSpan, logger } from '@/lib/telemetry'
import { skipHooksReq } from '@/lib/payload-req'
import { collectAllPages } from '@/lib/paginate'
import { isCourseCompleted, isRoadmapCompleted } from '@/lib/course-completion'

/**
 * Hook: начисляет баллы при отметке урока как пройденного.
 * Также проверяет завершение курса и роадмапа для бонусных баллов.
 *
 * Защита от дублей:
 * - Перед начислением проверяется наличие существующей транзакции
 * - Общая блокировка users сериализует конкурентные запросы
 * - totalPoints пересчитывается как SUM всех транзакций (идемпотентно)
 *
 * Все обращения к БД идут через req: local API тогда работает в транзакции
 * исходного запроса. Без этого запись в users уходит отдельным соединением и
 * встаёт на блокировке, которую держит незавершённая внешняя транзакция.
 */
export const awardPoints: CollectionAfterChangeHook = async ({
  doc,
  previousDoc,
  operation,
  req,
}) => {
  if (req.context?.skipHooks) return doc

  const justCompleted =
    doc.isCompleted === true &&
    (operation === 'create' || previousDoc?.isCompleted !== true)

  if (!justCompleted) return doc

  const userId = relationId(doc.user)
  const lessonId = relationId(doc.lesson)

  return withSpan('hook.awardPoints', { 'user.id': userId, 'lesson.id': lessonId }, async () => {
    // Загружаем настройки баллов
    let lessonPoints = DEFAULT_POINTS.LESSON_COMPLETED as number
    let coursePoints = DEFAULT_POINTS.COURSE_COMPLETED as number
    let roadmapPoints = DEFAULT_POINTS.ROADMAP_COMPLETED as number

    try {
      const settings = await req.payload.findGlobal({ req, slug: 'site-settings' })
      if (settings.points) {
        lessonPoints = settings.points.lessonCompleted ?? lessonPoints
        coursePoints = settings.points.courseCompleted ?? coursePoints
        roadmapPoints = settings.points.roadmapCompleted ?? roadmapPoints
      }
    } catch (error) {
      logger.warn('awardPoints: не удалось прочитать SiteSettings, берутся значения по умолчанию', {
        'user.id': userId,
        'error.message': error instanceof Error ? error.message : String(error),
      })
    }

    // 1. Баллы за урок
    await safeCreateTransaction(
      req, userId, lessonPoints, 'lesson_completed', String(lessonId), 'Урок пройден',
    )

    // Repeated completion must recheck a changed programme and recover missing certificates.
    const lesson = typeof doc.lesson === 'object'
      ? doc.lesson
      : await req.payload.findByID({ req, collection: 'lessons', id: lessonId })

    const rawCourseId = typeof lesson.course === 'object' ? lesson.course?.id : lesson.course
    const courseId = rawCourseId ? String(rawCourseId) : null

    if (courseId) {
      await checkCourseCompletion(req, userId, courseId, coursePoints, lesson, roadmapPoints)
    }

    // Финальный пересчёт totalPoints
    await recalculateTotalPoints(req, userId)

    return doc
  })
}

/**
 * Проверяет завершение курса и роадмапа, начисляет бонусы.
 */
async function checkCourseCompletion(
  req: PayloadRequest,
  userId: number,
  courseId: string,
  coursePoints: number,
  lesson: Record<string, unknown>,
  roadmapPoints: number,
) {
  return withSpan('awardPoints.checkCourseCompletion', { 'user.id': userId, 'course.id': courseId }, async () => {
    if (!(await isCourseCompleted(req, userId, courseId))) return

    // Бонус за курс (с защитой от дублей)
    const created = await safeCreateTransaction(
      req, userId, coursePoints, 'course_completed', courseId, 'Курс завершён',
    )
    if (!created) await ensureCertificate(req, userId, courseId, 'course')

    // 3. Проверяем завершение роадмапа
    const course = typeof lesson.course === 'object'
      ? lesson.course as Record<string, unknown>
      : await req.payload.findByID({ req, collection: 'courses', id: courseId })

    const rawRoadmapId = typeof course.roadmap === 'object'
      ? (course.roadmap as Record<string, unknown>)?.id
      : course.roadmap
    const roadmapId = rawRoadmapId ? String(rawRoadmapId) : null

    if (!roadmapId) return

    // Historical bonuses do not prove completion after new lessons are published.
    if (await isRoadmapCompleted(req, userId, roadmapId)) {
      const roadmapBonusCreated = await safeCreateTransaction(
        req, userId, roadmapPoints, 'roadmap_completed', roadmapId, 'Роадмап завершён',
      )
      if (!roadmapBonusCreated) await ensureCertificate(req, userId, roadmapId, 'roadmap')
    }
  })
}

/**
 * Создаёт транзакцию баллов с защитой от дублей.
 * Проверяет существование под блокировкой пользователя. Ошибка записи откатывает прогресс.
 * Возвращает true если транзакция создана, false если дубль.
 */
async function safeCreateTransaction(
  req: PayloadRequest,
  userId: number,
  amount: number,
  reason: PointsReason,
  relatedEntity: string,
  description: string,
): Promise<boolean> {
  return withSpan('awardPoints.safeCreateTransaction', { 'user.id': userId, 'points.reason': reason, 'points.amount': amount }, async () => {
    // Проверяем дубль
    const existing = await req.payload.find({
      req,
      collection: 'points-transactions',
      where: {
        user: { equals: userId },
        reason: { equals: reason },
        relatedEntity: { equals: relatedEntity },
      },
      limit: 1,
    })

    if (existing.totalDocs > 0) return false

    // Без skipHooks: хуки транзакции выдают сертификат, уведомление и письмо о завершении
    await req.payload.create({
      req,
      collection: 'points-transactions',
      data: {
        user: userId,
        amount,
        reason,
        relatedEntity,
        description,
      },
    })
    return true
  })
}

/**
 * Пересчитывает totalPoints как сумму всех транзакций.
 * Идемпотентный подход — безопасен при concurrent requests.
 */
async function recalculateTotalPoints(req: PayloadRequest, userId: number) {
  return withSpan('awardPoints.recalculateTotalPoints', { 'user.id': userId }, async () => {
    const transactions = await collectAllPages(
      ({ page, limit }) =>
        req.payload.find({
          req,
          collection: 'points-transactions',
          where: { user: { equals: userId } },
          select: { amount: true },
          depth: 0,
          sort: 'id',
          page,
          limit,
        }),
      { label: `транзакции баллов пользователя ${userId}` },
    )

    const totalPoints = transactions.reduce((sum, tx) => sum + (tx.amount ?? 0), 0)

    await req.payload.update({
      req: skipHooksReq(req),
      collection: 'users',
      id: userId,
      data: { totalPoints },
    })
  })
}
