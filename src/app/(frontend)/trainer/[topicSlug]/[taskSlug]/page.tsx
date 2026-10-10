import type { Metadata } from 'next'
import Link from 'next/link'
import { notFound } from 'next/navigation'
import { ArrowLeft, ArrowRight, ChevronLeft } from 'lucide-react'

import { getTrainerTaskPage } from '@/server/trainer/task-page'
import { TrainerWorkspace } from '@/components/trainer/TrainerWorkspace'
import { BookmarkButton } from '@/components/bookmarks/BookmarkButton'
import { findBookmarkId } from '@/lib/bookmarks'
import { TaskSidePanel } from '@/components/trainer/TaskSidePanel'
import { DIFFICULTY_LABELS, LANGUAGE_LABELS } from '@/lib/trainer/constants'
import { isTrainerLanguage, runtimeCases } from '@/lib/trainer/runtime-spec'
import { publicCases, normalizeCases, starterCodeFor, taskLanguages } from '@/lib/trainer/spec'
import { lexicalToMarkdown } from '@/lib/lexical'
import { cn } from '@/lib/utils'
import { collectAllPages } from '@/lib/paginate'
import { nextUnsolvedTask } from '@/lib/trainer/next-task'
import type { ClientProgress, ClientTaskSpec } from '@/lib/trainer/api'
import { TaskMetadata } from '@/components/trainer/TaskMetadata'
import type { TrainerDifficulty, TrainerLanguage } from '@/lib/trainer/types'

type Props = {
  params: Promise<{ topicSlug: string; taskSlug: string }>
}

const DIFFICULTY_CLASS: Record<TrainerDifficulty, string> = {
  easy: 'text-success',
  medium: 'text-warning',
  hard: 'text-destructive',
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { topicSlug, taskSlug } = await params
  const data = await getTrainerTaskPage(topicSlug, taskSlug)
  return { title: data?.task.title ?? 'Задача' }
}

