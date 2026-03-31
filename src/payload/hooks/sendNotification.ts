import type { CollectionAfterChangeHook } from 'payload'
import {
  welcomeEmail,
  courseCompletedEmail,
  achievementUnlockedEmail,
  roadmapCompletedEmail,
} from '@/payload/emails/templates'

/**
 * Hook для Users: отправляет приветственное email при создании аккаунта.
 */
export const sendWelcomeEmail: CollectionAfterChangeHook = async ({
  doc,
  operation,
  req,
}) => {
  if (operation !== 'create') return doc
  if (req.context?.skipHooks) return doc

  try {
    const { subject, html } = welcomeEmail(doc.firstName ?? '', doc.email)
    await req.payload.sendEmail({ to: doc.email, subject, html })
  } catch (err) {
    console.warn('[LMS] Failed to send welcome email:', err)
  }

  return doc
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

  try {
    const userId = String(typeof doc.user === 'object' ? doc.user.id : doc.user)
    const user = await req.payload.findByID({ collection: 'users', id: userId })

    if (reason === 'course_completed' && doc.relatedEntity) {
      const course = await req.payload.findByID({
        collection: 'courses',
        id: String(doc.relatedEntity),
      })
      const { subject, html } = courseCompletedEmail(
        user.firstName ?? '',
        course.title,
        doc.amount ?? 0,
      )
      await req.payload.sendEmail({ to: user.email, subject, html })
    }

    if (reason === 'roadmap_completed' && doc.relatedEntity) {
      const roadmap = await req.payload.findByID({
        collection: 'roadmaps',
        id: String(doc.relatedEntity),
      })
      const { subject, html } = roadmapCompletedEmail(
        user.firstName ?? '',
        roadmap.title,
        doc.amount ?? 0,
      )
      await req.payload.sendEmail({ to: user.email, subject, html })
    }
  } catch (err) {
    console.warn('[LMS] Failed to send completion email:', err)
  }

  return doc
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

  try {
    const userId = String(typeof doc.user === 'object' ? doc.user.id : doc.user)
    const achievementId = String(
      typeof doc.achievement === 'object' ? doc.achievement.id : doc.achievement,
    )

    const [user, achievement] = await Promise.all([
      req.payload.findByID({ collection: 'users', id: userId }),
      req.payload.findByID({ collection: 'achievements', id: achievementId }),
    ])

    const { subject, html } = achievementUnlockedEmail(
      user.firstName ?? '',
      achievement.title,
      achievement.description ?? '',
      achievement.pointsReward ?? 0,
    )

    await req.payload.sendEmail({ to: user.email, subject, html })
  } catch (err) {
    console.warn('[LMS] Failed to send achievement email:', err)
  }

  return doc
}
