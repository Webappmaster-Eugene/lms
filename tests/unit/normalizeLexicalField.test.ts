import { describe, expect, it, vi } from 'vitest'
import type { PayloadRequest } from 'payload'

import {
  normalizeLexicalAfterRead,
  normalizeLexicalBeforeValidate,
} from '@/payload/hooks/normalizeLexicalField'
import { EMPTY_LEXICAL_STATE, stringToLexicalState } from '@/lib/lexical'

/**
 * Защита richText-полей от значений, которые в jsonb попасть могут, а
 * редактор Lexical переварить — нет: он бросает исключение прямо в рендере,
 * и документ перестаёт открываться в админке. Хук обязан не бросать сам.
 */

function makeReq() {
  const warn = vi.fn()
  const req = { payload: { logger: { warn } } } as unknown as PayloadRequest
  return { req, warn }
}

const run = (hook: typeof normalizeLexicalBeforeValidate, value: unknown) => {
  const { req, warn } = makeReq()
  // @ts-expect-error — хуку достаточно value и req
  const result = hook({ value, req })
  return { result, warn }
}

const HOOKS = [
  ['на запись', normalizeLexicalBeforeValidate],
  ['на чтение', normalizeLexicalAfterRead],
] as const

describe('нормализация richText-поля', () => {
  describe.each(HOOKS)('%s', (_name, hook) => {
    it('валидный документ возвращается той же ссылкой', () => {
      const document = stringToLexicalState('Теория урока')

      expect(run(hook, document).result).toBe(document)
    })

    it('строка оборачивается в документ', () => {
      const { result } = run(hook, 'просто текст')

      expect(result).toEqual(stringToLexicalState('просто текст'))
    })

    it.each([null, undefined])('пустое значение %j остаётся пустым', (value) => {
      expect(run(hook, value).result).toBeNull()
    })

    it.each([42, true, [], { root: 'сломано' }])(
      'непригодное значение %j заменяется на null',
      (value) => {
        expect(run(hook, value).result).toBeNull()
      },
    )

    it('о подмене сообщается в лог — иначе порча данных пройдёт незамеченной', () => {
      const { warn } = run(hook, 42)

      expect(warn).toHaveBeenCalled()
    })

    it('корректное значение лог не засоряет', () => {
      const { warn } = run(hook, stringToLexicalState('ок'))

      expect(warn).not.toHaveBeenCalled()
    })

    it('хук не бросает — исключение вернуло бы ту самую поломку админки', () => {
      expect(() => run(hook, Symbol('битое'))).not.toThrow()
    })
  })

  it('фаза записи и фаза чтения различимы в логе', () => {
    const write = run(normalizeLexicalBeforeValidate, 42)
    const read = run(normalizeLexicalAfterRead, 42)

    const phase = (warn: ReturnType<typeof vi.fn>) =>
      (warn.mock.calls[0][0] as { phase?: string }).phase

    expect(phase(write.warn)).toBe('write')
    expect(phase(read.warn)).toBe('read')
  })

  it('пустой документ считается валидным и не подменяется', () => {
    expect(run(normalizeLexicalAfterRead, EMPTY_LEXICAL_STATE).result).toBe(EMPTY_LEXICAL_STATE)
  })
})
