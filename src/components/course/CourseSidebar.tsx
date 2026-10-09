'use client'

import { useId, useState } from 'react'
import Link from 'next/link'
import { BookOpen, ChevronDown, ChevronRight, CheckCircle2, Circle } from 'lucide-react'
import { cn } from '@/lib/utils'
import { MobileSheet } from '@/components/layout/MobileSheet'

type Lesson = { id: string; title: string; slug: string; order: number }
type Section = { id: string; title: string; order: number; lessons: Lesson[] }
type CourseSidebarProps = {
  courseTitle: string
  sections: Section[]
  completedLessonIds: Set<string>
  currentLessonId?: string
  totalLessons: number
  totalCompleted: number
  assignedOnly?: boolean
}

export function CourseSidebar({ courseTitle, sections, completedLessonIds, currentLessonId, totalLessons, totalCompleted, assignedOnly = false }: CourseSidebarProps) {
  const [isOpen, setIsOpen] = useState(false)
  const panelId = useId()
  const currentSectionId = sections.find((section) => section.lessons.some((lesson) => lesson.id === currentLessonId))?.id
  const [expandedSections, setExpandedSections] = useState<Set<string>>(new Set(currentSectionId ? [currentSectionId] : []))
  const progress = totalLessons > 0 ? Math.min(100, Math.max(0, Math.round(totalCompleted / totalLessons * 100))) : 0

  function toggleSection(sectionId: string) {
    setExpandedSections((previous) => {
      const next = new Set(previous)
      if (next.has(sectionId)) next.delete(sectionId)
      else next.add(sectionId)
      return next
    })
  }

  const contents = (mobile: boolean) => (
    <>
      <div className="border-b border-border p-4">
        <p className="mb-3 break-words text-sm font-semibold text-foreground">{courseTitle}</p>
        <div className="mb-2 flex items-center justify-between gap-3 text-xs">
          <span className="font-medium text-primary">{progress}%</span>
          <span className="text-muted-foreground">{totalCompleted}/{totalLessons} уроков</span>
        </div>
        <div role="progressbar" aria-label={assignedOnly ? 'Прогресс назначенных уроков' : 'Прогресс курса'} aria-valuenow={progress} aria-valuemin={0} aria-valuemax={100} className="h-1.5 overflow-hidden rounded-full bg-muted">
          <div className="h-full rounded-full bg-primary" style={{ width: `${progress}%` }} />
        </div>
      </div>
      <nav aria-label="Уроки курса" className="p-2">
        {sections.map((section) => {
          const expanded = expandedSections.has(section.id)
          const completed = section.lessons.filter((lesson) => completedLessonIds.has(lesson.id)).length
          const sectionId = `${panelId}-${mobile ? 'mobile' : 'desktop'}-${section.id}`
          return (
            <div key={section.id} className="mb-1">
              <button
                type="button"
                onClick={() => toggleSection(section.id)}
                aria-expanded={expanded}
                aria-controls={expanded ? sectionId : undefined}
                className="flex min-h-11 w-full items-start gap-2 rounded-lg px-3 py-3 text-sm font-medium text-foreground transition-colors hover:bg-accent/50 focus-visible:outline-2 focus-visible:outline-ring"
              >
                <ChevronDown aria-hidden="true" className={cn('mt-0.5 h-4 w-4 shrink-0 text-muted-foreground', !expanded && '-rotate-90')} />
                <span className="min-w-0 flex-1 break-words text-left leading-5">{section.title}</span>
                <span className={cn('shrink-0 rounded-full px-2 py-0.5 text-xs font-medium', completed === section.lessons.length && completed > 0 ? 'bg-success/10 text-success' : 'bg-muted text-muted-foreground')}>{completed}/{section.lessons.length}</span>
              </button>
              {expanded && (
                <div id={sectionId} className="ml-3 space-y-0.5 pb-1">
                  {section.lessons.map((lesson) => {
                    const done = completedLessonIds.has(lesson.id)
                    const current = lesson.id === currentLessonId
                    return (
                      <Link
                        key={lesson.id}
                        href={`/lessons/${lesson.slug}`}
                        aria-current={current ? 'page' : undefined}
                        onClick={() => setIsOpen(false)}
                        className={cn('flex min-h-11 items-start gap-2 rounded-lg px-3 py-3 text-sm transition-colors focus-visible:outline-2 focus-visible:outline-ring', current ? 'bg-primary/10 font-medium text-primary' : 'text-muted-foreground hover:bg-accent/50 hover:text-foreground')}
                      >
                        {done ? <CheckCircle2 aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0 text-success" /> : <Circle aria-hidden="true" className="mt-0.5 h-4 w-4 shrink-0" />}
                        <span className="min-w-0 break-words leading-5">{lesson.title}</span>
                        {done && <span className="sr-only"> — пройден</span>}
                      </Link>
                    )
                  })}
                </div>
              )}
            </div>
          )
        })}
      </nav>
    </>
  )

  return (
    <div className="order-first min-w-0 lg:order-last lg:w-72 lg:shrink-0">
      <button
        type="button"
        onClick={() => setIsOpen(true)}
        aria-label="Показать содержание"
        aria-haspopup="dialog"
        aria-expanded={isOpen}
        aria-controls={isOpen ? panelId : undefined}
        className="flex min-h-12 w-full items-center gap-3 rounded-xl border border-border bg-card px-4 py-3 text-left text-sm font-medium focus-visible:outline-2 focus-visible:outline-ring lg:hidden"
      >
        <BookOpen aria-hidden="true" className="h-5 w-5 shrink-0" />
        <span className="min-w-0 flex-1">{assignedOnly ? 'Назначенные уроки' : 'Содержание курса'}</span>
        <span className="shrink-0 text-xs text-muted-foreground">{totalCompleted}/{totalLessons}</span>
        <ChevronRight aria-hidden="true" className="h-4 w-4 shrink-0 text-muted-foreground" />
      </button>
      <MobileSheet id={panelId} title="Содержание курса" open={isOpen} onClose={() => setIsOpen(false)}>{contents(true)}</MobileSheet>
      <aside aria-label="Содержание курса" className="hidden overflow-y-auto rounded-xl border border-border bg-card lg:sticky lg:top-20 lg:block lg:max-h-[calc(100dvh-6rem)]">{contents(false)}</aside>
    </div>
  )
}
