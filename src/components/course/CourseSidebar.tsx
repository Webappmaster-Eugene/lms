'use client'

import { useState, useEffect } from 'react'
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
  const [isOpen, setIsOpen] = useState(false)

  // Auto-expand секцию с текущим уроком
  const currentSectionId = sections.find((s) =>
    s.lessons.some((l) => l.id === currentLessonId),
  )?.id

  const [expandedSections, setExpandedSections] = useState<Set<string>>(
    new Set(currentSectionId ? [currentSectionId] : []),
  )

  // Lock body scroll when mobile sidebar is open
  useEffect(() => {
    if (isOpen) {
      const isLg = window.matchMedia('(min-width: 1024px)').matches
      if (!isLg) {
        document.body.style.overflow = 'hidden'
      }
    } else {
      document.body.style.overflow = ''
    }
    return () => {
      document.body.style.overflow = ''
    }
  }, [isOpen])

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
      {/* Toggle button for mobile — positioned above bottom nav */}
      <button
        onClick={() => setIsOpen(!isOpen)}
        className="fixed right-4 bottom-24 z-40 flex h-12 w-12 items-center justify-center rounded-full bg-card border border-border shadow-lg lg:hidden"
        aria-label={isOpen ? 'Скрыть содержание' : 'Показать содержание'}
      >
        {isOpen ? <PanelRightClose className="h-5 w-5" /> : <PanelRightOpen className="h-5 w-5" />}
      </button>

      {/* Mobile overlay */}
      {isOpen && (
        <div
          className="fixed inset-0 z-40 bg-black/50 lg:hidden"
          onClick={() => setIsOpen(false)}
        />
      )}

      {/* Sidebar */}
      <aside
        className={cn(
          'fixed right-0 top-16 z-50 h-[calc(100vh-4rem)] w-80 border-l border-border bg-card overflow-y-auto transition-transform duration-300 ease-in-out',
          'lg:sticky lg:top-0 lg:z-auto lg:h-auto lg:max-h-[calc(100vh-4rem)] lg:translate-x-0 lg:w-72 lg:rounded-xl lg:border',
          isOpen ? 'translate-x-0' : 'translate-x-full lg:translate-x-0',
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
            className="absolute right-2 top-2 flex h-10 w-10 items-center justify-center rounded-lg text-muted-foreground hover:text-foreground lg:hidden"
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
                  className="flex min-h-[44px] w-full items-center gap-2 rounded-lg px-3 py-2.5 text-sm font-medium text-foreground hover:bg-accent/50 transition-colors"
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
                          onClick={() => setIsOpen(false)}
                          className={cn(
                            'flex min-h-[44px] items-center gap-2 rounded-lg px-3 py-2 text-sm transition-colors',
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
