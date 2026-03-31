'use client'

import { useState, useRef, useEffect } from 'react'
import { Search, Loader2, BookOpen, Map } from 'lucide-react'
import { useRouter } from 'next/navigation'

type SearchResult = {
  id: string
  title: string
  slug: string
  type: 'roadmap' | 'course' | 'lesson'
}

export function SearchBar() {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const containerRef = useRef<HTMLDivElement>(null)
  const router = useRouter()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  async function search(q: string) {
    if (q.length < 2) {
      setResults([])
      return
    }

    setLoading(true)
    try {
      const [roadmaps, courses, lessons] = await Promise.all([
        fetch(`/api/roadmaps?where[title][contains]=${encodeURIComponent(q)}&where[isPublished][equals]=true&limit=3`, {
          credentials: 'include',
        }).then((r) => r.json()),
        fetch(`/api/courses?where[title][contains]=${encodeURIComponent(q)}&where[isPublished][equals]=true&limit=5`, {
          credentials: 'include',
        }).then((r) => r.json()),
        fetch(`/api/lessons?where[title][contains]=${encodeURIComponent(q)}&where[isPublished][equals]=true&limit=5`, {
          credentials: 'include',
        }).then((r) => r.json()),
      ])

      const combined: SearchResult[] = [
        ...(roadmaps.docs ?? []).map((d: { id: string; title: string; slug: string }) => ({
          id: d.id,
          title: d.title,
          slug: d.slug,
          type: 'roadmap' as const,
        })),
        ...(courses.docs ?? []).map((d: { id: string; title: string; slug: string }) => ({
          id: d.id,
          title: d.title,
          slug: d.slug,
          type: 'course' as const,
        })),
        ...(lessons.docs ?? []).map((d: { id: string; title: string; slug: string }) => ({
          id: d.id,
          title: d.title,
          slug: d.slug,
          type: 'lesson' as const,
        })),
      ]

      setResults(combined)
      setOpen(combined.length > 0)
    } catch {
      setResults([])
    } finally {
      setLoading(false)
    }
  }

  function handleChange(value: string) {
    setQuery(value)
    if (debounceRef.current) clearTimeout(debounceRef.current)
    debounceRef.current = setTimeout(() => search(value), 300)
  }

  function navigate(result: SearchResult) {
    setOpen(false)
    setQuery('')
    setResults([])

    const urlMap = {
      roadmap: `/roadmaps/${result.slug}`,
      course: `/courses/${result.slug}`,
      lesson: `/lessons/${result.slug}`,
    }
    router.push(urlMap[result.type])
  }

  const typeLabels = {
    roadmap: 'Роадмап',
    course: 'Курс',
    lesson: 'Урок',
  }

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
        <input
          type="text"
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onFocus={() => results.length > 0 && setOpen(true)}
          placeholder="Поиск курсов и уроков..."
          className="w-full rounded-lg border border-input bg-background py-2 pl-10 pr-4 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
        />
        {loading && (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        )}
      </div>

      {open && (
        <div className="absolute left-0 right-0 top-full mt-1 rounded-xl border border-border bg-card shadow-xl z-50 overflow-hidden">
          {results.map((result) => (
            <button
              key={`${result.type}-${result.id}`}
              onClick={() => navigate(result)}
              className="flex w-full items-center gap-3 px-4 py-3 text-left transition-colors hover:bg-accent/50"
            >
              {result.type === 'roadmap' ? (
                <Map className="h-4 w-4 text-muted-foreground shrink-0" />
              ) : (
                <BookOpen className="h-4 w-4 text-muted-foreground shrink-0" />
              )}
              <div className="flex-1 min-w-0">
                <p className="text-sm font-medium text-foreground truncate">{result.title}</p>
                <p className="text-xs text-muted-foreground">{typeLabels[result.type]}</p>
              </div>
            </button>
          ))}
        </div>
      )}
    </div>
  )
}
