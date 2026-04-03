import type { Metadata } from 'next'
import Link from 'next/link'
import { getPayload } from '@/lib/payload'
import { headers } from 'next/headers'
import { Code2, ArrowRight } from 'lucide-react'

export const metadata: Metadata = {
  title: 'Тренажёр кода',
}

export default async function TrainerPage() {
  const payload = await getPayload()
  const headersList = await headers()
  const { user } = await payload.auth({ headers: headersList })

  const topics = await payload.find({
    collection: 'trainer-topics',
    where: { isPublished: { equals: true } },
    sort: 'order',
    limit: 100,
  })

  // Подсчитываем кол-во задач и прогресс для каждой темы
  const topicsWithStats = await Promise.all(
    topics.docs.map(async (topic) => {
      const tasks = await payload.find({
        collection: 'trainer-tasks',
        where: {
          topic: { equals: topic.id },
          isPublished: { equals: true },
        },
        limit: 0,
      })

      let completedCount = 0
      if (user) {
        const allTasks = await payload.find({
          collection: 'trainer-tasks',
          where: {
            topic: { equals: topic.id },
            isPublished: { equals: true },
          },
          limit: 500,
        })

        if (allTasks.totalDocs > 0) {
          const taskIds = allTasks.docs.map((t) => String(t.id))
          const completed = await payload.find({
            collection: 'user-trainer-progress',
            where: {
              user: { equals: user.id },
              task: { in: taskIds },
              isCompleted: { equals: true },
            },
            limit: 0,
          })
          completedCount = completed.totalDocs
        }
      }

      return {
        ...topic,
        totalTasks: tasks.totalDocs,
        completedTasks: completedCount,
      }
    }),
  )

  return (
    <div className="mx-auto max-w-4xl space-y-6">
      <div className="flex items-center gap-3">
        <Code2 className="h-7 w-7 text-primary" />
        <h1 className="text-xl font-bold text-foreground sm:text-2xl">Тренажёр кода</h1>
      </div>

      <p className="text-muted-foreground">
        Практикуйте JavaScript, решая задачи по темам. За каждую решённую задачу начисляются баллы.
      </p>

      {topicsWithStats.length === 0 ? (
        <p className="text-center text-muted-foreground py-12">
          Задачи скоро появятся
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
                    {topic.description && (
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
