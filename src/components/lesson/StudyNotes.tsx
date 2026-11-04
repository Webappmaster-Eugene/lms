'use client'

import { createContext, useContext, useEffect, useId, useMemo, useRef, useState } from 'react'
import { BookOpenText, ChevronDown } from 'lucide-react'

import { lessonMarkdownOutline } from '@/lib/lesson-markdown'
import { lessonNotesReadingMinutes } from '@/lib/lesson-notes'
import { pluralize } from '@/lib/utils'
import { LessonMarkdown } from './LessonMarkdown'

export const STUDY_NOTES_ANCHOR = 'konspekt'
/** Ссылка стоит вне секции, а повторный клик по тому же якорю hashchange не даёт. */
const OPEN_EVENT = 'lms:study-notes-open'

const StudyNotesContext = createContext(false)

/** Есть ли у урока конспект: плеер тогда предлагает прочитать его вместо видео. */
export const StudyNotesProvider = StudyNotesContext.Provider

/** Конспект один на урок, поэтому и вход к нему один: в шапке урока. */
export function StudyNotesAnchor() {
  return (
    <a
      href={`#${STUDY_NOTES_ANCHOR}`}
      onClick={() => window.dispatchEvent(new Event(OPEN_EVENT))}
      className="inline-flex min-h-[44px] items-center gap-2 text-sm font-medium text-foreground underline-offset-2 hover:underline focus-visible:outline-2 focus-visible:outline-ring"
    >
      <BookOpenText aria-hidden="true" className="h-4 w-4" />
      Читать конспект
    </a>
  )
}

/** Для сообщения об отказе видео: там конспект заменяет недоступную запись. */
export function StudyNotesLink() {
  return useContext(StudyNotesContext) ? <StudyNotesAnchor /> : null
}

/** Адрес ведёт в этот конспект: на него самого или на раздел внутри. */
function hashTargets(hash: string, anchor: string): boolean {
  return hash === `#${anchor}` || hash.startsWith(`#${anchor}-`)
}

/**
 * Конспект урока свёрнут, пока ученик его не откроет. Свёрнутый текст остаётся на странице:
 * поиск браузера находит его и раскрывает. Схемы и подсветка кода грузятся только после открытия.
 * Ссылка «Читать конспект» ведёт к первому; у следующих свои id, чтобы они не повторялись.
 */
export function StudyNotesSection({ markdown, ordinal = 1 }: { markdown: string; ordinal?: number }) {
  const anchor = ordinal <= 1 ? STUDY_NOTES_ANCHOR : `${STUDY_NOTES_ANCHOR}${ordinal}`
  const [open, setOpen] = useState(false)
  const [everOpened, setEverOpened] = useState(false)
  const bodyId = useId()
  const body = useRef<HTMLDivElement>(null)
  const sections = useMemo(() => lessonMarkdownOutline(markdown, anchor).count, [markdown, anchor])
  const minutes = useMemo(() => lessonNotesReadingMinutes(markdown), [markdown])

  useEffect(() => {
    const reveal = () => {
      setOpen(true)
      setEverOpened(true)
    }
    const followHash = () => {
      const { hash } = window.location
      if (!hashTargets(hash, anchor)) return
      reveal()
      // Пока текст был скрыт, браузеру было не к чему прокрутить.
      requestAnimationFrame(() => document.getElementById(hash.slice(1))?.scrollIntoView())
    }
    const element = body.current
    followHash()
    window.addEventListener('hashchange', followHash)
    if (anchor === STUDY_NOTES_ANCHOR) window.addEventListener(OPEN_EVENT, reveal)
    element?.addEventListener('beforematch', reveal)
    return () => {
      window.removeEventListener('hashchange', followHash)
      window.removeEventListener(OPEN_EVENT, reveal)
      element?.removeEventListener('beforematch', reveal)
    }
  }, [anchor])

  // React пишет только hidden="": до гидратации и в старых браузерах текст просто скрыт.
  useEffect(() => {
    if (!open) body.current?.setAttribute('hidden', 'until-found')
  }, [open])

  const toggle = () => {
    setOpen((value) => !value)
    setEverOpened(true)
  }

  return (
    <section id={anchor} aria-labelledby={`${anchor}-title`} className="scroll-mt-20 space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-x-4 gap-y-2 rounded-xl border border-border bg-card p-4">
        <div className="min-w-0">
          <h2 id={`${anchor}-title`} className="flex items-center gap-2 text-lg font-semibold text-foreground sm:text-xl">
            <BookOpenText aria-hidden="true" className="h-5 w-5 text-muted-foreground" />
            Конспект урока
          </h2>
          <p className="mt-1 text-sm text-muted-foreground">
            {sections > 0 && `${pluralize(sections, 'раздел', 'раздела', 'разделов')}, `}~{minutes} мин чтения
          </p>
        </div>
        <button
          type="button"
          aria-expanded={open}
          aria-controls={bodyId}
          onClick={toggle}
          className="inline-flex min-h-11 items-center gap-2 rounded-lg border border-border px-4 py-2 text-sm font-medium text-foreground transition-colors hover:bg-accent focus-visible:outline-2 focus-visible:outline-ring"
        >
          <ChevronDown aria-hidden="true" className={`h-4 w-4 transition-transform motion-reduce:transition-none ${open ? 'rotate-180' : ''}`} />
          {open ? 'Свернуть конспект' : 'Развернуть конспект'}
        </button>
      </div>
      <div id={bodyId} ref={body} hidden={!open}>
        <LessonMarkdown markdown={markdown} anchorPrefix={anchor} deferAssets={!everOpened} />
      </div>
    </section>
  )
}
