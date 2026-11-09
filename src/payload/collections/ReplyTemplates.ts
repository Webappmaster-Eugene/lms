import { sql } from '@payloadcms/db-postgres'
import type { CollectionConfig, PayloadRequest } from 'payload'

import { COMMENT_MAX_LENGTH } from '@/lib/comment-threads'
import { TEMPLATE_TITLE_MAX } from '@/lib/reply-templates'
import { isAdmin } from '@/payload/access/isAdmin'

type Executor = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> }

/**
 * +1 к счётчику вставок одним запросом: PATCH с числом, посчитанным в браузере,
 * терял бы повторные вставки до обновления страницы. updated_at не трогаем -
 * вставка не правка текста.
 */
export async function countTemplateUse(req: PayloadRequest): Promise<Response> {
  if ((await isAdmin({ req })) !== true) return Response.json({ error: 'Недостаточно прав' }, { status: 403 })
  const id = Number(req.routeParams?.id)
  if (!Number.isSafeInteger(id) || id < 1) return Response.json({ error: 'Заготовка не найдена' }, { status: 404 })
  const db = (req.payload.db as unknown as { drizzle: Executor }).drizzle
  const result = await db.execute(sql`update reply_templates set usage_count = coalesce(usage_count, 0) + 1 where id = ${id} returning usage_count`)
  const row = (result as { rows?: { usage_count?: unknown }[] }).rows?.[0]
  if (!row) return Response.json({ error: 'Заготовка не найдена' }, { status: 404 })
  return Response.json({ id, usageCount: Number(row.usage_count) })
}

/**
 * Заготовки частых ответов ментора: вставляются в поле ответа на экране
 * «Вопросы учеников». Ученикам не видны - это рабочий инструмент ментора.
 */
export const ReplyTemplates: CollectionConfig = {
  slug: 'reply-templates',
  labels: {
    singular: 'Заготовка ответа',
    plural: 'Заготовки ответов',
  },
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'usageCount', 'updatedAt'],
    group: 'Коммуникация',
    description: 'Вставляются кнопкой «Заготовки» в поле ответа на странице «Вопросы учеников»',
  },
  access: {
    read: isAdmin,
    create: isAdmin,
    update: isAdmin,
    delete: isAdmin,
  },
  defaultSort: '-usageCount',
  endpoints: [{ path: '/:id/use', method: 'post', handler: countTemplateUse }],
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      maxLength: TEMPLATE_TITLE_MAX,
      label: 'Название',
      admin: { description: 'По нему заготовку ищут в списке' },
    },
    {
      name: 'content',
      type: 'textarea',
      required: true,
      maxLength: COMMENT_MAX_LENGTH,
      label: 'Текст',
      admin: {
        description: 'Markdown, как в ответе. {имя} - имя ученика, {урок} - название урока',
        rows: 8,
      },
    },
    {
      name: 'usageCount',
      type: 'number',
      defaultValue: 0,
      min: 0,
      label: 'Сколько раз вставлена',
      admin: {
        position: 'sidebar',
        readOnly: true,
        description: 'Частые заготовки стоят в списке выше',
      },
    },
  ],
}
