import { describe, it, expect, beforeEach, vi } from 'vitest'

import { cleanupLessonRelations } from '@/payload/hooks/cleanupLessonRelations'

const remove = vi.fn()

type HookArgs = Parameters<typeof cleanupLessonRelations>[0]

function run(id: number | string = 847) {
  return cleanupLessonRelations({
    id,
    req: { payload: { delete: remove } },
  } as unknown as HookArgs)
}

beforeEach(() => {
  vi.clearAllMocks()
  remove.mockResolvedValue({ docs: [] })
})

describe('удаление урока', () => {
  it('снимает прогресс, заметки и комментарии — иначе внешние ключи не дадут удалить', async () => {
    await run(847)

    expect(remove.mock.calls.map(([args]) => args.collection)).toEqual([
      'user-progress',
      'notes',
      'comments',
    ])
    expect(remove.mock.calls.every(([args]) => args.where.lesson.equals === 847)).toBe(true)
  })

  it('запросы идут в транзакции запроса', async () => {
    await run()

    expect(remove.mock.calls.every(([args]) => 'req' in args)).toBe(true)
  })

  it('сбой очистки не проглатывается — удаление должно упасть явно', async () => {
    remove.mockRejectedValueOnce(new Error('нет доступа'))

    await expect(run()).rejects.toThrow('нет доступа')
  })
})
