'use client'

import { useEffect, useState } from 'react'
import { Map, ArrowLeft, Loader2 } from 'lucide-react'

type RoadmapItem = {
  id: number
  title: string
  slug: string
  isPublished: boolean | null
  order: number | null
}

const S = {
  page: { maxWidth: 680, margin: '0 auto', display: 'flex', flexDirection: 'column' as const, gap: 24 },
  backLink: { display: 'inline-flex', alignItems: 'center', gap: 8, fontSize: 14, color: '#888', textDecoration: 'none' } as React.CSSProperties,
  title: { fontSize: 22, fontWeight: 700, color: '#e0e0e0', margin: 0 },
  subtitle: { marginTop: 4, fontSize: 14, color: '#888' },
  loader: { display: 'flex', justifyContent: 'center', padding: '48px 0' },
  error: { borderRadius: 8, border: '1px solid #7f1d1d', background: '#1c0a0a', padding: '12px 16px', fontSize: 14, color: '#fca5a5' },
  empty: { borderRadius: 8, border: '1px solid #3a3a5c', background: '#252540', padding: '32px 16px', textAlign: 'center' as const, fontSize: 14, color: '#888' },
  emptyLink: { color: '#818cf8', textDecoration: 'underline' },
  grid: { display: 'flex', flexDirection: 'column' as const, gap: 12 },
  card: { display: 'flex', alignItems: 'center', gap: 16, borderRadius: 10, border: '1px solid #3a3a5c', background: '#252540', padding: 16, textDecoration: 'none', transition: 'border-color 0.15s, background 0.15s' } as React.CSSProperties,
  iconBox: { width: 40, height: 40, borderRadius: 8, background: 'rgba(99,102,241,0.15)', display: 'flex', alignItems: 'center', justifyContent: 'center', flexShrink: 0 },
  icon: { width: 20, height: 20, color: '#818cf8' },
  cardBody: { flex: 1, minWidth: 0 },
  cardTitle: { fontSize: 16, fontWeight: 600, color: '#e0e0e0', margin: 0, overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' as const },
  cardMeta: { marginTop: 4, display: 'flex', alignItems: 'center', gap: 8, fontSize: 12, color: '#888' },
  badgePublished: { borderRadius: 4, background: 'rgba(34,197,94,0.15)', padding: '2px 6px', color: '#86efac', fontSize: 11 },
  badgeDraft: { borderRadius: 4, background: 'rgba(245,158,11,0.15)', padding: '2px 6px', color: '#fcd34d', fontSize: 11 },
}

export function RoadmapSelector() {
  const [roadmaps, setRoadmaps] = useState<RoadmapItem[]>([])
  const [isLoading, setIsLoading] = useState(true)
  const [error, setError] = useState<string | null>(null)

  useEffect(() => {
    let cancelled = false

    fetch('/api/roadmaps?limit=100&sort=order&depth=0', { credentials: 'include' })
      .then((res) => {
        if (!res.ok) throw new Error('Ошибка загрузки роадмапов')
        return res.json()
      })
      .then((json: { docs: RoadmapItem[] }) => {
        if (!cancelled) setRoadmaps(json.docs)
      })
      .catch((err) => {
        if (!cancelled) setError(err instanceof Error ? err.message : String(err))
      })
      .finally(() => {
        if (!cancelled) setIsLoading(false)
      })

    return () => { cancelled = true }
  }, [])

  return (
    <div style={S.page}>
      <a href="/admin" style={S.backLink}>
        <ArrowLeft style={{ width: 16, height: 16 }} />
        Панель управления
      </a>

      <div>
        <h1 style={S.title}>Визуальный редактор роадмапов</h1>
        <p style={S.subtitle}>Выберите роадмап для визуального редактирования узлов и связей</p>
      </div>

      {isLoading && (
        <div style={S.loader}>
          <Loader2 style={{ width: 24, height: 24, color: '#888', animation: 'spin 1s linear infinite' }} />
        </div>
      )}

      {error && <div style={S.error}>{error}</div>}

      {!isLoading && !error && roadmaps.length === 0 && (
        <div style={S.empty}>
          Роадмапы не найдены. Создайте роадмап в{' '}
          <a href="/admin/collections/roadmaps/create" style={S.emptyLink}>коллекции</a>.
        </div>
      )}

      <div style={S.grid}>
        {roadmaps.map((roadmap) => (
          <a key={roadmap.id} href={`/admin/roadmap-editor/${roadmap.id}`} style={S.card}>
            <div style={S.iconBox}>
              <Map style={S.icon} />
            </div>
            <div style={S.cardBody}>
              <h3 style={S.cardTitle}>{roadmap.title}</h3>
              <div style={S.cardMeta}>
                <span>/{roadmap.slug}</span>
                {roadmap.isPublished ? (
                  <span style={S.badgePublished}>Опубликован</span>
                ) : (
                  <span style={S.badgeDraft}>Черновик</span>
                )}
              </div>
            </div>
          </a>
        ))}
      </div>
    </div>
  )
}
