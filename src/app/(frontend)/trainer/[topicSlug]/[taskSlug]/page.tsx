import type { Metadata } from 'next'
import Link from 'next/link'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { ArrowLeft, ArrowRight, ChevronLeft } from 'lucide-react'

import { getPayload } from '@/lib/payload'
import { TrainerWorkspace } from '@/components/trainer/TrainerWorkspace'
import { TaskSidePanel } from '@/components/trainer/TaskSidePanel'
import { DIFFICULTY_LABELS, COMPANY_LABELS, TAG_LABELS } from '@/lib/trainer/constants'
import { publicCases, normalizeCases, starterCodeFor, taskLanguages } from '@/lib/trainer/spec'
import { lexicalToMarkdown } from '@/lib/lexical'
import { cn } from '@/lib/utils'
import type { ClientProgress, ClientTaskSpec } from '@/lib/trainer/api'
import type { TrainerCompany, TrainerTag } from '@/lib/trainer/constants'
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
  const payload = await getPayload()

  // Условие совпадает с тем, по которому страница ищет задачу: иначе у
  // несуществующего адреса вида /trainer/чужая-тема/задача заголовок
  // подставлялся бы правильный, а страница отдавала 404.
  const topics = await payload.find({
    collection: 'trainer-topics',
    where: { slug: { equals: topicSlug }, isPublished: { equals: true } },
    limit: 1,
    select: { slug: true },
  })
  const topic = topics.docs[0]
  if (!topic) return { title: 'Задача' }

  const tasks = await payload.find({
    collection: 'trainer-tasks',
    where: {
      slug: { equals: taskSlug },
      topic: { equals: topic.id },
      isPublished: { equals: true },
    },
    limit: 1,
    select: { title: true },
  })

  return { title: tasks.docs[0]?.title ?? 'Задача' }
}

export default async function TaskPage({ params }: Props) {
  const { topicSlug, taskSlug } = await params
  const payload = await getPayload()
  const headersList = await headers()
  const { user } = await payload.auth({ headers: headersList })

  const topics = await payload.find({
    collection: 'trainer-topics',
    where: { slug: { equals: topicSlug }, isPublished: { equals: true } },
    limit: 1,
  })
  const topic = topics.docs[0]
  if (!topic) notFound()

  const tasks = await payload.find({
    collection: 'trainer-tasks',
    where: {
      slug: { equals: taskSlug },
      topic: { equals: topic.id },
      isPublished: { equals: true },
    },
    limit: 1,
  })
  const task = tasks.docs[0]
  if (!task) notFound()

  // Соседи по теме — для навигации «предыдущая / следующая».
  const siblings = await payload.find({
    collection: 'trainer-tasks',
    where: { topic: { equals: topic.id }, isPublished: { equals: true } },
    sort: 'order',
    limit: 500,
    select: { slug: true, title: true, order: true },
  })
  const currentIndex = siblings.docs.findIndex((item) => item.id === task.id)
  const previous = currentIndex > 0 ? siblings.docs[currentIndex - 1] : null
  const next = currentIndex >= 0 && currentIndex < siblings.docs.length - 1
    ? siblings.docs[currentIndex + 1]
    : null

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
        savedLanguage: record.language === 'ts' ? 'ts' : record.language === 'js' ? 'js' : null,
      }
    }
  }

  const languages = taskLanguages(task)
  const starters: Partial<Record<TrainerLanguage, string>> = {}
  for (const language of languages) starters[language] = starterCodeFor(task, language)

  const allCases = safeCases(task)
  const visibleCases = publicCases(task)

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
    hiddenCaseCount: allCases.length - visibleCases.length,
    timeLimitMs: task.timeLimitMs ?? 5000,
    starters,
    pointsReward: task.pointsReward ?? 10,
  }

  // Старые задачи хранят условие в Lexical, новые — в Markdown.
  const description =
    task.descriptionMd?.trim() ||
    (task.description ? lexicalToMarkdown(task.description) : '')

  const hints = Array.isArray(task.hints)
    ? task.hints.map((item, index) => ({ hint: String(item?.hint ?? ''), id: item?.id ?? String(index) }))
    : []

  const tags = (task.tags ?? []) as TrainerTag[]
  const companies = (task.companies ?? []) as TrainerCompany[]

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
                {language === 'ts' ? 'TypeScript' : 'JavaScript'}
              </span>
            ))}
            {tags.map((tag) => (
              <span key={tag} className="rounded bg-primary/10 px-1.5 py-0.5 text-primary">
                {TAG_LABELS[tag] ?? tag}
              </span>
            ))}
            {companies.map((company) => (
              <span key={company} className="rounded bg-info/10 px-1.5 py-0.5 text-info">
                {COMPANY_LABELS[company] ?? company}
              </span>
            ))}
            {task.leetcodeNumber ? (
              <span className="text-muted-foreground">LeetCode #{task.leetcodeNumber}</span>
            ) : null}
          </div>
        </div>

        <div className="flex shrink-0 items-center gap-2">
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
            hiddenCaseCount={clientTask.hiddenCaseCount}
            testCode={clientTask.testCode}
            entryName={clientTask.entryName}
            languages={languages}
            checkMode={clientTask.checkMode}
          />
        </div>

        <div className="min-w-0 lg:h-full lg:min-h-0">
          <TrainerWorkspace task={clientTask} progress={progress} />
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
