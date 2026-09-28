import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const toast = vi.fn()
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ toast }) }))

const { LessonComments } = await import('@/components/lesson/LessonComments')

/**
 * Приватные вопросы ментору под уроком: вопрос, ответы ментора и уточнения
 * ученика одной веткой. Сервер отдаёт ученику только его ветки.
 */

type Comment = {
  id: number
  content: string
  user: { id?: number; firstName?: string; lastName?: string } | number
  parentComment?: number | null
  createdAt: string
  isResolved?: boolean
}

const me = { id: 7, firstName: 'Алексей', lastName: 'Морозов' }

function comment(id: number, overrides: Partial<Comment> = {}): Comment {
  return {
    id,
    content: `Вопрос ${id}`,
    user: me,
    parentComment: null,
    createdAt: `2026-09-15T10:00:0${id % 10}.000Z`,
    ...overrides,
  }
}

let posted: Record<string, unknown>[] = []

function mockApi({ pages = [[]] as Comment[][], postOk = true, loadOk = true } = {}) {
  posted = []
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'POST') {
      posted.push(JSON.parse(String(init.body)) as Record<string, unknown>)
      return postOk ? Response.json({ doc: { id: 99 } }) : new Response('нет', { status: 500 })
    }
    if (!loadOk) return new Response(null, { status: 500 })
    const page = Number(new URL(String(input), 'http://x').searchParams.get('page') ?? '1')
    return Response.json({ docs: pages[page - 1] ?? [], hasNextPage: page < pages.length })
  }) as unknown as typeof fetch
}

const questionBox = () => screen.getByRole('textbox', { name: 'Вопрос к уроку' })
const sendButton = () => screen.getByRole('button', { name: /Отправ.* вопрос/ })

