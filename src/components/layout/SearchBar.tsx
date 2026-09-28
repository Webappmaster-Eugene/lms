'use client'

import { useState, useRef, useEffect, useId } from 'react'
import { Search, Loader2, BookOpen, Code2, GraduationCap, Map } from 'lucide-react'
import { useRouter } from 'next/navigation'

import { cn } from '@/lib/utils'

type ResultType = 'roadmap' | 'course' | 'lesson' | 'task'

type SearchResult = {
  id: string
  title: string
  href: string
  type: ResultType
}

type SearchBarProps = {
  autoFocus?: boolean
  onNavigate?: () => void
  /** «/» и Ctrl/⌘+K ставят фокус в поиск. Только у одного экземпляра на странице. */
  hotkey?: boolean
}

type Doc = { id: string | number; title: string; slug: string }
type TaskDoc = Doc & { topic?: { slug?: string } | number | null }

const TYPE_LABELS: Record<ResultType, string> = {
  roadmap: 'Роадмап',
  course: 'Курс',
  lesson: 'Урок',
  task: 'Задача тренажёра',
}

const TYPE_ICONS: Record<ResultType, typeof Map> = {
  roadmap: Map,
  course: GraduationCap,
  lesson: BookOpen,
  task: Code2,
}

async function fetchDocs<T>(collection: string, q: string, limit: number, extra = ''): Promise<T[]> {
  const res = await fetch(
    `/api/${collection}?where[title][contains]=${encodeURIComponent(q)}&where[isPublished][equals]=true&limit=${limit}${extra}`,
    { credentials: 'include' },
  )
  if (!res.ok) throw new Error(`GET /api/${collection} → ${res.status}`)
  const data = (await res.json()) as { docs?: T[] }
  return data.docs ?? []
}

/** Поле ввода не должно терять «/» — это обычный символ в тексте. */
function isTyping(target: EventTarget | null): boolean {
  if (!(target instanceof HTMLElement)) return false
  return target.isContentEditable || Boolean(target.closest('input, textarea, select, .monaco-editor'))
}

