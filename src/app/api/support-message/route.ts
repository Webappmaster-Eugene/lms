import { NextResponse } from 'next/server'
import { getPayload } from 'payload'
import config from '@payload-config'
import { logger } from '@/lib/telemetry'
import { collectAllPages } from '@/lib/paginate'

type SupportMessageRequest = {
  subject: string
  message: string
}

/**
 * POST /api/support-message
 * Отправляет сообщение в поддержку (создаёт notification для всех админов).
 */
export async function POST(request: Request) {
  const payload = await getPayload({ config })

  // Auth check
  const { user } = await payload.auth({ headers: request.headers })
  if (!user) {
    return NextResponse.json({ error: 'Требуется авторизация' }, { status: 401 })
  }

  let body: SupportMessageRequest
  try {
    body = await request.json()
  } catch {
    return NextResponse.json({ error: 'Невалидный JSON' }, { status: 400 })
  }

  const { subject, message } = body

  if (!subject?.trim() || !message?.trim()) {
    return NextResponse.json(
      { error: 'Обязательные поля: subject, message' },
      { status: 400 },
    )
  }

  if (subject.length > 200) {
    return NextResponse.json({ error: 'Тема не должна превышать 200 символов' }, { status: 400 })
  }

  if (message.length > 5000) {
    return NextResponse.json({ error: 'Сообщение не должно превышать 5000 символов' }, { status: 400 })
  }

  const admins = await collectAllPages(
    ({ page, limit }) =>
      payload.find({
        collection: 'users',
        where: { role: { equals: 'admin' } },
        select: {},
        depth: 0,
        sort: 'id',
        page,
        limit,
      }),
    { label: 'администраторы' },
  )

  // Лимит - по обращениям, а не по уведомлениям: уведомлений на одно обращение столько,
  // сколько админов. Считаем копии одного получателя (первого админа)
  const userLink = `/admin/collections/users/${user.id}`
  const firstAdmin = admins[0]
  const recentMessages = firstAdmin
    ? await payload.find({
        collection: 'notifications',
        where: {
          user: { equals: firstAdmin.id },
          type: { equals: 'support_message' },
          link: { equals: userLink },
          createdAt: { greater_than: new Date(Date.now() - 3600000).toISOString() },
        },
        limit: 0,
      })
    : { totalDocs: 0 }

  if (recentMessages.totalDocs >= 5) {
    return NextResponse.json(
      { error: 'Слишком много обращений. Попробуйте позже.' },
      { status: 429 },
    )
  }

  const userName = [user.firstName, user.lastName].filter(Boolean).join(' ') || user.email

  // Create notification for each admin
  for (const admin of admins) {
    try {
      await payload.create({
        collection: 'notifications',
        data: {
          user: admin.id,
          title: `Обращение от ${userName}: ${subject.trim()}`,
          message: message.trim(),
          type: 'support_message',
          link: userLink,
          isRead: false,
        },
        context: { skipHooks: true },
      })
    } catch (err) {
      logger.error(`Failed to create support notification for admin ${admin.id}: ${err}`)
    }
  }

  logger.info(`Support message from user ${user.id}: "${subject}"`)

  return NextResponse.json({ success: true })
}
