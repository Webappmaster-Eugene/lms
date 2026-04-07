import type { AdminViewServerProps } from 'payload'
import { RoadmapEditorClient } from './RoadmapEditorClient'

/**
 * Server-side entry point для визуального редактора роадмапа.
 *
 * Payload v3 custom view: зарегистрирован по пути `/roadmap-editor/:segments*`.
 * Next.js `[[...segments]]` catch-all передаёт полный путь в `params.segments`.
 * Для URL `/admin/roadmap-editor/5` → segments = ['roadmap-editor', '5'].
 */
export default function RoadmapEditorView({ params }: AdminViewServerProps) {
  const segments = params?.segments as string[] | undefined

  // segments[0] = 'roadmap-editor', segments[1] = roadmap id (если есть)
  const rawId = segments?.[1]
  const roadmapId = rawId != null && rawId !== '' ? Number(rawId) : null

  return (
    <div style={{ padding: '20px 24px', height: '100vh', display: 'flex', flexDirection: 'column', overflow: 'hidden' }}>
      <RoadmapEditorClient roadmapId={Number.isFinite(roadmapId) ? roadmapId : null} />
    </div>
  )
}
