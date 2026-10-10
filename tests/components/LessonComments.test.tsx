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
  deletedAt?: string | null
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
    if (init?.method === 'PATCH') return Response.json({ docs: [] })
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

    it('ответ ментора на экране — уведомление о нём отмечается прочитанным', async () => {
      mockApi({ pages: [[comment(1), comment(2, { content: 'Ответ', user: 3, parentComment: 1 })]] })
      render(<LessonComments lessonId={42} />)

      await screen.findByText('Ответ')
      await waitFor(() => {
        const patch = vi.mocked(global.fetch).mock.calls.find(([, init]) => init?.method === 'PATCH')
        expect(String(patch?.[0])).toContain('/api/notifications?')
        expect(decodeURIComponent(String(patch?.[0]))).toContain(`where[link][like]=${window.location.pathname}#comment-`)
      })
    })

    it('без ответов уведомления не трогаются', async () => {
      mockApi({ pages: [[comment(1)]] })
      render(<LessonComments lessonId={42} />)

      await screen.findByText('Вопрос 1')
      expect(vi.mocked(global.fetch).mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false)
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

  describe('управление своим комментарием', () => {
    it('кнопки есть у собственного вопроса и уточнения, но не у ответа ментора', async () => {
      mockApi({ pages: [[comment(1), comment(2, { parentComment: 1 }), comment(3, { user: 9, parentComment: 1 })]] })
      render(<LessonComments lessonId={42} userId={7} />)
      await screen.findByText('Вопрос 3')
      expect(screen.getAllByRole('button', { name: 'Изменить' })).toHaveLength(2)
      expect(screen.getAllByRole('button', { name: 'Удалить' })).toHaveLength(2)
      const mentorReply = screen.getByText('Вопрос 3').closest('li') as HTMLElement
      expect(within(mentorReply).queryByRole('button', { name: 'Изменить' })).not.toBeInTheDocument()
    })

    it('редактирование предзаполнено, сохраняет только обрезанный текст', async () => {
      mockApi({ pages: [[comment(1)]] })
      const user = userEvent.setup()
      render(<LessonComments lessonId={42} userId={7} />)
      await user.click(await screen.findByRole('button', { name: 'Изменить' }))
      const input = screen.getByRole('textbox', { name: 'Текст комментария' })
      expect(input).toHaveValue('Вопрос 1')
      await user.clear(input)
      await user.type(input, '  Исправленный вопрос  ')
      await user.click(screen.getByRole('button', { name: 'Сохранить' }))
      await waitFor(() => expect(toast).toHaveBeenCalledWith('Комментарий изменён', 'success'))
      const call = vi.mocked(fetch).mock.calls.find(([url, init]) => String(url) === '/api/comments/1' && init?.method === 'PATCH')
      expect(JSON.parse(String(call?.[1]?.body))).toEqual({ content: 'Исправленный вопрос' })
    })

    it('отмена редактирования не отправляет запрос, пробелы сохранить нельзя', async () => {
      mockApi({ pages: [[comment(1)]] })
      const user = userEvent.setup()
      render(<LessonComments lessonId={42} userId={7} />)
      await user.click(await screen.findByRole('button', { name: 'Изменить' }))
      await user.clear(screen.getByRole('textbox', { name: 'Текст комментария' }))
      await user.type(screen.getByRole('textbox', { name: 'Текст комментария' }), '   ')
      expect(screen.getByRole('button', { name: 'Сохранить' })).toBeDisabled()
      await user.click(screen.getByRole('button', { name: 'Отмена' }))
      expect(screen.getByText('Вопрос 1')).toBeInTheDocument()
      expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === 'PATCH')).toBe(false)
    })

    it('удаление требует подтверждения и объясняет сохранение ответов', async () => {
      mockApi({ pages: [[comment(1)]] })
      const user = userEvent.setup()
      render(<LessonComments lessonId={42} userId={7} />)
      await user.click(await screen.findByRole('button', { name: 'Удалить' }))
      expect(screen.getByRole('alertdialog')).toHaveTextContent('Ответы и уточнения в ветке сохранятся')
      expect(vi.mocked(fetch).mock.calls.some(([, init]) => init?.method === 'DELETE')).toBe(false)
      await user.click(screen.getByRole('button', { name: 'Отмена' }))
      await user.click(screen.getByRole('button', { name: 'Удалить' }))
      await user.click(screen.getByRole('button', { name: 'Подтвердить удаление' }))
      await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/comments/1/remove', expect.objectContaining({ method: 'DELETE' })))
    })

    it('удалённый текст скрыт и кнопок изменений нет', async () => {
      mockApi({ pages: [[comment(1, { deletedAt: '2026-10-10T10:00:00Z', content: 'Старый секрет' })]] })
      render(<LessonComments lessonId={42} userId={7} />)
      await screen.findByText('(Комментарий удалён)')
      expect(screen.queryByText('Старый секрет')).not.toBeInTheDocument()
      expect(screen.queryByRole('button', { name: 'Изменить' })).not.toBeInTheDocument()
    })

    it('ошибка сохранения оставляет черновик и позволяет повторить запрос', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      mockApi({ pages: [[comment(1)]] })
      const original = global.fetch
      global.fetch = vi.fn(async (input, init) => init?.method === 'PATCH' && String(input) === '/api/comments/1'
        ? new Response(null, { status: 500 }) : original(input, init))
      const user = userEvent.setup()
      render(<LessonComments lessonId={42} userId={7} />)
      await user.click(await screen.findByRole('button', { name: 'Изменить' }))
      await user.type(screen.getByRole('textbox', { name: 'Текст комментария' }), ' важное')
      await user.click(screen.getByRole('button', { name: 'Сохранить' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('Ваш текст остался в поле')
      expect(screen.getByRole('textbox', { name: 'Текст комментария' })).toHaveValue('Вопрос 1 важное')
      expect(screen.getByRole('button', { name: 'Сохранить' })).toBeEnabled()
    })

    it('пока идёт удаление, подтверждение и отмена заблокированы, после ошибки можно повторить', async () => {
      vi.spyOn(console, 'error').mockImplementation(() => {})
      mockApi({ pages: [[comment(1)]] })
      const original = global.fetch
      let release: ((response: Response) => void) | undefined
      global.fetch = vi.fn(async (input, init) => init?.method === 'DELETE'
        ? new Promise<Response>((resolve) => { release = resolve }) : original(input, init))
      const user = userEvent.setup()
      render(<LessonComments lessonId={42} userId={7} />)
      await user.click(await screen.findByRole('button', { name: 'Удалить' }))
      await user.click(screen.getByRole('button', { name: 'Подтвердить удаление' }))
      expect(screen.getByRole('button', { name: 'Удаляем…' })).toBeDisabled()
      expect(screen.getByRole('button', { name: 'Отмена' })).toBeDisabled()
      release?.(new Response(null, { status: 500 }))
      expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось удалить')
      expect(screen.getByRole('button', { name: 'Подтвердить удаление' })).toBeEnabled()
      expect(screen.getByText('Вопрос 1')).toBeInTheDocument()
    })
  })
})
