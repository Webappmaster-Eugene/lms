'use client'

import { useCallback, useEffect, useState, useTransition } from 'react'
import { usePathname, useRouter, useSearchParams } from 'next/navigation'
import { Search, X } from 'lucide-react'

import {
  COMPANY_OPTIONS,
  DIFFICULTY_OPTIONS,
  LANGUAGE_OPTIONS,
  TAG_OPTIONS,
} from '@/lib/trainer/constants'
import { cn } from '@/lib/utils'

/**
 * Панель фильтров каталога задач.
 *
 * Состояние живёт в query-параметрах, а не в React: так ссылку на подборку
 * («все средние задачи на асинхронность») можно отправить кому угодно, а сам
 * список остаётся серверным компонентом и не тянет данные на клиент.
 */

export type TaskFilterValues = {
  q: string
  language: string
  difficulty: string
  tag: string
  company: string
  topic: string
  status: string
}

type TaskFiltersProps = {
  values: TaskFilterValues
  topics: Array<{ slug: string; title: string }>
  total: number
}

const STATUS_OPTIONS = [
  { label: 'Все', value: '' },
  { label: 'Не решённые', value: 'todo' },
  { label: 'Решённые', value: 'solved' },
] as const

export function TaskFilters({ values, topics, total }: TaskFiltersProps) {
  const router = useRouter()
  const pathname = usePathname()
  const searchParams = useSearchParams()
  const [isPending, startTransition] = useTransition()
  const [query, setQuery] = useState(values.q)
  const [syncedQuery, setSyncedQuery] = useState(values.q)

  // Поле ввода следует за адресной строкой (кнопка «Сбросить», переход назад).
  // Подстройка идёт в фазе рендера — эффект здесь дал бы лишний проход и
  // мигание старого значения.
  if (syncedQuery !== values.q) {
    setSyncedQuery(values.q)
    setQuery(values.q)
  }

  const apply = useCallback(
    (key: keyof TaskFilterValues, value: string) => {
      const next = new URLSearchParams(searchParams.toString())
      if (value) next.set(key, value)
      else next.delete(key)
      startTransition(() => {
        router.replace(next.size > 0 ? `${pathname}?${next}` : pathname, { scroll: false })
      })
    },
    [pathname, router, searchParams],
  )

  // Поиск применяется с задержкой: иначе каждый символ — это новый рендер
  // серверного списка.
  useEffect(() => {
    if (query === values.q) return
    const timer = setTimeout(() => apply('q', query.trim()), 350)
    return () => clearTimeout(timer)
  }, [apply, query, values.q])

  const hasFilters = Object.values(values).some((value) => value.length > 0)

  return (
    <div className="space-y-3">
      <div className="flex flex-wrap items-center gap-2">
        <div className="relative min-w-[200px] flex-1">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <input
            type="search"
            value={query}
            onChange={(event) => setQuery(event.target.value)}
            placeholder="Поиск по названию"
            aria-label="Поиск задач"
            className="h-10 w-full rounded-lg border border-border bg-card pl-9 pr-3 text-sm text-foreground outline-none transition-colors placeholder:text-muted-foreground focus:border-primary"
          />
        </div>

        <Select
          label="Язык"
          value={values.language}
          onChange={(value) => apply('language', value)}
          options={[{ label: 'Любой язык', value: '' }, ...LANGUAGE_OPTIONS]}
        />
        <Select
          label="Сложность"
          value={values.difficulty}
          onChange={(value) => apply('difficulty', value)}
          options={[{ label: 'Любая сложность', value: '' }, ...DIFFICULTY_OPTIONS]}
        />
        <Select
          label="Тема"
          value={values.topic}
          onChange={(value) => apply('topic', value)}
          options={[
            { label: 'Все темы', value: '' },
            ...topics.map((topic) => ({ label: topic.title, value: topic.slug })),
          ]}
        />
        <Select
          label="Тег"
          value={values.tag}
          onChange={(value) => apply('tag', value)}
          options={[{ label: 'Все теги', value: '' }, ...TAG_OPTIONS]}
        />
        <Select
          label="Компания"
          value={values.company}
          onChange={(value) => apply('company', value)}
          options={[{ label: 'Все компании', value: '' }, ...COMPANY_OPTIONS]}
        />
      </div>

      <div className="flex flex-wrap items-center gap-2">
        <div className="flex rounded-lg border border-border p-0.5">
          {STATUS_OPTIONS.map((option) => (
            <button
              key={option.value}
              type="button"
              onClick={() => apply('status', option.value)}
              aria-pressed={values.status === option.value}
              className={cn(
                'rounded-md px-3 py-1.5 text-xs font-medium transition-colors',
                values.status === option.value
                  ? 'bg-primary text-primary-foreground'
                  : 'text-muted-foreground hover:text-foreground',
              )}
            >
              {option.label}
            </button>
          ))}
        </div>

        {hasFilters && (
          <button
            type="button"
            onClick={() => startTransition(() => router.replace(pathname, { scroll: false }))}
            className="inline-flex items-center gap-1 rounded-lg border border-border px-2.5 py-1.5 text-xs text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
          >
            <X className="h-3.5 w-3.5" />
            Сбросить
          </button>
        )}

        <span className={cn('ml-auto text-xs text-muted-foreground', isPending && 'opacity-50')}>
          Найдено задач: {total}
        </span>
      </div>
    </div>
  )
}

function Select({
  label,
  value,
  onChange,
  options,
}: {
  label: string
  value: string
  onChange: (value: string) => void
  options: ReadonlyArray<{ readonly label: string; readonly value: string }>
}) {
  return (
    <select
      value={value}
      onChange={(event) => onChange(event.target.value)}
      aria-label={label}
      className="h-10 rounded-lg border border-border bg-card px-2 text-sm text-foreground outline-none transition-colors focus:border-primary"
    >
      {options.map((option) => (
        <option key={option.value} value={option.value}>
          {option.label}
        </option>
      ))}
    </select>
  )
}
