import { describe, expect, it } from 'vitest'

import { authorName, groupThreads, isMentorReply, threadStatus, type CommentDoc } from '@/lib/comment-threads'

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

describe('ответ ментора', () => {
  it('ответ не от автора вопроса — ментора, развёрнут автор или нет', () => {
    const question = c(1, '2026-09-01', null, { id: 7 })
    expect(isMentorReply(c(2, '2026-09-02', 1, { id: 3, firstName: 'Евгений' }), question)).toBe(true)
    expect(isMentorReply(c(3, '2026-09-02', 1, 3), question)).toBe(true)
    expect(isMentorReply(c(4, '2026-09-02', 1, { id: 7 }), question)).toBe(false)
  })
})

describe('статус ветки', () => {
  const question = { ...c(1, '2026-09-01', null, { id: 7 }), isResolved: false }
  const mentor = (id: number) => c(id, `2026-09-0${id}`, 1, { id: 3 })
  const student = (id: number) => c(id, `2026-09-0${id}`, 1, { id: 7 })

  it('без ответа — ждёт', () => {
    expect(threadStatus({ question, replies: [] })).toBe('waiting')
  })

  it('последним ответил ментор — есть ответ', () => {
    expect(threadStatus({ question, replies: [mentor(2)] })).toBe('answered')
  })

  it('уточнение после ответа снова ждёт ментора', () => {
    expect(threadStatus({ question, replies: [mentor(2), student(3)] })).toBe('waiting')
  })

  it('решённый — решён, что бы ни было в ветке', () => {
    expect(threadStatus({ question: { ...question, isResolved: true }, replies: [student(2)] })).toBe('resolved')
  })
})