export default async function TaskPage({ params }: Props) {
  const { topicSlug, taskSlug } = await params
  const data = await getTrainerTaskPage(topicSlug, taskSlug)
  if (!data) notFound()
  const { payload, user, scope, topic, task } = data

  // Соседи по теме — для навигации «предыдущая / следующая».
  const siblings = await collectAllPages(
    ({ page, limit }) =>
      payload.find({
        collection: 'trainer-tasks',
        where: { topic: { equals: topic.id }, isPublished: { equals: true }, ...(scope.admin ? {} : { id: { in: scope.accessibleTaskIds.length ? scope.accessibleTaskIds : [-1] } }) },
        sort: ['order', 'id'],
        select: { slug: true, title: true, order: true },
        page,
        limit,
      }),
    { label: `соседние задачи темы «${topic.slug}»` },
  )
  const currentIndex = siblings.findIndex((item) => item.id === task.id)
  const previous = currentIndex > 0 ? siblings[currentIndex - 1] : null
  const next = currentIndex >= 0 && currentIndex < siblings.length - 1
    ? siblings[currentIndex + 1]
    : null

  const solvedInTopic =
    user && siblings.length > 0
      ? await collectAllPages(
          ({ page, limit }) =>
            payload.find({
              collection: 'user-trainer-progress',
              where: {
                user: { equals: user.id },
                task: { in: siblings.map((t) => t.id) },
                isCompleted: { equals: true },
              },
              select: { task: true },
              depth: 0,
              sort: 'id',
              page,
              limit,
            }),
          { label: `решённые задачи темы «${topic.slug}»` },
        )
      : []
  const solvedIds = new Set(
    solvedInTopic.map((p) => String(typeof p.task === 'object' && p.task ? p.task.id : p.task)),
  )
  const nextOpen = nextUnsolvedTask(siblings, task.id, solvedIds)

  let progress: ClientProgress = {
    isCompleted: false,
    attempts: 0,
    failedAttempts: 0,
    savedCode: null,
    savedLanguage: null,
  }

  if (user) {
    const records = await payload.find({
      collection: 'user-trainer-progress',
      where: { user: { equals: user.id }, task: { equals: task.id } },
      limit: 1,
    })
    const record = records.docs[0]
    if (record) {
      progress = {
        isCompleted: record.isCompleted === true,
        attempts: record.attempts ?? 0,
        failedAttempts: record.failedAttempts ?? 0,
        savedCode: record.userCode ?? null,
        savedLanguage: isTrainerLanguage(record.language) ? record.language : null,
      }
    }
  }

  const languages = taskLanguages(task)
  const starters: Partial<Record<TrainerLanguage, string>> = {}
  for (const language of languages) starters[language] = starterCodeFor(task, language)

  const allCases = task.checkMode === 'unit' ? safeCases(task) : []
  const visibleCases = task.checkMode === 'unit' ? publicCases(task) : []
  const usesRuntime = task.checkMode === 'program' || task.checkMode === 'dom'

  const clientTask: ClientTaskSpec = {
    id: String(task.id),
    slug: task.slug,
    topicSlug,
    title: task.title,
    difficulty: (task.difficulty ?? 'easy') as TrainerDifficulty,
    checkMode: task.checkMode ?? 'stdout',
    languages,
    entryName: task.entryName ?? '',
    setupCode: task.setupCode ?? '',
    testCode: task.testCode ?? '',
    publicCases: visibleCases,
    runtimeCases: usesRuntime ? runtimeCases(task, true) : [],
    hiddenCaseCount: usesRuntime ? (task.runtimeCases ?? []).filter((item) => item.hidden).length : allCases.length - visibleCases.length,
    timeLimitMs: task.timeLimitMs ?? 5000,
    starters,
    pointsReward: task.pointsReward ?? 10,
  }

  // Старые задачи хранят условие в Lexical, новые — в Markdown.
  const description =
    task.descriptionMd?.trim() ||
    (task.description ? lexicalToMarkdown(task.description) : '')

  const bookmarkId = user ? await findBookmarkId(payload, user.id, { task: task.id }) : null

  const hints = Array.isArray(task.hints)
    ? task.hints.map((item, index) => ({ hint: String(item?.hint ?? ''), id: item?.id ?? String(index) }))
    : []

  return (
    <div className="flex flex-col gap-4">
      <div className="flex flex-wrap items-center gap-2 text-sm text-muted-foreground">
        <Link href="/trainer" className="transition-colors hover:text-foreground">
          Тренажёр
        </Link>
        <span>/</span>
        <Link
          href={`/trainer/${topicSlug}`}
          className="flex items-center gap-1 transition-colors hover:text-foreground"
        >
          <ChevronLeft className="h-3 w-3" />
          {topic.title}
        </Link>
      </div>

      <div className="flex flex-wrap items-start justify-between gap-3">
        <div className="min-w-0">
          <h1 className="text-2xl font-bold text-foreground">{task.title}</h1>
          <div className="mt-2 flex flex-wrap items-center gap-2 text-xs">
            <span className={cn('font-medium', DIFFICULTY_CLASS[clientTask.difficulty])}>
              {DIFFICULTY_LABELS[clientTask.difficulty]}
            </span>
            <span className="text-muted-foreground">+{clientTask.pointsReward} XP</span>
            {languages.map((language) => (
              <span key={language} className="rounded bg-muted px-1.5 py-0.5 text-muted-foreground">
                {LANGUAGE_LABELS[language]}
              </span>
            ))}
          </div>
          <TaskMetadata task={task} className="mt-3" />
        </div>

        <div className="flex shrink-0 items-center gap-2">
          <Link href={`/trainer/interview/new?taskId=${clientTask.id}`}
            className="inline-flex min-h-[38px] items-center rounded-lg border border-border px-3 text-sm font-medium transition-colors hover:bg-accent">
            На собеседовании
          </Link>
          {user && <BookmarkButton target={{ task: task.id }} initialId={bookmarkId} />}
          {previous && (
            <Link
              href={`/trainer/${topicSlug}/${previous.slug}`}
              className="inline-flex min-h-[38px] items-center gap-1 rounded-lg border border-border px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              <ArrowLeft className="h-4 w-4" />
              Назад
            </Link>
          )}
          {next && (
            <Link
              href={`/trainer/${topicSlug}/${next.slug}`}
              className="inline-flex min-h-[38px] items-center gap-1 rounded-lg border border-border px-3 text-sm text-muted-foreground transition-colors hover:bg-accent hover:text-foreground"
            >
              Далее
              <ArrowRight className="h-4 w-4" />
            </Link>
          )}
        </div>
      </div>

      {/* min-w-0 обязателен: без него колонка растягивается под самый широкий
          блок кода и на узком экране страница уезжает вбок */}
      <div className="grid min-w-0 gap-4 lg:h-[calc(100vh-14rem)] lg:min-h-[560px] lg:grid-cols-[minmax(0,5fr)_minmax(0,7fr)]">
        <div className="min-h-[320px] min-w-0 lg:h-full lg:min-h-0">
          <TaskSidePanel
            taskId={clientTask.id}
            descriptionMd={description}
            hints={hints}
            publicCases={visibleCases}
            runtimeCases={clientTask.runtimeCases}
            hiddenCaseCount={clientTask.hiddenCaseCount}
            testCode={clientTask.testCode}
            entryName={clientTask.entryName}
            languages={languages}
            checkMode={clientTask.checkMode}
          />
        </div>

        <div className="min-w-0 lg:h-full lg:min-h-0">
          <TrainerWorkspace
            task={clientTask}
            progress={progress}
            nextTask={nextOpen ? { href: `/trainer/${topicSlug}/${nextOpen.slug}`, title: nextOpen.title } : null}
            topicHref="/trainer"
          />
        </div>
      </div>
    </div>
  )
}

/**
 * Кейсы задачи без падения страницы.
 *
 * Если задача настроена неправильно (например, у кейса нет ожидаемого
 * значения), нормализация бросает исключение. Ронять из-за этого всю страницу
 * не нужно: вердикт всё равно даёт сервер, а он ответит внятной ошибкой.
 */
function safeCases(task: Parameters<typeof normalizeCases>[0]) {
  try {
    return normalizeCases(task)
  } catch {
    return []
  }
}
