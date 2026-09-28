import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const refresh = vi.fn()
const toast = vi.fn()
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('next/link', async () => (await import('../helpers/component-mocks')).linkMock())
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ toast }) }))

const { MyQuestions } = await import('@/components/questions/MyQuestions')
const { MentorQuestions } = await import('@/components/questions/MentorQuestions')
import type { QuestionThread } from '@/lib/questions'

const student = { id: 7, firstName: 'Анна', lastName: 'Ли' }
const mentor = { id: 1, firstName: 'Евгений', lastName: 'Н.' }

function thread(id: number, over: Partial<QuestionThread> = {}): QuestionThread {
  return {
    question: { id, content: `Вопрос ${id}`, user: student, createdAt: `2026-09-0${id}T10:00:00Z`, isResolved: false },
    replies: [],
    lesson: { title: `Урок ${id}`, slug: `lesson-${id}` },
    ...over,
  }
}

const answered = thread(2, {
  replies: [{ id: 20, content: 'Ответ ментора', user: mentor, parentComment: 2, createdAt: '2026-09-03T10:00:00Z' }],
})
const threads = [thread(1), answered, thread(3, { lesson: null })]

describe('мои вопросы', () => {
  beforeEach(() => {
    global.fetch = vi.fn(async () => Response.json({ docs: [] })) as unknown as typeof fetch
  })

  it('ответы видны списком — уведомления об ответах ученику прочитаны', async () => {
    render(<MyQuestions threads={threads} />)

    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    const [url, init] = vi.mocked(global.fetch).mock.calls[0] as unknown as [string, RequestInit]
    expect(init.method).toBe('PATCH')
    expect(decodeURIComponent(url)).toContain('where[link][like]=/lessons/')
  })

  it('без ответов уведомления не трогаются', () => {
    render(<MyQuestions threads={[thread(1)]} />)

    expect(global.fetch).not.toHaveBeenCalled()
  })

  it('вопрос ведёт к своей ветке в уроке', () => {
    render(<MyQuestions threads={threads} />)

    expect(screen.getByRole('link', { name: 'Урок 1' })).toHaveAttribute('href', '/lessons/lesson-1#comment-1')
  })

  it('последний ответ виден прямо в списке', () => {
    render(<MyQuestions threads={threads} />)

    const item = screen.getByText('Вопрос 2').closest('li') as HTMLElement
    expect(within(item).getByText('Ответ ментора')).toBeInTheDocument()
    expect(within(item).getByText('Есть ответ')).toBeInTheDocument()
  })

  it('фильтр по статусу со счётчиками', async () => {
    render(<MyQuestions threads={threads} />)

    await userEvent.click(screen.getByRole('button', { name: /Есть ответ/ }))

    expect(screen.queryByText('Вопрос 1')).not.toBeInTheDocument()
    expect(screen.getByText('1 вопрос')).toBeInTheDocument()
  })

  it('недоступный урок не даёт битой ссылки', () => {
    render(<MyQuestions threads={threads} />)

    const item = screen.getByText('Вопрос 3').closest('li') as HTMLElement
    expect(within(item).getByText('Урок сейчас недоступен')).toBeInTheDocument()
  })

  it('без вопросов объясняет, где их задавать', () => {
    render(<MyQuestions threads={[]} />)

    expect(screen.getByText(/Задать вопрос ментору можно под любым уроком/)).toBeInTheDocument()
  })
})

describe('вопросы учеников — страница ментора', () => {
  let calls: { url: string; init?: RequestInit }[] = []

  beforeEach(() => {
    vi.clearAllMocks()
    calls = []
    global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      calls.push({ url: String(url), init })
      return Response.json({ doc: {} })
    }) as unknown as typeof fetch
  })

  it('по умолчанию — ждущие ответа, самые давние сверху', () => {
    render(<MentorQuestions threads={[thread(3), answered, thread(1)]} />)

    const items = screen.getAllByRole('listitem').filter((li) => li.id.startsWith('comment-'))
    expect(items.map((li) => li.id)).toEqual(['comment-1', 'comment-3'])
  })

  it('ответ уходит в ветку вопроса и обновляет страницу', async () => {
    const user = userEvent.setup()
    render(<MentorQuestions threads={[thread(1)]} />)

    await user.type(screen.getByRole('textbox', { name: /Ответ ученику/ }), 'Смотрите StrictMode')
    await user.click(screen.getByRole('button', { name: 'Ответить' }))

    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(calls[0].url).toBe('/api/comments')
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ content: 'Смотрите StrictMode', parentComment: 1 })
  })

  it('Ctrl+Enter отправляет ответ', async () => {
    const user = userEvent.setup()
    render(<MentorQuestions threads={[thread(1)]} />)

    await user.type(screen.getByRole('textbox', { name: /Ответ ученику/ }), 'Быстро{Control>}{Enter}{/Control}')

    await waitFor(() => expect(calls).toHaveLength(1))
  })

  it('«Отметить решённым» закрывает вопрос', async () => {
    const user = userEvent.setup()
    render(<MentorQuestions threads={[thread(1)]} />)

    await user.click(screen.getByRole('button', { name: 'Отметить решённым' }))

    await waitFor(() => expect(refresh).toHaveBeenCalled())
    expect(calls[0]).toMatchObject({ url: '/api/comments/1', init: { method: 'PATCH' } })
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ isResolved: true })
  })

  it('отказ сервера виден ментору, текст не теряется', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    global.fetch = vi.fn(async () => new Response(null, { status: 500 })) as unknown as typeof fetch
    const user = userEvent.setup()
    render(<MentorQuestions threads={[thread(1)]} />)

    await user.type(screen.getByRole('textbox', { name: /Ответ ученику/ }), 'Ответ')
    await user.click(screen.getByRole('button', { name: 'Ответить' }))

    await waitFor(() => expect(toast).toHaveBeenCalledWith('Не удалось отправить ответ', 'error'))
    expect(screen.getByRole('textbox', { name: /Ответ ученику/ })).toHaveValue('Ответ')
  })

  it('когда ждущих нет — так и сказано', () => {
    render(<MentorQuestions threads={[answered]} />)

    expect(screen.getByText('Все вопросы отвечены')).toBeInTheDocument()
  })
})
