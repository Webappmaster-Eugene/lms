'use client'

export function RoadmapEditorNavLink() {
  return (
    <a
      href="/admin/roadmap-editor"
      style={{
        display: 'flex',
        alignItems: 'center',
        gap: 8,
        padding: '8px 16px',
        fontSize: 13,
        color: '#818cf8',
        textDecoration: 'none',
        borderRadius: 6,
        margin: '4px 8px',
        background: 'rgba(99,102,241,0.08)',
        border: '1px solid rgba(99,102,241,0.2)',
        transition: 'background 0.15s',
      }}
    >
      <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" strokeLinecap="round" strokeLinejoin="round">
        <polygon points="12 2 2 7 12 12 22 7 12 2" />
        <polyline points="2 17 12 22 22 17" />
        <polyline points="2 12 12 17 22 12" />
      </svg>
      Редактор роадмапов
    </a>
  )
}
