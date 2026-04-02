import type { Metadata } from 'next'
import Link from 'next/link'
import { getPayload } from '@/lib/payload'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { ArrowLeft } from 'lucide-react'
import { TrainerWorkspace } from '@/components/trainer/TrainerWorkspace'

type Props = {
  params: Promise<{ topicSlug: string; taskSlug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { taskSlug } = await params
  const payload = await getPayload()
  const tasks = await payload.find({
    collection: 'trainer-tasks',
    where: { slug: { equals: taskSlug } },
    limit: 1,
  })
  return { title: tasks.docs[0]?.title ?? 'Задача' }
}

export default async function TaskPage({ params }: Props) {
  const { topicSlug, taskSlug } = await params
  const payload = await getPayload()
  const headersList = await headers()
  const { user } = await payload.auth({ headers: headersList })

  // Загружаем тему
  const topics = await payload.find({
    collection: 'trainer-topics',
    where: { slug: { equals: topicSlug }, isPublished: { equals: true } },
    limit: 1,
  })
  const topic = topics.docs[0]
  if (!topic) notFound()

  // Загружаем задачу
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

  // Проверяем прогресс пользователя
  let isAlreadyCompleted = false
  if (user) {
    const progress = await payload.find({
      collection: 'user-trainer-progress',
      where: {
        user: { equals: user.id },
        task: { equals: task.id },
        isCompleted: { equals: true },
      },
      limit: 1,
    })
    isAlreadyCompleted = progress.totalDocs > 0
  }

  const hints = Array.isArray(task.hints)
    ? task.hints.map((h, i) => ({
        hint: typeof h === 'object' && h !== null && 'hint' in h ? String(h.hint) : '',
        id: String(i),
      }))
    : []

  const difficultyLabels: Record<string, string> = {
    easy: 'Лёгкая',
    medium: 'Средняя',
    hard: 'Сложная',
  }

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/trainer" className="hover:text-foreground transition-colors">
          Тренажёр
        </Link>
        <span>/</span>
        <Link
          href={`/trainer/${topicSlug}`}
          className="hover:text-foreground transition-colors flex items-center gap-1"
        >
          <ArrowLeft className="h-3 w-3" />
          {topic.title}
        </Link>
        <span>/</span>
        <span className="text-foreground">{task.title}</span>
      </div>

      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <h1 className="text-2xl font-bold text-foreground">{task.title}</h1>
          <div className="mt-2 flex items-center gap-3 text-sm text-muted-foreground">
            <span className={task.difficulty === 'hard' ? 'text-destructive' : task.difficulty === 'medium' ? 'text-warning' : 'text-success'}>
              {difficultyLabels[task.difficulty ?? 'easy']}
            </span>
            <span>+{task.pointsReward ?? 10} XP</span>
          </div>
        </div>
      </div>

      {/* Description */}
      <div className="rounded-xl border border-border bg-card p-5">
        <h2 className="text-sm font-semibold text-muted-foreground mb-2">Условие задачи</h2>
        {/* richText rendering - simplified for now */}
        <div className="prose prose-sm dark:prose-invert max-w-none">
          {typeof task.description === 'string' ? (
            <p>{task.description}</p>
          ) : task.description?.root?.children ? (
            <div>
              {(task.description.root.children as Array<{ children?: Array<{ text?: string }> }>).map((node, i) => (
                <p key={i}>
                  {node.children?.map((child, j) => (
                    <span key={j}>{child.text ?? ''}</span>
                  ))}
                </p>
              ))}
            </div>
          ) : (
            <p className="text-muted-foreground">Описание задачи</p>
          )}
        </div>
      </div>

      {/* Workspace */}
      <TrainerWorkspace
        taskId={String(task.id)}
        starterCode={task.starterCode ?? '// Ваш код здесь\n'}
        expectedOutput={task.expectedOutput ?? ''}
        hints={hints}
        isAlreadyCompleted={isAlreadyCompleted}
      />
    </div>
  )
}
