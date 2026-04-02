import type { Metadata } from 'next'
import Link from 'next/link'
import { getPayload } from '@/lib/payload'
import { headers } from 'next/headers'
import { notFound } from 'next/navigation'
import { ArrowLeft, ArrowRight, CheckCircle2, Circle } from 'lucide-react'

type Props = {
  params: Promise<{ topicSlug: string }>
}

export async function generateMetadata({ params }: Props): Promise<Metadata> {
  const { topicSlug } = await params
  const payload = await getPayload()
  const topics = await payload.find({
    collection: 'trainer-topics',
    where: { slug: { equals: topicSlug } },
    limit: 1,
  })
  const topic = topics.docs[0]
  return { title: topic?.title ?? 'Тема' }
}

export default async function TopicTasksPage({ params }: Props) {
  const { topicSlug } = await params
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
      topic: { equals: topic.id },
      isPublished: { equals: true },
    },
    sort: 'order',
    limit: 100,
  })

  // Прогресс пользователя
  let completedTaskIds = new Set<string>()
  if (user && tasks.docs.length > 0) {
    const taskIds = tasks.docs.map((t) => String(t.id))
    const progress = await payload.find({
      collection: 'user-trainer-progress',
      where: {
        user: { equals: user.id },
        task: { in: taskIds },
        isCompleted: { equals: true },
      },
      limit: 500,
    })
    completedTaskIds = new Set(
      progress.docs.map((p) =>
        String(typeof p.task === 'object' ? p.task.id : p.task),
      ),
    )
  }

  const difficultyLabels: Record<string, { label: string; color: string }> = {
    easy: { label: 'Лёгкая', color: 'text-success' },
    medium: { label: 'Средняя', color: 'text-warning' },
    hard: { label: 'Сложная', color: 'text-destructive' },
  }

  return (
    <div className="mx-auto max-w-3xl space-y-6">
      {/* Breadcrumb */}
      <div className="flex items-center gap-2 text-sm text-muted-foreground">
        <Link href="/trainer" className="hover:text-foreground transition-colors flex items-center gap-1">
          <ArrowLeft className="h-4 w-4" />
          Тренажёр
        </Link>
        <span>/</span>
        <span className="text-foreground">{topic.title}</span>
      </div>

      <div>
        <h1 className="text-2xl font-bold text-foreground">{topic.title}</h1>
        {topic.description && (
          <p className="mt-2 text-muted-foreground">{topic.description}</p>
        )}
        <p className="mt-2 text-sm text-muted-foreground">
          Решено: {completedTaskIds.size}/{tasks.docs.length}
        </p>
      </div>

      {tasks.docs.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">Задачи скоро появятся</p>
      ) : (
        <div className="space-y-2">
          {tasks.docs.map((task) => {
            const isCompleted = completedTaskIds.has(String(task.id))
            const diff = difficultyLabels[task.difficulty ?? 'easy'] ?? difficultyLabels.easy

            return (
              <Link
                key={task.id}
                href={`/trainer/${topicSlug}/${task.slug}`}
                className="group flex items-center gap-4 rounded-xl border border-border bg-card p-4 transition-colors hover:border-primary/50 hover:bg-accent/50"
              >
                {isCompleted ? (
                  <CheckCircle2 className="h-5 w-5 flex-shrink-0 text-success" />
                ) : (
                  <Circle className="h-5 w-5 flex-shrink-0 text-muted-foreground" />
                )}

                <div className="flex-1 min-w-0">
                  <p className="font-medium text-foreground truncate group-hover:text-primary transition-colors">
                    {task.title}
                  </p>
                </div>

                <span className={`text-xs font-medium ${diff.color}`}>
                  {diff.label}
                </span>

                <span className="text-xs text-muted-foreground">
                  +{task.pointsReward ?? 10} XP
                </span>

                <ArrowRight className="h-4 w-4 flex-shrink-0 text-muted-foreground group-hover:text-primary transition-colors" />
              </Link>
            )
          })}
        </div>
      )}
    </div>
  )
}
