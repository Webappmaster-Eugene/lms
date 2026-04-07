'use client'

import { useParams } from 'next/navigation'

export function OpenEditorButton() {
  const params = useParams()
  // In Payload admin edit view: /admin/collections/roadmaps/:id
  // params.segments = ['collections', 'roadmaps', '<id>']
  const segments = params?.segments as string[] | undefined
  const id = segments?.[2]

  if (!id) return null

  return (
    <div style={{ marginBottom: 16 }}>
      <a
        href={`/admin/roadmap-editor/${id}`}
        style={{
          display: 'inline-flex',
          alignItems: 'center',
          gap: 8,
          padding: '10px 18px',
          fontSize: 14,
          fontWeight: 600,
          color: '#fff',
          background: '#6366f1',
          border: 'none',
          borderRadius: 8,
          textDecoration: 'none',
          cursor: 'pointer',
          transition: 'background 0.15s',
          boxShadow: '0 2px 8px rgba(99,102,241,0.3)',
        }}
      >
        <svg width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
          <polygon points="12 2 2 7 12 12 22 7 12 2" />
          <polyline points="2 17 12 22 22 17" />
          <polyline points="2 12 12 17 22 12" />
        </svg>
        Открыть визуальный редактор
      </a>
    </div>
  )
}
