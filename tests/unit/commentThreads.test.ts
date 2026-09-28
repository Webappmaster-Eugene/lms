import { describe, expect, it } from 'vitest'

import { authorName, groupThreads, type CommentDoc } from '@/lib/comment-threads'

const c = (id: number, createdAt: string, parentComment: number | null = null, user: CommentDoc['user'] = { id: 1, firstName: 'Анна' }): CommentDoc => ({
  id,
  content: `#${id}`,
  user,
  parentComment,
  createdAt,
})

describe('ветки вопросов', () => {
  it('вопросы от новых к старым, ответы — в порядке переписки', () => {
    const threads = groupThreads([
      c(3, '2026-09-03', 1),
      c(1, '2026-09-01'),
      c(2, '2026-09-02'),
      c(4, '2026-09-04', 1),
    ])
    expect(threads.map((t) => t.question.id)).toEqual([2, 1])
    expect(threads[1].replies.map((r) => r.id)).toEqual([3, 4])
  })

  it('родитель развёрнутым объектом тоже понимается', () => {
    const threads = groupThreads([c(1, '2026-09-01'), { ...c(2, '2026-09-02'), parentComment: { id: 1 } }])
    expect(threads).toHaveLength(1)
    expect(threads[0].replies).toHaveLength(1)
  })

  it('ответ без видимого вопроса не всплывает отдельной веткой', () => {
    expect(groupThreads([c(2, '2026-09-02', 1)])).toEqual([])
  })
})

describe('автор', () => {
  it('свой — по имени, неразвёрнутый — ментор', () => {
    expect(authorName({ firstName: 'Анна', lastName: 'Ли' })).toBe('Анна Ли')
    expect(authorName({})).toBe('Пользователь')
    expect(authorName(3)).toBe('Ментор')
  })
})
