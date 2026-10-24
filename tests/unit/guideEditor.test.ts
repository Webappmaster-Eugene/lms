import { describe, expect, it } from 'vitest'

import { guideListEnter, normalizeGuidePaste } from '@/lib/guide-editor'

describe('Markdown при редактировании гайда', () => {
  it('преобразует пункты из чата, сохраняя обычный текст и блоки кода', () => {
    const text = 'Вступление\n• Первый\n• Второй\n\n```text\n• Пример\n```\n\n    • Код с отступом\n\nТекст с • внутри.'
    expect(normalizeGuidePaste(text)).toBe('Вступление\n- Первый\n- Второй\n\n```text\n• Пример\n```\n\n    • Код с отступом\n\nТекст с • внутри.')
  })

  it('при вставке меняет только вставленный диапазон, учитывая окружающий код', () => {
    const text = '• Старый\n• Вставленный\n• Ещё один'
    expect(normalizeGuidePaste(text, 9, 22)).toBe('• Старый\n- Вставленный\n• Ещё один')
    expect(normalizeGuidePaste('```\n• Вставленный\n```', 4, 18)).toBe('```\n• Вставленный\n```')
    expect(normalizeGuidePaste('`Пример\n• В коде`')).toBe('`Пример\n• В коде`')
  })

  it.each([
    ['- Пункт', '\n- '],
    ['9. Пункт', '\n10. '],
    ['2) Пункт', '\n3) '],
    ['  - Вложенный', '\n  - '],
    ['- [x] Готово', '\n- [ ] '],
  ])('Enter продолжает «%s»', (text, insert) => {
    expect(guideListEnter(text, text.length, text.length)).toEqual({ start: text.length, end: text.length, text: insert })
  })

  it('Enter на пустом пункте завершает список, но сохраняет следующий текст', () => {
    expect(guideListEnter('- Пункт\n- ', 10, 10)).toEqual({ start: 8, end: 10, text: '\n' })
    expect(guideListEnter('- Пункт\n- \nАбзац', 10, 10)).toEqual({ start: 8, end: 10, text: '' })
  })

  it('не продолжает списки в коде, обычном абзаце и при выделении текста', () => {
    expect(guideListEnter('```\n- Пример', 12, 12)).toBeNull()
    expect(guideListEnter('Обычный текст', 13, 13)).toBeNull()
    expect(guideListEnter('- Пункт', 2, 7)).toBeNull()
  })
})
