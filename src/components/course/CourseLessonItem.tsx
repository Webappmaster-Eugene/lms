import Link from 'next/link'
import { CheckCircle2, Circle, Clock, Lock } from 'lucide-react'

type Props = {
  lesson: { slug: string; title: string; estimatedMinutes?: number | null }
  isCompleted: boolean
  isNext: boolean
  accessAllowed: boolean
}

export function CourseLessonItem({ lesson, isCompleted, isNext, accessAllowed }: Props) {
  const content = (
    <>
      {!accessAllowed ? <Lock className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />
        : isCompleted ? <CheckCircle2 className="h-5 w-5 shrink-0 text-success" aria-hidden="true" />
          : <Circle className="h-5 w-5 shrink-0 text-muted-foreground" aria-hidden="true" />}
      <div className="min-w-0 flex-1">
        <p className="text-sm font-medium text-foreground">{lesson.title}</p>
        {!accessAllowed && <p className="mt-0.5 text-xs text-muted-foreground">Доступ к этому уроку не назначен</p>}
      </div>
      {accessAllowed && isNext && <span className="shrink-0 rounded-full bg-primary px-2 py-0.5 text-[11px] font-medium text-primary-foreground">Следующий</span>}
      {lesson.estimatedMinutes ? <span className="flex shrink-0 items-center gap-1 text-xs text-muted-foreground"><Clock className="h-3 w-3" aria-hidden="true" />{lesson.estimatedMinutes} мин</span> : null}
    </>
  )
  if (!accessAllowed) return <div className="flex items-center gap-3 rounded-lg px-4 py-3">{content}</div>
  return <Link href={`/lessons/${lesson.slug}`} aria-current={isNext ? 'step' : undefined} className={`flex items-center gap-3 rounded-lg px-4 py-3 transition-colors hover:bg-accent/50 focus-visible:outline-2 focus-visible:outline-ring ${isNext ? 'bg-primary/5 ring-1 ring-primary/40' : ''}`}>{content}</Link>
}
