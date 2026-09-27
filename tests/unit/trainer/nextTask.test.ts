import { describe, expect, it } from 'vitest'

import { nextUnsolvedTask } from '@/lib/trainer/next-task'

const tasks = ['1', '2', '3', '4'].map((id) => ({ id }))

describe('следующая нерешённая задача', () => {
  it('пропускает решённые после текущей', () => {
    expect(nextUnsolvedTask(tasks, '1', new Set(['2']))?.id).toBe('3')
  })

  it('после конца темы возвращается к нерешённым в начале', () => {
    expect(nextUnsolvedTask(tasks, '3', new Set(['4']))?.id).toBe('1')
  })

  it('текущую не предлагает, даже если она ещё не засчитана', () => {
    expect(nextUnsolvedTask(tasks, '4', new Set(['1', '2', '3']))).toBeNull()
  })

  it('id сравниваются как строки: из Payload приходят числа', () => {
    expect(nextUnsolvedTask([{ id: 1 }, { id: 2 }], 1, new Set(['1']))?.id).toBe(2)
  })
})
