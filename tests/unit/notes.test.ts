import { describe, expect, it } from 'vitest'

import { filterNotes, groupNotesByCourse, notesToMarkdown, type NoteEntry } from '@/lib/notes'

/** Страница «Мои заметки»: всё записанное по урокам, сгруппированное по курсам. */

const react = { id: '1', title: 'React', slug: 'react' }
const ts = { id: '2', title: 'TypeScript', slug: 'ts' }

function note(id: string, updatedAt: string, overrides: Partial<NoteEntry> = {}): NoteEntry {
  return {
    id,
    content: `Текст ${id}`,
    updatedAt,
    lesson: { title: `Урок ${id}`, slug: `l-${id}` },
    course: react,
    ...overrides,
  }
}

const notes = [
  note('a', '2026-09-01T10:00:00Z'),
  note('b', '2026-09-03T10:00:00Z', { course: ts }),
  note('c', '2026-09-02T10:00:00Z'),
  note('d', '2026-09-04T10:00:00Z', { lesson: null, course: null }),
]

describe('группировка по курсам', () => {
  it('курсы и заметки внутри — от свежих к старым, недоступные уроки в конце', () => {
    const groups = groupNotesByCourse(notes)
    expect(groups.map((g) => g.course?.title ?? null)).toEqual(['TypeScript', 'React', null])
    expect(groups[1].notes.map((n) => n.id)).toEqual(['c', 'a'])
  })

  it('урок без курса не падает в чужую группу', () => {
    const groups = groupNotesByCourse([note('x', '2026-09-01T00:00:00Z', { course: null })])
    expect(groups).toHaveLength(1)
    expect(groups[0].course).toBeNull()
  })
})

describe('поиск по заметкам', () => {
  it('по тексту, уроку и курсу, без учёта регистра', () => {
    expect(filterNotes(notes, 'текст B').map((n) => n.id)).toEqual(['b'])
    expect(filterNotes(notes, 'урок c').map((n) => n.id)).toEqual(['c'])
    expect(filterNotes(notes, 'typescript').map((n) => n.id)).toEqual(['b'])
  })

  it('пустой запрос ничего не отбрасывает', () => {
    expect(filterNotes(notes, '  ')).toHaveLength(4)
  })
})

describe('выгрузка в Markdown', () => {
  it('курс — заголовок второго уровня, урок — третьего', () => {
    const md = notesToMarkdown(groupNotesByCourse(notes.slice(0, 1)))
    expect(md).toBe('# Мои заметки\n\n## React\n\n### Урок a\n\nТекст a\n')
  })

  it('заметка к недоступному уроку не теряется', () => {
    const md = notesToMarkdown(groupNotesByCourse([notes[3]]))
    expect(md).toContain('## Другие заметки')
    expect(md).toContain('### Урок недоступен\n\nТекст d')
  })
})
