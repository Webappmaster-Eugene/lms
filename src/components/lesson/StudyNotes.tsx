'use client'

import { createContext, useContext } from 'react'
import { BookOpenText } from 'lucide-react'

import { LessonMarkdown } from './LessonMarkdown'

export const STUDY_NOTES_ANCHOR = 'konspekt'

const StudyNotesContext = createContext(false)

/** Есть ли у урока конспект: плеер тогда предлагает прочитать его вместо видео. */
export const StudyNotesProvider = StudyNotesContext.Provider

export function StudyNotesLink() {
  if (!useContext(StudyNotesContext)) return null
  return (
    <a
      href={`#${STUDY_NOTES_ANCHOR}`}
      className="inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
    >
      <BookOpenText aria-hidden="true" className="h-4 w-4" />
      Читать конспект
    </a>
  )
}

/**
 * Конспект урока: тот же Markdown, что у методичек, но со своими якорями.
 * Ссылка «Читать конспект» ведёт к первому; у следующих свои id, чтобы они не повторялись.
 */
export function StudyNotesSection({ markdown, ordinal = 1 }: { markdown: string; ordinal?: number }) {
  const anchor = ordinal <= 1 ? STUDY_NOTES_ANCHOR : `${STUDY_NOTES_ANCHOR}${ordinal}`
  return (
    <section id={anchor} aria-labelledby={`${anchor}-title`} className="scroll-mt-20 space-y-4">
      <h2 id={`${anchor}-title`} className="flex items-center gap-2 text-lg font-semibold text-foreground sm:text-xl">
        <BookOpenText aria-hidden="true" className="h-5 w-5 text-muted-foreground" />
        Конспект урока
      </h2>
      <LessonMarkdown markdown={markdown} anchorPrefix={anchor} />
    </section>
  )
}
