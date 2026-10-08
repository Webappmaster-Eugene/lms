import Link from 'next/link'
import { ArrowRight, CheckCircle2, Lock } from 'lucide-react'

import type { NodeCourse } from './types'

/**
 * Курсы темы с действием для каждого: продолжить с конкретного урока, открыть
 * пройденный или узнать, что закрывает доступ. Общий для панели карты и
 * списка по этапам, чтобы ученик видел одно и то же в обоих видах.
 */
export function NodeCourseList({ courses }: { courses: NodeCourse[] }) {
  return (
    <ul className="space-y-3">
      {courses.map((course) => {
        const percent = course.totalLessons > 0 ? Math.round((course.completedLessons / course.totalLessons) * 100) : 0
        const isCompleted = course.totalLessons > 0 && course.completedLessons === course.totalLessons
        const isBlocked = course.blockedBy.length > 0
        const accessDenied = course.accessAllowed === false

        return (
          <li key={course.slug} className="rounded-lg border border-border bg-background p-3">
            <div className="flex items-start gap-2">
              {accessDenied ? (
                <Lock className="mt-0.5 h-4 w-4 shrink-0 text-muted-foreground" aria-label="Доступ не назначен" />
              ) : isCompleted ? (
                <CheckCircle2 className="mt-0.5 h-4 w-4 shrink-0 text-success" aria-label="Пройден" />
              ) : null}
              <Link
                href={`/courses/${course.slug}`}
                className="flex-1 text-sm font-medium text-foreground underline-offset-2 hover:underline"
              >
                {course.title}
              </Link>
              <span className="shrink-0 text-xs text-muted-foreground">
                {course.completedLessons}/{course.totalLessons}
              </span>
            </div>

            <div
              className="mt-2 h-1.5 w-full overflow-hidden rounded-full bg-secondary"
              role="progressbar"
              aria-valuenow={percent}
              aria-valuemin={0}
              aria-valuemax={100}
              aria-label={`Прогресс курса «${course.title}»`}
            >
              <div
                className={`h-full rounded-full ${isCompleted ? 'bg-success' : 'bg-primary'}`}
                style={{ width: `${percent}%` }}
              />
            </div>

            {accessDenied ? (
              <p className="mt-2 text-xs text-muted-foreground">Доступ к обучению не назначен. Программу курса можно посмотреть.</p>
            ) : course.nextLesson ? (
              <Link
                href={`/lessons/${course.nextLesson.slug}`}
                className="mt-2 inline-flex max-w-full items-center gap-1.5 rounded-md bg-primary px-3 py-1.5 text-xs font-medium text-primary-foreground hover:bg-primary/90"
              >
                <span className="truncate">
                  {course.completedLessons > 0 ? 'Продолжить' : 'Начать'}: {course.nextLesson.title}
                </span>
                <ArrowRight className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
              </Link>
            ) : null}
            {!accessDenied && isBlocked && <p className="mt-2 text-xs text-muted-foreground">Рекомендуем сначала пройти курсы: {course.blockedBy.join(', ')}</p>}
            {!accessDenied && course.accessibleLessons !== undefined && course.accessibleLessons < course.totalLessons && (
              <p className="mt-2 text-xs text-muted-foreground">Доступно {course.accessibleLessons} из {course.totalLessons} уроков</p>
            )}
          </li>
        )
      })}
    </ul>
  )
}