export function SearchBar({ autoFocus, onNavigate, hotkey }: SearchBarProps = {}) {
  const [query, setQuery] = useState('')
  const [results, setResults] = useState<SearchResult[]>([])
  // Запрос, по которому получены results: «ничего не найдено» показывается только для него.
  const [searched, setSearched] = useState<string | null>(null)
  const [failed, setFailed] = useState(false)
  const [loading, setLoading] = useState(false)
  const [open, setOpen] = useState(false)
  const [active, setActive] = useState(-1)
  const containerRef = useRef<HTMLDivElement>(null)
  const inputRef = useRef<HTMLInputElement>(null)
  const router = useRouter()
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null)
  // Ответы приходят не по порядку: медленный ответ на «ре» не должен затереть «react».
  const requestRef = useRef(0)
  const listId = useId()

  useEffect(() => {
    function handleClickOutside(e: MouseEvent) {
      if (containerRef.current && !containerRef.current.contains(e.target as Node)) {
        setOpen(false)
      }
    }
    document.addEventListener('mousedown', handleClickOutside)
    return () => document.removeEventListener('mousedown', handleClickOutside)
  }, [])

  useEffect(() => {
    if (!hotkey) return
    function onKey(e: KeyboardEvent) {
      // В Monaco Ctrl+K — начало аккордов (Ctrl+K Ctrl+C), их не перехватываем.
      const inEditor = e.target instanceof HTMLElement && Boolean(e.target.closest('.monaco-editor'))
      const combo = e.key.toLowerCase() === 'k' && (e.ctrlKey || e.metaKey) && !inEditor
      const slash = e.key === '/' && !e.ctrlKey && !e.metaKey && !e.altKey && !isTyping(e.target)
      if (!combo && !slash) return
      e.preventDefault()
      inputRef.current?.focus()
      inputRef.current?.select()
    }
    window.addEventListener('keydown', onKey)
    return () => window.removeEventListener('keydown', onKey)
  }, [hotkey])

  async function search(q: string) {
    const request = ++requestRef.current
    if (q.trim().length < 2) {
      setResults([])
      setSearched(null)
      setFailed(false)
      setOpen(false)
      return
    }

    setLoading(true)
    try {
      const [roadmaps, courses, lessons, tasks] = await Promise.all([
        fetchDocs<Doc>('roadmaps', q, 3),
        fetchDocs<Doc>('courses', q, 5),
        fetchDocs<Doc>('lessons', q, 5),
        fetchDocs<TaskDoc>('trainer-tasks', q, 5, '&depth=1&select[title]=true&select[slug]=true&select[topic]=true'),
      ])
      if (request !== requestRef.current) return

      const combined: SearchResult[] = [
        ...roadmaps.map((d) => ({ id: String(d.id), title: d.title, href: `/roadmaps/${d.slug}`, type: 'roadmap' as const })),
        ...courses.map((d) => ({ id: String(d.id), title: d.title, href: `/courses/${d.slug}`, type: 'course' as const })),
        ...lessons.map((d) => ({ id: String(d.id), title: d.title, href: `/lessons/${d.slug}`, type: 'lesson' as const })),
        // Задача без раскрытой темы — ссылку не собрать; такое бывает, если тема снята с публикации.
        ...tasks.flatMap((d) =>
          typeof d.topic === 'object' && d.topic?.slug
            ? [{ id: String(d.id), title: d.title, href: `/trainer/${d.topic.slug}/${d.slug}`, type: 'task' as const }]
            : [],
        ),
      ]

      setResults(combined)
      setSearched(q)
      setFailed(false)
      setActive(-1)
      setOpen(true)
    } catch (error) {
      if (request !== requestRef.current) return
      console.error('Поиск не удался', error)
      setResults([])
      setSearched(q)
      setFailed(true)
      setOpen(true)
    } finally {
      if (request === requestRef.current) setLoading(false)
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
    setSearched(null)
    setActive(-1)
    router.push(result.href)
    onNavigate?.()
  }

  function handleKeyDown(e: React.KeyboardEvent<HTMLInputElement>) {
    if (e.key === 'Escape') {
      if (open) setOpen(false)
      else inputRef.current?.blur()
      return
    }
    if (results.length === 0) return
    if (e.key === 'ArrowDown' || e.key === 'ArrowUp') {
      e.preventDefault()
      setOpen(true)
      const step = e.key === 'ArrowDown' ? 1 : -1
      setActive((i) => (i + step + results.length) % results.length)
    } else if (e.key === 'Enter' && open) {
      e.preventDefault()
      navigate(results[Math.max(active, 0)])
    }
  }

  const expanded = open && searched !== null
  const optionId = (index: number) => `${listId}-${index}`

  return (
    <div ref={containerRef} className="relative">
      <div className="relative">
        <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
        <input
          ref={inputRef}
          type="text"
          role="combobox"
          aria-label="Поиск по курсам, урокам и задачам"
          aria-expanded={expanded}
          aria-controls={listId}
          aria-autocomplete="list"
          aria-activedescendant={expanded && active >= 0 ? optionId(active) : undefined}
          value={query}
          onChange={(e) => handleChange(e.target.value)}
          onKeyDown={handleKeyDown}
          onFocus={() => searched !== null && setOpen(true)}
          placeholder="Поиск курсов, уроков и задач..."
          autoFocus={autoFocus}
          className="w-full rounded-lg border border-input bg-background py-2 pl-10 pr-10 text-sm text-foreground placeholder:text-muted-foreground focus:border-ring focus:outline-none focus:ring-2 focus:ring-ring/20"
        />
        {loading ? (
          <Loader2 className="absolute right-3 top-1/2 h-4 w-4 -translate-y-1/2 animate-spin text-muted-foreground" />
        ) : (
          hotkey &&
          !query && (
            <kbd
              title="Нажмите «/» или Ctrl+K, чтобы начать поиск"
              className="pointer-events-none absolute right-3 top-1/2 -translate-y-1/2 rounded border border-border px-1.5 font-mono text-xs text-muted-foreground"
            >
              /
            </kbd>
          )
        )}
      </div>

      {expanded && (
        <div className="absolute left-0 right-0 top-full z-50 mt-1 overflow-hidden rounded-xl border border-border bg-card shadow-xl">
          {results.length > 0 ? (
            <ul id={listId} role="listbox" aria-label="Результаты поиска">
              {results.map((result, index) => {
                const Icon = TYPE_ICONS[result.type]
                return (
                  <li
                    key={`${result.type}-${result.id}`}
                    id={optionId(index)}
                    role="option"
                    aria-selected={index === active}
                    onMouseDown={(e) => e.preventDefault()}
                    onClick={() => navigate(result)}
                    onMouseEnter={() => setActive(index)}
                    className={cn(
                      'flex w-full cursor-pointer items-center gap-3 px-4 py-3 text-left transition-colors',
                      index === active ? 'bg-accent' : 'hover:bg-accent/50',
                    )}
                  >
                    <Icon className="h-4 w-4 shrink-0 text-muted-foreground" aria-hidden="true" />
                    <div className="min-w-0 flex-1">
                      <p className="truncate text-sm font-medium text-foreground">{result.title}</p>
                      <p className="text-xs text-muted-foreground">{TYPE_LABELS[result.type]}</p>
                    </div>
                  </li>
                )
              })}
            </ul>
          ) : (
            <p id={listId} role="status" className="px-4 py-3 text-sm text-muted-foreground">
              {failed ? 'Поиск сейчас недоступен — попробуйте ещё раз' : `По запросу «${searched}» ничего не нашлось`}
            </p>
          )}
        </div>
      )}
    </div>
  )
}
