import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { CheckCircle2, Circle } from 'lucide-react'
import type { Where } from 'payload'

import { getPayload } from '@/lib/payload'
import { TaskFilters, type TaskFilterValues } from '@/components/trainer/TaskFilters'
import { COMPANY_LABELS, DIFFICULTY_LABELS, TAG_LABELS } from '@/lib/trainer/constants'
import { taskLanguages } from '@/lib/trainer/spec'
import { cn } from '@/lib/utils'
import { collectAllPages } from '@/lib/paginate'
import type { TrainerCompany, TrainerTag } from '@/lib/trainer/constants'
import type { TrainerDifficulty } from '@/lib/trainer/types'

export const metadata: Metadata = {
  title: 'Все задачи тренажёра',
}

type Props = {
  searchParams: Promise<Record<string, string | string[] | undefined>>
}

const DIFFICULTY_CLASS: Record<TrainerDifficulty, string> = {
  easy: 'text-success',
  medium: 'text-warning',
  hard: 'text-destructive',
}

function readParam(
  params: Record<string, string | string[] | undefined>,
  key: string,
): string {
  const value = params[key]
  if (Array.isArray(value)) return value[0] ?? ''
  return value ?? ''
}

export default async function AllTasksPage({ searchParams }: Props) {
  const params = await searchParams
  const filters: TaskFilterValues = {
    q: readParam(params, 'q'),
    language: readParam(params, 'language'),
    difficulty: readParam(params, 'difficulty'),
    tag: readParam(params, 'tag'),
    company: readParam(params, 'company'),
    topic: readParam(params, 'topic'),
    status: readParam(params, 'status'),
  }

  const payload = await getPayload()
  const headersList = await headers()
  const { user } = await payload.auth({ headers: headersList })

  const topics = await collectAllPages(
    ({ page, limit }) =>
      payload.find({
        collection: 'trainer-topics',
        where: { isPublished: { equals: true } },
        sort: ['order', 'id'],
        select: { slug: true, title: true },
        page,
        limit,
      }),
    { label: 'темы тренажёра' },
  )

  const topicBySlug = new Map(topics.map((topic) => [topic.slug, topic]))
  const topicById = new Map(topics.map((topic) => [String(topic.id), topic]))

  const conditions: Where[] = [{ isPublished: { equals: true } }]
  if (filters.q) conditions.push({ title: { like: filters.q } })
  if (filters.difficulty) conditions.push({ difficulty: { equals: filters.difficulty } })
  if (filters.language) conditions.push({ languages: { contains: filters.language } })
  if (filters.tag) conditions.push({ tags: { contains: filters.tag } })
  if (filters.company) conditions.push({ companies: { contains: filters.company } })

  const selectedTopic = filters.topic ? topicBySlug.get(filters.topic) : undefined
  if (selectedTopic) conditions.push({ topic: { equals: selectedTopic.id } })

  const tasks = await collectAllPages(
    ({ page, limit }) =>
      payload.find({
        collection: 'trainer-tasks',
        where: { and: conditions },
        sort: ['topic', 'order', 'id'],
        page,
        limit,
      }),
    { label: 'каталог задач тренажёра' },
  )

  // Прогресс тянем одним запросом по найденным задачам, а не по каждой.
  let completedIds = new Set<string>()
  if (user && tasks.length > 0) {
    const progressDocs = await collectAllPages(
      ({ page, limit }) =>
        payload.find({
          collection: 'user-trainer-progress',
          where: {
            user: { equals: user.id },
            task: { in: tasks.map((task) => String(task.id)) },
            isCompleted: { equals: true },
          },
          select: { task: true },
          depth: 0,
          sort: 'id',
          page,
          limit,
        }),
      { label: `прогресс пользователя ${user.id} в тренажёре` },
    )
    completedIds = new Set(
      progressDocs.map((record) =>
        String(typeof record.task === 'object' && record.task !== null ? record.task.id : record.task),
      ),
    )
  }

  // Статус — единственный фильтр, который нельзя выразить запросом к задачам:
  // он живёт в другой коллекции и зависит от пользователя.
  const visible = tasks.filter((task) => {
    if (filters.status === 'solved') return completedIds.has(String(task.id))
    if (filters.status === 'todo') return !completedIds.has(String(task.id))
    return true
  })

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-foreground">Все задачи</h1>
          <p className="mt-1 text-sm text-muted-foreground">
            Задачи с реальных собеседований: JavaScript, TypeScript, алгоритмы
          </p>
        </div>
        <Link
          href="/trainer"
          className="inline-flex min-h-[38px] items-center rounded-lg border border-border px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
        >
          По темам
        </Link>
      </div>

      <TaskFilters values={filters} topics={topics} total={visible.length} />

      {visible.length === 0 ? (
        <p className="py-12 text-center text-muted-foreground">
          Под эти условия ничего не нашлось — попробуйте ослабить фильтры
        </p>
      ) : (
        <div className="overflow-hidden rounded-xl border border-border bg-card">
          <ul>
            {visible.map((task, index) => {
              const isCompleted = completedIds.has(String(task.id))
              const difficulty = (task.difficulty ?? 'easy') as TrainerDifficulty
              const topicId = typeof task.topic === 'object' && task.topic !== null
                ? String(task.topic.id)
                : String(task.topic)
              const topic = topicById.get(topicId)
              const tags = (task.tags ?? []) as TrainerTag[]
              const companies = (task.companies ?? []) as TrainerCompany[]

              if (!topic) return null

              return (
                <li key={task.id} className="border-b border-border last:border-b-0">
                  <Link
                    href={`/trainer/${topic.slug}/${task.slug}`}
                    className="group flex min-h-[52px] flex-wrap items-center gap-x-3 gap-y-1 px-3 py-2.5 transition-colors hover:bg-accent/50"
                  >
                    <span className="w-6 shrink-0 text-xs text-muted-foreground">{index + 1}</span>

                    {isCompleted ? (
                      <CheckCircle2 className="h-4 w-4 shrink-0 text-success" />
                    ) : (
                      <Circle className="h-4 w-4 shrink-0 text-muted-foreground/50" />
                    )}

                    <span className="min-w-[140px] flex-1 truncate text-sm font-medium text-foreground transition-colors group-hover:text-primary">
                      {task.title}
                    </span>

                    <span className="hidden text-xs text-muted-foreground sm:inline">
                      {topic.title}
                    </span>

                    <span className="flex shrink-0 gap-1">
                      {taskLanguages(task).map((language) => (
                        <span
                          key={language}
                          className="rounded bg-muted px-1.5 py-0.5 text-[11px] text-muted-foreground"
                        >
                          {language.toUpperCase()}
                        </span>
                      ))}
                    </span>

                    <span className="hidden shrink-0 gap-1 md:flex">
                      {companies.slice(0, 2).map((company) => (
                        <span
                          key={company}
                          className="rounded bg-info/10 px-1.5 py-0.5 text-[11px] text-info"
                        >
                          {COMPANY_LABELS[company] ?? company}
                        </span>
                      ))}
                      {tags.slice(0, 2).map((tag) => (
                        <span
                          key={tag}
                          className="rounded bg-primary/10 px-1.5 py-0.5 text-[11px] text-primary"
                        >
                          {TAG_LABELS[tag] ?? tag}
                        </span>
                      ))}
                    </span>

                    <span
                      className={cn('w-16 shrink-0 text-right text-xs font-medium', DIFFICULTY_CLASS[difficulty])}
                    >
                      {DIFFICULTY_LABELS[difficulty]}
                    </span>
                  </Link>
                </li>
              )
            })}
          </ul>
        </div>
      )}
    </div>
  )
}