describe('вопросы к уроку', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApi()
  })

  describe('список', () => {
    it('запрашиваются комментарии только этого урока, постранично', async () => {
      mockApi({ pages: [[comment(1)], [comment(2)]] })
      render(<LessonComments lessonId={42} />)

      expect(await screen.findByText('Вопрос 2')).toBeInTheDocument()
      const urls = vi.mocked(global.fetch).mock.calls.map(([url]) => String(url))
      expect(urls).toHaveLength(2)
      expect(urls[0]).toContain('where[lesson][equals]=42')
      expect(urls[1]).toContain('page=2')
    })

    it('пустой список подсказывает, что можно спросить', async () => {
      render(<LessonComments lessonId={42} />)

      expect(await screen.findByText(/Вопросов пока нет/)).toBeInTheDocument()
    })

    it('отказ загрузки виден, а не выдаётся за пустой список', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      mockApi({ loadOk: false })
      render(<LessonComments lessonId={42} />)

      expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить вопросы')
      expect(screen.queryByText(/Вопросов пока нет/)).not.toBeInTheDocument()
    })

    it('ответ ментора показывается под вопросом с подписью «Ментор»', async () => {
      mockApi({
        pages: [[comment(1, { content: 'Почему так?' }), comment(2, { content: 'Потому что', user: 3, parentComment: 1 })]],
      })
      render(<LessonComments lessonId={42} />)

      const thread = (await screen.findByText('Почему так?')).closest('li') as HTMLElement
      expect(within(thread).getByText('Потому что')).toBeInTheDocument()
      expect(within(thread).getByText('Ментор')).toBeInTheDocument()
      expect(within(thread).getByText('Есть ответ')).toBeInTheDocument()
    })

    it('развёрнутый профиль ментора — имя и метка «Ментор»', async () => {
      mockApi({
        pages: [[comment(1), comment(2, { content: 'Ответ', user: { id: 3, firstName: 'Евгений' }, parentComment: 1 })]],
      })
      render(<LessonComments lessonId={42} />)

      const thread = (await screen.findByText('Ответ')).closest('li[id]') as HTMLElement
      expect(within(thread).getByText('Евгений')).toBeInTheDocument()
      expect(within(thread).getByText('Ментор')).toBeInTheDocument()
      expect(within(thread).getByText('Есть ответ')).toBeInTheDocument()
    })

    it('без ответа ментора вопрос помечен как ждущий', async () => {
      mockApi({ pages: [[comment(1), comment(2, { content: 'Уточняю', parentComment: 1 })]] })
      render(<LessonComments lessonId={42} />)

      expect(await screen.findByText('Ждёт ответа')).toBeInTheDocument()
    })

    it('решённый вопрос помечен', async () => {
      mockApi({ pages: [[comment(1, { isResolved: true })]] })
      render(<LessonComments lessonId={42} />)

      expect(await screen.findByText('Решён')).toBeInTheDocument()
    })

    it('свежие вопросы сверху, у ветки якорь для ссылки из уведомления', async () => {
      mockApi({ pages: [[comment(1), comment(2)]] })
      const { container } = render(<LessonComments lessonId={42} />)

      await screen.findByText('Вопрос 2')
      const ids = [...container.querySelectorAll('li[id^="comment-"]')].map((li) => li.id)
      expect(ids).toEqual(['comment-2', 'comment-1'])
    })

    it('автор без имени не оставляет пустую строку', async () => {
      mockApi({ pages: [[comment(1, { user: { id: 7 } })]] })
      render(<LessonComments lessonId={42} />)

      expect(await screen.findByText('Пользователь')).toBeInTheDocument()
    })
  })

  describe('новый вопрос', () => {
    it('пустой вопрос отправить нельзя, пробелы за текст не считаются', async () => {
      const user = userEvent.setup()
      render(<LessonComments lessonId={42} />)

      expect(sendButton()).toBeDisabled()
      await user.type(questionBox(), '   ')
      expect(sendButton()).toBeDisabled()
    })

    it('уходит POST с числовым id урока, без родителя', async () => {
      const user = userEvent.setup()
      render(<LessonComments lessonId={42} />)

      await user.type(questionBox(), 'Почему так?')
      await user.click(sendButton())

      await waitFor(() => expect(posted).toHaveLength(1))
      expect(posted[0]).toEqual({ lesson: 42, content: 'Почему так?' })
    })

    it('после успеха поле очищается и список перезагружается', async () => {
      const user = userEvent.setup()
      render(<LessonComments lessonId={42} />)
      await screen.findByText(/Вопросов пока нет/)

      await user.type(questionBox(), 'Почему так?')
      const before = vi.mocked(global.fetch).mock.calls.length
      await user.click(sendButton())

      await waitFor(() => expect(questionBox()).toHaveValue(''))
      expect(toast).toHaveBeenCalledWith('Вопрос отправлен ментору', 'success')
      await waitFor(() => expect(vi.mocked(global.fetch).mock.calls.length).toBeGreaterThan(before + 1))
    })

    it('отказ виден ученику, текст не теряется', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      mockApi({ postOk: false })
      const user = userEvent.setup()
      render(<LessonComments lessonId={42} />)

      await user.type(questionBox(), 'Важный вопрос')
      await user.click(sendButton())

      await waitFor(() => expect(toast).toHaveBeenCalledWith('Не удалось отправить вопрос', 'error'))
      expect(questionBox()).toHaveValue('Важный вопрос')
    })

    it('во время отправки кнопка заблокирована — двойной вопрос не уйдёт', async () => {
      let release!: (value: Response) => void
      global.fetch = vi.fn(async (_input: RequestInfo | URL, init?: RequestInit) => {
        if (init?.method === 'POST') return new Promise<Response>((r) => { release = r })
        return Response.json({ docs: [] })
      }) as unknown as typeof fetch

      const user = userEvent.setup()
      render(<LessonComments lessonId={42} />)

      await user.type(questionBox(), 'Вопрос')
      await user.click(sendButton())

      await waitFor(() => expect(sendButton()).toBeDisabled())
      release(Response.json({}))
    })
  })

  describe('уточнение в ветке', () => {
    it('уходит ответом на вопрос, с числовыми id', async () => {
      mockApi({ pages: [[comment(5, { content: 'Исходный' })]] })
      const user = userEvent.setup()
      render(<LessonComments lessonId={42} />)

      await user.click(await screen.findByRole('button', { name: 'Уточнить' }))
      await user.type(screen.getByRole('textbox', { name: 'Уточнение к вопросу' }), 'А если без StrictMode?')
      await user.click(screen.getByRole('button', { name: 'Отправить уточнение' }))

      await waitFor(() => expect(posted).toHaveLength(1))
      expect(posted[0]).toEqual({ lesson: 42, content: 'А если без StrictMode?', parentComment: 5 })
      expect(toast).toHaveBeenCalledWith('Уточнение отправлено', 'success')
    })
  })
})
