import type { CollectionAfterChangeHook, Payload } from 'payload'
import { DEFAULT_POINTS } from '@/lib/points-config'
import type { PointsReason } from '@/lib/points-config'

/**
 * Hook: начисляет баллы при отметке урока как пройденного.
 * Также проверяет завершение курса и роадмапа для бонусных баллов.
 *
 * Защита от дублей:
 * - Перед начислением проверяется наличие существующей транзакции
 * - При race condition (duplicate key) — ошибка перехватывается, дубль пропускается
 * - totalPoints пересчитывается как SUM всех транзакций (идемпотентно)
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

  const userId = String(typeof doc.user === 'object' ? doc.user.id : doc.user)
  const lessonId = String(typeof doc.lesson === 'object' ? doc.lesson.id : doc.lesson)

  // Защита от повторного начисления: если урок уже был пройден ранее
  const existingLessonTx = await req.payload.find({
    collection: 'points-transactions',
    where: {
      user: { equals: userId },
      reason: { equals: 'lesson_completed' },
      relatedEntity: { equals: lessonId },
    },
    limit: 1,
  })

  if (existingLessonTx.totalDocs > 0) {
    // Баллы за этот урок уже начислены (повторная отметка)
    return doc
  }

  // Загружаем настройки баллов
  let lessonPoints = DEFAULT_POINTS.LESSON_COMPLETED as number
  let coursePoints = DEFAULT_POINTS.COURSE_COMPLETED as number
  let roadmapPoints = DEFAULT_POINTS.ROADMAP_COMPLETED as number

  try {
    const settings = await req.payload.findGlobal({ slug: 'site-settings' })
    if (settings.points) {
      lessonPoints = settings.points.lessonCompleted ?? lessonPoints
      coursePoints = settings.points.courseCompleted ?? coursePoints
      roadmapPoints = settings.points.roadmapCompleted ?? roadmapPoints
    }
  } catch {
    // fallback to defaults
  }

  // 1. Баллы за урок
  const created = await safeCreateTransaction(
    req.payload, userId, lessonPoints, 'lesson_completed', lessonId, 'Урок пройден',
  )
  if (!created) return doc // race condition — другой запрос уже начислил

  // 2. Проверяем завершение курса
  const lesson = typeof doc.lesson === 'object'
    ? doc.lesson
    : await req.payload.findByID({ collection: 'lessons', id: lessonId })

  const rawCourseId = typeof lesson.course === 'object' ? lesson.course?.id : lesson.course
  const courseId = rawCourseId ? String(rawCourseId) : null

  if (courseId) {
    await checkCourseCompletion(req.payload, userId, courseId, coursePoints, lesson, roadmapPoints)
  }

  // Финальный пересчёт totalPoints
  await recalculateTotalPoints(req.payload, userId)

  return doc
}

/**
 * Проверяет завершение курса и роадмапа, начисляет бонусы.
 */
async function checkCourseCompletion(
  payload: Payload,
  userId: string,
  courseId: string,
  coursePoints: number,
  lesson: Record<string, unknown>,
  roadmapPoints: number,
) {
  const [allCourseLessons, userProgress] = await Promise.all([
    payload.find({
      collection: 'lessons',
      where: {
        course: { equals: courseId },
        isPublished: { equals: true },
      },
      limit: 500,
    }),
    payload.find({
      collection: 'user-progress',
      where: {
        user: { equals: userId },
        isCompleted: { equals: true },
      },
      limit: 5000,
    }),
  ])

  const completedIds = new Set(
    userProgress.docs.map((p) =>
      String(typeof p.lesson === 'object' ? p.lesson.id : p.lesson),
    ),
  )

  const courseCompleted =
    allCourseLessons.totalDocs > 0 &&
    allCourseLessons.docs.every((l) => completedIds.has(String(l.id)))

  if (!courseCompleted) return

  // Бонус за курс (с защитой от дублей)
  const created = await safeCreateTransaction(
    payload, userId, coursePoints, 'course_completed', courseId, 'Курс завершён',
  )
  if (!created) return // Уже начислено

  // 3. Проверяем завершение роадмапа
  const course = typeof lesson.course === 'object'
    ? lesson.course as Record<string, unknown>
    : await payload.findByID({ collection: 'courses', id: courseId })

  const rawRoadmapId = typeof course.roadmap === 'object'
    ? (course.roadmap as Record<string, unknown>)?.id
    : course.roadmap
  const roadmapId = rawRoadmapId ? String(rawRoadmapId) : null

  if (!roadmapId) return

  const allRoadmapCourses = await payload.find({
    collection: 'courses',
    where: {
      roadmap: { equals: roadmapId },
      isPublished: { equals: true },
    },
    limit: 100,
  })

  const existingCourseBonuses = await payload.find({
    collection: 'points-transactions',
    where: {
      user: { equals: userId },
      reason: { equals: 'course_completed' },
    },
    limit: 1000,
  })

  const completedCourseIds = new Set(
    existingCourseBonuses.docs
      .filter((t) => t.relatedEntity)
      .map((t) => String(t.relatedEntity)),
  )

  const roadmapCompleted =
    allRoadmapCourses.totalDocs > 0 &&
    allRoadmapCourses.docs.every((c) => completedCourseIds.has(String(c.id)))

  if (roadmapCompleted) {
    await safeCreateTransaction(
      payload, userId, roadmapPoints, 'roadmap_completed', roadmapId, 'Роадмап завершён',
    )
  }
}

/**
 * Создаёт транзакцию баллов с защитой от дублей.
 * Проверяет существование + ловит race condition ошибки.
 * Возвращает true если транзакция создана, false если дубль.
 */
async function safeCreateTransaction(
  payload: Payload,
  userId: string,
  amount: number,
  reason: PointsReason,
  relatedEntity: string,
  description: string,
): Promise<boolean> {
  // Проверяем дубль
  const existing = await payload.find({
    collection: 'points-transactions',
    where: {
      user: { equals: userId },
      reason: { equals: reason },
      relatedEntity: { equals: relatedEntity },
    },
    limit: 1,
  })

  if (existing.totalDocs > 0) return false

  try {
    await payload.create({
      collection: 'points-transactions',
      data: {
        user: userId as unknown as number,
        amount,
        reason,
        relatedEntity,
        description,
      },
      context: { skipHooks: true },
    })
    return true
  } catch {
    // Race condition: другой запрос уже создал транзакцию
    return false
  }
}

/**
 * Пересчитывает totalPoints как сумму всех транзакций.
 * Идемпотентный подход — безопасен при concurrent requests.
 */
async function recalculateTotalPoints(payload: Payload, userId: string) {
  const allTransactions = await payload.find({
    collection: 'points-transactions',
    where: { user: { equals: userId } },
    limit: 10000,
  })

  const totalPoints = allTransactions.docs.reduce((sum, tx) => sum + (tx.amount ?? 0), 0)

  await payload.update({
    collection: 'users',
    id: userId,
    data: { totalPoints },
    context: { skipHooks: true },
  })
}
