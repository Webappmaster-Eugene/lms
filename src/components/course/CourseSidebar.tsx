'use client'

import { useState } from 'react'
import Link from 'next/link'
import { ChevronDown, CheckCircle2, Circle, PanelRightClose, PanelRightOpen } from 'lucide-react'
import { cn } from '@/lib/utils'

type Lesson = {
  id: string
  title: string
  slug: string
  order: number
}

type Section = {
  id: string
  title: string
  order: number
  lessons: Lesson[]
}

type CourseSidebarProps = {
  courseTitle: string
  sections: Section[]
  completedLessonIds: Set<string>
  currentLessonId?: string
  totalLessons: number
  totalCompleted: number
}

export function CourseSidebar({
  courseTitle,
  sections,
  completedLessonIds,
  currentLessonId,
  totalLessons,
  totalCompleted,
}: CourseSidebarProps) {
  const [isOpen, setIsOpen] = useState(true)

  // Auto-expand секцию с текущим уроком
  const currentSectionId = sections.find((s) =>
    s.lessons.some((l) => l.id === currentLessonId),
  )?.id

  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(currentSectionId ? [currentSectionId] : []),
  )

  const toggleSection = (sectionId: string) => {
    setExpandedSections((prev) => {
      const next = new Set(prev)
      if (next.has(sectionId)) {
        next.delete(sectionId)
      } else {
        next.add(sectionId)
      }
      return next
    })
  }

  const progress = totalLessons > 0 ? Math.round((totalCompleted / totalLessons) * 100) : 0

  return (
    <>
      {/* Toggle button for mobile */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed right-4 top-20 z-30 flex h-10 w-10 items-center justify-center rounded-lg bg-card border border-border shadow-sm lg:hidden"
        aria-label={isOpen ? 'Скрыть содержание' : 'Показать содержание'}
      >
        {isOpen ? <PanelRightClose className="h-5 w-5" /> : <PanelRightOpen className="h-5 w-5" />}
      </button>

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed right-0 top-0 z-20 h-full w-80 border-l border-border bg-card overflow-y-auto transition-transform lg:sticky lg:top-0 lg:h-auto lg:max-h-[calc(100vh-4rem)] lg:translate-x-0 lg:w-72 lg:rounded-xl lg:border',
          isOpen ? 'translate-x-0' : 'translate-x-full',
        )}
      >
        {/* Header */}
        <div className="sticky top-0 border-b border-border bg-card p-4 z-10">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs font-medium text-primary">{progress}%</span>
            <span className="text-xs text-muted-foreground">
              {totalCompleted}/{totalLessons}
            </span>
          </div>
          <div className="h-1.5 rounded-full bg-muted">
            <div
              className="h-full rounded-full bg-primary transition-all"
              style={{ width: `${progress}%` }}
            />
          </div>
          <button
            onClick={() => setIsOpen(false)}
            className="absolute right-2 top-2 p-1 text-muted-foreground hover:text-foreground lg:hidden"
          >
            <PanelRightClose className="h-4 w-4" />
          </button>
        </div>

        {/* Sections */}
        <div className="p-2">
          {sections.map((section) => {
            const isExpanded = expandedSections.has(section.id)
            const sectionCompleted = section.lessons.filter((l) =>
              completedLessonIds.has(l.id),
            ).length

            return (
              <div key={section.id} className="mb-1">
                <button
                  onClick={() => toggleSection(section.id)}
                  className="flex w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground hover:bg-accent/50 transition-colors"
                >
                  <ChevronDown
                    className={cn(
                      'h-4 w-4 flex-shrink-0 text-muted-foreground transition-transform',
                      !isExpanded && '-rotate-90',
                    )}
                  />
                  <span className="flex-1 text-left truncate">{section.title}</span>
                  <span
                    className={cn(
                      'text-xs font-medium rounded-full px-2 py-0.5',
                      sectionCompleted === section.lessons.length && section.lessons.length > 0
                        ? 'bg-success/10 text-success'
                        : 'bg-muted text-muted-foreground',
                    )}
                  >
                    {sectionCompleted}/{section.lessons.length}
                  </span>
                </button>

                {isExpanded && (
                  <div className="ml-4 space-y-0.5 pb-1">
                    {section.lessons.map((lesson) => {
                      const isCompleted = completedLessonIds.has(lesson.id)
                      const isCurrent = lesson.id === currentLessonId

                      return (
                        <Link
                          key={lesson.id}
                          href={`/lessons/${lesson.slug}`}
                          className={cn(
                            'flex items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
                            isCurrent
                              ? 'bg-primary/10 text-primary font-medium'
                              : 'text-muted-foreground hover:text-foreground hover:bg-accent/50',
                          )}
                        >
                          {isCompleted ? (
                            <CheckCircle2 className="h-4 w-4 flex-shrink-0 text-success" />
                          ) : (
                            <Circle className="h-4 w-4 flex-shrink-0" />
                          )}
                          <span className="truncate">{lesson.title}</span>
                        </Link>
                      )
                    })}
                  </div>
                )}
              </div>
            )
          })}
        </div>
      </aside>
    </>
  )
}
