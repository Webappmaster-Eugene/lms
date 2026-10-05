import type { AdminViewServerProps } from 'payload'
import { DefaultTemplate } from '@payloadcms/next/templates'
import { redirect } from 'next/navigation'
import { RoadmapEditorClient } from './RoadmapEditorClient'

/**
 * Server-side entry point для визуального редактора роадмапа.
 *
 * Payload v3 custom view: зарегистрирован по пути `/roadmap-editor/:segments*`.
 * Next.js `[[...segments]]` catch-all передаёт полный путь в `params.segments`.
 * Для URL `/admin/roadmap-editor/5` → segments = ['roadmap-editor', '5'].
 */
export default function RoadmapEditorView({ params, searchParams, initPageResult }: AdminViewServerProps) {
  const { req, locale, permissions, visibleEntities } = initPageResult
  if (req.user?.role !== 'admin') redirect('/')

  const segments = params?.segments

  // segments[0] = 'roadmap-editor', segments[1] = roadmap id (если есть)
  const rawId = Array.isArray(segments) ? segments[1] : undefined
  const roadmapId = rawId != null && rawId !== '' ? Number(rawId) : null

  return (
    <DefaultTemplate
      i18n={req.i18n}
      locale={locale}
      params={params}
      payload={req.payload}
      permissions={permissions}
      req={req}
      searchParams={searchParams}
      user={req.user}
      visibleEntities={{ collections: visibleEntities.collections, globals: visibleEntities.globals }}
    >
      <div style={{ padding: '20px 24px', height: 'calc(100dvh - var(--app-header-height, 80px))', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
        <RoadmapEditorClient roadmapId={Number.isFinite(roadmapId) ? roadmapId : null} />
      </div>
    </DefaultTemplate>
  )
}
