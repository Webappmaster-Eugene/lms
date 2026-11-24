import { describe, expect, it } from 'vitest'

import { tutoringReadingMarkdown, tutoringReadingTitle } from '@/lib/tutoring-reading'

describe('Названия и текст методичек в менторстве', () => {
  it('отображает подготовку и обычные номера учебных работ', () => {
    expect(tutoringReadingTitle('Практикум 00 · Настройка окружения')).toBe('Практикум. Подготовка проекта · Настройка окружения')
    expect(tutoringReadingTitle('Методичка 03 · Базы данных')).toBe('Методичка 3 · Базы данных')
  })
  it('поясняет ученику, где разобрать ответы, сохраняя цитату в коде', () => {
    const source = 'Ответы приведены в приложении. `Ответы в приложении.`'
    expect(tutoringReadingMarkdown(source, true)).toBe('Ответы можно обсудить с наставником на встрече. `Ответы в приложении.`')
    expect(tutoringReadingMarkdown(source)).toBe(source)
  })
  it('сохраняет код и цель ссылки дословно при изменении видимого текста', () => {
    const source = '## Этап 00\n\n[Этап 01](https://example.com/week-00) и `Этап 00`\n\n~~~txt\nЭтап 00 — ещё\n~~~\n'
    const result = tutoringReadingMarkdown(source)
    expect(result).toBe('## Подготовка проекта\n\n[Этап 1](https://example.com/week-00) и `Этап 00`\n\n~~~txt\nЭтап 00 — ещё\n~~~\n')
  })
})
