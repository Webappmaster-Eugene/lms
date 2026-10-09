import type { Metadata } from 'next'
import Link from 'next/link'
import { getPayload } from '@/lib/payload'
import { headers } from 'next/headers'
import { Code2, ArrowRight, ListFilter } from 'lucide-react'
import { getTrainerAccess } from '@/server/trainer-access'
import { collectAllPages } from '@/lib/paginate'

export const metadata: Metadata = {
  title: 'Тренажёр кода',
}

export default async function TrainerPage() {
  const payload = await getPayload()
  const headersList = await headers()
  const { user } = await payload.auth({ headers: headersList })
  const scope = await getTrainerAccess(payload, user)

  const topics = await collectAllPages(
    ({ page, limit }) =>
      payload.find({
        collection: 'trainer-topics',
        where: { isPublished: { equals: true }, ...(scope.admin ? {} : { id: { in: scope.browseTopicIds.length ? scope.browseTopicIds : [-1] } }) },
        sort: ['order', 'id'],
        page,
        limit,
      }),
    { label: 'темы тренажёра' },
  )

  // Задачи и прогресс по всем темам сразу: по паре запросов на тему страница
  // заметно тормозила на каталоге из десятка тем.
  const topicIds = topics.map((t) => t.id)
  const taskDocs =
    topicIds.length > 0
      ? await collectAllPages(
          ({ page, limit }) =>
            payload.find({
              collection: 'trainer-tasks',
              where: { topic: { in: topicIds }, isPublished: { equals: true }, ...(scope.admin ? {} : { id: { in: scope.browseTaskIds.length ? scope.browseTaskIds : [-1] } }) },
              select: { topic: true },
              depth: 0,
              sort: 'id',
              page,
              limit,
            }),
          { label: 'задачи тренажёра' },
        )
      : []
  const solvedDocs =
    user && taskDocs.length > 0
      ? await collectAllPages(
          ({ page, limit }) =>
            payload.find({
              collection: 'user-trainer-progress',
              where: {
                user: { equals: user.id },
                task: { in: taskDocs.map((t) => t.id) },
                isCompleted: { equals: true },
              },
              select: { task: true },
              depth: 0,
              sort: 'id',
              page,
              limit,
            }),
          { label: `решённые задачи пользователя ${user.id}` },
        )
      : []

  const idOf = (ref: unknown): string =>
    String(ref !== null && typeof ref === 'object' ? (ref as { id: unknown }).id : ref)
  const solved = new Set(solvedDocs.map((p) => idOf(p.task)))
  const stats = new Map<string, { total: number; done: number }>()
  for (const t of taskDocs) {
    const entry = stats.get(idOf(t.topic)) ?? { total: 0, done: 0 }
    entry.total += 1
    if (solved.has(String(t.id))) entry.done += 1
    stats.set(idOf(t.topic), entry)
  }

  const topicsWithStats = topics.map((topic) => {
    const { total = 0, done = 0 } = stats.get(String(topic.id)) ?? {}
    return { ...topic, totalTasks: total, completedTasks: done }
  })

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          <Code2 className="h-7 w-7 text-primary" />
          <h1 className="text-xl font-bold text-foreground sm:text-2xl">Тренажёр кода</h1>
        </div>

        <Link
          href="/trainer/tasks"
          className="inline-flex min-h-[38px] items-center gap-2 rounded-lg bg-primary px-3 text-sm font-medium text-primary-foreground transition-colors hover:bg-primary/90"
        >
          <ListFilter className="h-4 w-4" />
          Все задачи
        </Link>
      </div>

      <p className="text-muted-foreground">
        Задачи с реальных собеседований — на JavaScript и TypeScript. Решение проверяется тестами,
        за каждую решённую задачу начисляются баллы.
      </p>

      {scope.hasAccess && <section className="flex flex-wrap items-center justify-between gap-4 rounded-xl border border-border bg-card p-4">
        <div className="max-w-xl">
          <h2 className="font-semibold text-foreground">Режим собеседования</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Пригласите интервьюера по ссылке: общий редактор, запуск кода и консоль.
            Для комнаты с условием выберите «На собеседовании» на странице задачи.
          </p>
        </div>
        <Link href="/trainer/interview/new"
          className="inline-flex min-h-[38px] items-center rounded-lg border border-border px-3 text-sm font-medium hover:bg-accent">
          Создать комнату
        </Link>
      </section>}

      {topicsWithStats.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">
          {scope.mode === 'disabled' || !scope.hasAccess ? 'Доступ к тренажёру не назначен. Обратитесь к наставнику.' : 'Задачи скоро появятся'}
        </p>
      ) : (
        <div className="grid gap-4 sm:grid-cols-2">
          {topicsWithStats.map((topic) => {
            const progress = topic.totalTasks > 0
              ? Math.round((topic.completedTasks / topic.totalTasks) * 100)
              : 0

            return (
              <Link
                key={topic.id}
                href={`/trainer/${topic.slug}`}
                className="group flex flex-col gap-3 rounded-xl border border-border bg-card p-5 transition-colors hover:border-primary/50 hover:bg-accent/50"
              >
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-foreground group-hover:text-primary transition-colors">
                      {topic.title}
                    </h3>
                    {scope.catalogVisibility === 'catalog' && topic.description && (
                      <p className="mt-1 text-sm text-muted-foreground line-clamp-2">
                        {topic.description}
                      </p>
                    )}
                  </div>
                  <ArrowRight className="h-5 w-5 flex-shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
                </div>

                <div className="mt-auto space-y-2">
                  <div className="flex items-center justify-between text-xs text-muted-foreground">
                    <span>{topic.completedTasks}/{topic.totalTasks} задач</span>
                    <span>{progress}%</span>
                  </div>
                  <div className="h-1.5 rounded-full bg-muted">
                    <div
                      className="h-full rounded-full bg-primary transition-all"
                      style={{ width: `${progress}%` }}
                    />
                  </div>
                </div>
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
