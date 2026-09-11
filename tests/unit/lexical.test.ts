import { describe, it, expect } from 'vitest'

import {
  EMPTY_LEXICAL_STATE,
  isLexicalRootState,
  normalizeLexicalValue,
  stringToLexicalState,
} from '@/lib/lexical'

describe('EMPTY_LEXICAL_STATE', () => {
  it('имеет валидную структуру', () => {
    expect(isLexicalRootState(EMPTY_LEXICAL_STATE)).toBe(true)
  })

  it('заморожен — экземпляр общий на все запросы', () => {
    expect(Object.isFrozen(EMPTY_LEXICAL_STATE)).toBe(true)
    expect(Object.isFrozen(EMPTY_LEXICAL_STATE.root)).toBe(true)
    expect(Object.isFrozen(EMPTY_LEXICAL_STATE.root.children)).toBe(true)
  })
})

describe('stringToLexicalState', () => {
  it('оборачивает текст в абзац с текстовым узлом', () => {
    const state = stringToLexicalState('Привет')

    expect(isLexicalRootState(state)).toBe(true)
    expect(state.root.children).toHaveLength(1)

    const paragraph = state.root.children[0] as { type: string; children: unknown[] }
    expect(paragraph.type).toBe('paragraph')

    const text = paragraph.children[0] as { type: string; text: string }
    expect(text).toMatchObject({ type: 'text', text: 'Привет' })
  })

  it('пустая строка даёт пустой документ, а не абзац с пустым текстом', () => {
    expect(stringToLexicalState('')).toBe(EMPTY_LEXICAL_STATE)
  })

  it('строка из пробелов пустой не считается', () => {
    const state = stringToLexicalState('   ')
    expect(state).not.toBe(EMPTY_LEXICAL_STATE)
    expect(state.root.children).toHaveLength(1)
  })

  it('переносы строк сохраняются внутри одного текстового узла', () => {
    const paragraph = stringToLexicalState('a\nb').root.children[0] as { children: unknown[] }
    const text = paragraph.children[0] as { text: string }
    expect(text.text).toBe('a\nb')
  })
})

describe('isLexicalRootState', () => {
  it('принимает валидный документ', () => {
    expect(isLexicalRootState(stringToLexicalState('x'))).toBe(true)
  })

  it.each([
    ['null', null],
    ['undefined', undefined],
    ['строка', 'просто текст'],
    ['число', 42],
    ['булево', true],
    ['массив', [{ type: 'root' }]],
    ['объект без root', { children: [] }],
    ['root не объект', { root: 'root' }],
    ['root === null', { root: null }],
    ['неверный type', { root: { type: 'paragraph', children: [], version: 1 } }],
    ['children не массив', { root: { type: 'root', children: {}, version: 1 } }],
    ['version не число', { root: { type: 'root', children: [], version: '1' } }],
    ['version отсутствует', { root: { type: 'root', children: [] } }],
  ])('отклоняет: %s', (_label, value) => {
    expect(isLexicalRootState(value)).toBe(false)
  })

  it('проверка намеренно поверхностная: содержимое children не валидируется', () => {
    expect(isLexicalRootState({ root: { type: 'root', children: ['мусор'], version: 1 } })).toBe(
      true,
    )
  })
})

describe('normalizeLexicalValue', () => {
  it('null и undefined дают null — поле остаётся пустым', () => {
    expect(normalizeLexicalValue(null)).toBeNull()
    expect(normalizeLexicalValue(undefined)).toBeNull()
  })

  it('валидный документ возвращается тем же объектом', () => {
    const state = stringToLexicalState('x')
    expect(normalizeLexicalValue(state)).toBe(state)
  })

  it('строка поднимается до документа', () => {
    const result = normalizeLexicalValue('Текст из старой колонки')
    expect(isLexicalRootState(result)).toBe(true)
  })

  it.each([[42], [true], [['a']], [{ foo: 'bar' }]])(
    'непригодное значение %s превращается в null, а не пролетает дальше',
    (value) => {
      expect(normalizeLexicalValue(value)).toBeNull()
    },
  )

  it('о непригодном значении сообщается через onInvalid', () => {
    const seen: unknown[] = []
    normalizeLexicalValue(42, (v) => seen.push(v))
    expect(seen).toEqual([42])
  })

  it('onInvalid не вызывается для валидных значений и для null', () => {
    let calls = 0
    const count = () => {
      calls += 1
    }

    normalizeLexicalValue(null, count)
    normalizeLexicalValue(undefined, count)
    normalizeLexicalValue('строка', count)
    normalizeLexicalValue(stringToLexicalState('x'), count)

    expect(calls).toBe(0)
  })

  it('не бросает исключение ни на каком входе', () => {
    const nasty: unknown[] = [NaN, Infinity, Symbol('s'), () => {}, new Date(), { root: 1 }]
    for (const value of nasty) {
      expect(() => normalizeLexicalValue(value)).not.toThrow()
    }
  })
})
