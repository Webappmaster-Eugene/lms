/** Заметка ученика, как её показывает страница «Мои заметки». */
export type NoteEntry = {
  id: string
  content: string
  updatedAt: string
  /** null — урок снят с публикации или удалён: текст заметки всё равно принадлежит ученику. */
  lesson: { title: string; slug: string } | null
  course: { id: string; title: string; slug: string } | null
}

export type NoteGroup = {
  key: string
  course: NoteEntry['course']
  notes: NoteEntry[]
}

const NO_COURSE = '__none'
export const OTHER_GROUP_TITLE = 'Другие заметки'

/**
 * Заметки по курсам: курсы — по свежести последней правки, внутри курса — тоже.
 * Заметки без курса и к недоступным урокам — отдельной группой в конце.
 */
export function groupNotesByCourse(notes: NoteEntry[]): NoteGroup[] {
  const sorted = [...notes].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt))
  const groups = new Map<string, NoteGroup>()
  for (const note of sorted) {
    const key = note.lesson && note.course ? note.course.id : NO_COURSE
    const group = groups.get(key) ?? { key, course: note.lesson ? note.course : null, notes: [] }
    group.notes.push(note)
    groups.set(key, group)
  }
  return [...groups.values()].sort((a, b) => Number(a.key === NO_COURSE) - Number(b.key === NO_COURSE))
}

/** Поиск по тексту заметки, уроку и курсу — без учёта регистра. */
export function filterNotes(notes: NoteEntry[], query: string): NoteEntry[] {
  const needle = query.trim().toLowerCase()
  if (!needle) return notes
  return notes.filter((n) =>
    [n.content, n.lesson?.title, n.course?.title].some((text) => text?.toLowerCase().includes(needle)),
  )
}

/** Все заметки одним Markdown-файлом — для повторения перед собеседованием без интернета. */
export function notesToMarkdown(groups: NoteGroup[]): string {
  const parts = ['# Мои заметки']
  for (const group of groups) {
    parts.push(`## ${group.course?.title ?? OTHER_GROUP_TITLE}`)
    for (const note of group.notes) {
      parts.push(`### ${note.lesson?.title ?? 'Урок недоступен'}`, note.content.trim())
    }
  }
  return `${parts.join('\n\n')}\n`
}
