import type { CollectionAfterChangeHook } from 'payload'
import {
  inviteEmail,
  courseCompletedEmail,
  achievementUnlockedEmail,
  roadmapCompletedEmail,
} from '@/payload/emails/templates'
import { withSpan, logger } from '@/lib/telemetry'

/**
 * Срок жизни токена в письме-приглашении — 7 дней.
 *
 * Передаётся поштучно в `payload.forgotPassword`, а НЕ в `Users.auth.forgotPassword.expiration`:
 * Payload отдаёт приоритет значению из конфига коллекции
 * (`collectionConfig.auth?.forgotPassword?.expiration ?? expiration ?? 3600000`),
 * поэтому глобальная настройка перекрыла бы это значение и заодно растянула бы
 * срок жизни обычных токенов восстановления пароля. Оставляем конфиг коллекции
 * пустым: приглашение живёт 7 дней, восстановление пароля — стандартный час.
 */
const INVITE_TOKEN_TTL_MS = 7 * 24 * 60 * 60 * 1000

/**
 * Hook для Users: при создании аккаунта отправляет приглашение со ссылкой
 * на установку пароля.
 *
 * Аккаунты заводит администратор (`Users.access.create = isAdmin`), поэтому
 * студент не знает своего пароля. Пароль в письме не передаётся — вместо этого
 * выпускается одноразовый токен, который ведёт на `/reset-password`.
 */
export const sendInviteEmail: CollectionAfterChangeHook = async ({ doc, operation, req }) => {
  if (operation !== 'create') return doc
  if (req.context?.skipHooks) return doc

  return withSpan('hook.sendInviteEmail', { 'user.email': doc.email }, async () => {
    try {
      // `req` передаём намеренно: токен должен записаться в той же транзакции,
      // что и сам пользователь, иначе `forgotPassword` не увидит ещё не
      // закоммиченную строку и упадёт с "user not found".
      const token = await req.payload.forgotPassword({
        collection: 'users',
        data: { email: doc.email },
        disableEmail: true,
        expiration: INVITE_TOKEN_TTL_MS,
        req,
      })

      if (!token) {
        throw new Error('forgotPassword returned an empty token')
      }

      const { subject, html, text } = inviteEmail(doc.firstName ?? '', doc.email, token)
      await req.payload.sendEmail({ to: doc.email, subject, html, text })
    } catch (err) {
      logger.error('Failed to send invite email', err, { 'user.email': doc.email })
    }

    return doc
  })
}

/**
 * Hook для PointsTransactions: отправляет email при завершении курса/роадмапа.
 */
export const sendCompletionEmail: CollectionAfterChangeHook = async ({
  doc,
  operation,
  req,
}) => {
  if (operation !== 'create') return doc
  if (req.context?.skipHooks) return doc

  const reason = doc.reason as string
  if (reason !== 'course_completed' && reason !== 'roadmap_completed') return doc

  const userId = String(typeof doc.user === 'object' ? doc.user.id : doc.user)

  return withSpan('hook.sendCompletionEmail', { 'user.id': userId, 'points.reason': reason }, async () => {
    try {
      const user = await req.payload.findByID({ collection: 'users', id: userId })

      if (reason === 'course_completed' && doc.relatedEntity) {
        const course = await req.payload.findByID({
          collection: 'courses',
          id: String(doc.relatedEntity),
        })
        const { subject, html, text } = courseCompletedEmail(
          user.firstName ?? '',
          course.title,
          doc.amount ?? 0,
        )
        await req.payload.sendEmail({ to: user.email, subject, html, text })
      }

      if (reason === 'roadmap_completed' && doc.relatedEntity) {
        const roadmap = await req.payload.findByID({
          collection: 'roadmaps',
          id: String(doc.relatedEntity),
        })
        const { subject, html, text } = roadmapCompletedEmail(
          user.firstName ?? '',
          roadmap.title,
          doc.amount ?? 0,
        )
        await req.payload.sendEmail({ to: user.email, subject, html, text })
      }
    } catch (err) {
      logger.error('Failed to send completion email', err, { 'user.id': userId, 'points.reason': reason })
    }

    return doc
  })
}

/**
 * Hook для UserAchievements: отправляет email при получении достижения.
 */
export const sendAchievementEmail: CollectionAfterChangeHook = async ({
  doc,
  operation,
  req,
}) => {
  if (operation !== 'create') return doc
  if (req.context?.skipHooks) return doc

  const userId = String(typeof doc.user === 'object' ? doc.user.id : doc.user)

  return withSpan('hook.sendAchievementEmail', { 'user.id': userId }, async () => {
    try {
      const achievementId = String(
        typeof doc.achievement === 'object' ? doc.achievement.id : doc.achievement,
      )

      const [user, achievement] = await Promise.all([
        req.payload.findByID({ collection: 'users', id: userId }),
        req.payload.findByID({ collection: 'achievements', id: achievementId }),
      ])

      const { subject, html, text } = achievementUnlockedEmail(
        user.firstName ?? '',
        achievement.title,
        achievement.description ?? '',
        achievement.pointsReward ?? 0,
      )

      await req.payload.sendEmail({ to: user.email, subject, html, text })
    } catch (err) {
      logger.error('Failed to send achievement email', err, { 'user.id': userId })
    }

    return doc
  })
}
