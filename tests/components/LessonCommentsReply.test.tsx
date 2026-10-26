import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const toast = vi.fn()
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ toast }) }))

const { LessonComments } = await import('@/components/lesson/LessonComments')

/** Уточнение в ветке вопроса и переход к ответу по ссылке из уведомления. */

const me = { id: 7, firstName: 'Алексей', lastName: 'Морозов' }
const question = { id: 5, content: 'Почему эффект срабатывает дважды?', user: me, parentComment: null, createdAt: '2026-09-15T10:00:00.000Z' }
const answer = { id: 6, content: 'Это StrictMode в разработке', user: { id: 2, firstName: 'Ментор' }, parentComment: 5, createdAt: '2026-09-15T11:00:00.000Z' }

function api({ postOk = true } = {}) {
  vi.stubGlobal('fetch', vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'POST') return postOk ? Response.json({ doc: { id: 99 } }) : new Response('нет', { status: 500 })
    if (init?.method === 'PATCH') return Response.json({ docs: [] })
    return Response.json({ docs: [question, answer], hasNextPage: false })
  }))
}

beforeEach(() => {
  vi.clearAllMocks()
  window.history.replaceState(null, '', '/lessons/effects')
  api()
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('уточнение к вопросу', () => {
  it('отказ сервера виден ученику, а текст уточнения не пропадает', async () => {
    const user = userEvent.setup()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    api({ postOk: false })
    render(<LessonComments lessonId={42} userId={7} />)

    await user.click(await screen.findByRole('button', { name: 'Уточнить' }))
    await user.type(screen.getByRole('textbox', { name: 'Уточнение к вопросу' }), 'А в продакшене?')
    await user.click(screen.getByRole('button', { name: 'Отправить уточнение' }))

    await waitFor(() => expect(toast).toHaveBeenCalledWith('Не удалось отправить уточнение', 'error'))
    expect(screen.getByRole('textbox', { name: 'Уточнение к вопросу' })).toHaveValue('А в продакшене?')
    expect(screen.getByRole('button', { name: 'Отправить уточнение' })).toBeEnabled()
    expect(console.error).toHaveBeenCalledWith('Не удалось отправить уточнение', expect.any(Error))
  })

  it('поле уточнения получает фокус, пустое уточнение отправить нельзя', async () => {
    const user = userEvent.setup()
    render(<LessonComments lessonId={42} userId={7} />)

    await user.click(await screen.findByRole('button', { name: 'Уточнить' }))
    expect(screen.getByRole('textbox', { name: 'Уточнение к вопросу' })).toHaveFocus()
    await user.type(screen.getByRole('textbox', { name: 'Уточнение к вопросу' }), '   ')

    expect(screen.getByRole('button', { name: 'Отправить уточнение' })).toBeDisabled()
  })
})

describe('ссылка из уведомления об ответе', () => {
  it('после загрузки прокручивает к ветке из адреса', async () => {
    window.history.replaceState(null, '', '/lessons/effects#comment-5')
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {})
    render(<LessonComments lessonId={42} userId={7} />)

    await waitFor(() => expect(scroll).toHaveBeenCalledWith({ block: 'center' }))
    expect(scroll.mock.contexts[0]).toBe(document.getElementById('comment-5'))
  })

  it('без якоря ветки страница не прокручивается сама', async () => {
    window.history.replaceState(null, '', '/lessons/effects#notes')
    const scroll = vi.spyOn(Element.prototype, 'scrollIntoView').mockImplementation(() => {})
    render(<LessonComments lessonId={42} userId={7} />)

    await screen.findByText('Почему эффект срабатывает дважды?')
    expect(scroll).not.toHaveBeenCalled()
  })
})
