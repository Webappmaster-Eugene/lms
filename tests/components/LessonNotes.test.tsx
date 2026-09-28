import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('next/link', async () => (await import('../helpers/component-mocks')).linkMock())

const { LessonNotes } = await import('@/components/lesson/LessonNotes')

/**
 * Личные заметки к уроку — единственные данные, которые ученик вводит руками
 * и которые больше нигде не продублированы.
 */

const toast = vi.fn()

vi.mock('@/components/ui/Toast', () => ({
  useToast: () => ({ toast }),
}))

type FetchCall = { url: string; init?: RequestInit }

function mockApi(handlers: {
  load?: () => Response
  save?: () => Response
  remove?: () => Response
}) {
  const calls: FetchCall[] = []

  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    const url = String(input)
    calls.push({ url, init })

    if (init?.method === 'DELETE') {
      return handlers.remove?.() ?? new Response(null, { status: 200 })
    }
    if (init?.method === 'PATCH' || init?.method === 'POST') {
      return handlers.save?.() ?? Response.json({ doc: { id: 'n-new' } })
    }
    return handlers.load?.() ?? Response.json({ docs: [] })
  }) as unknown as typeof fetch

  return calls
}

const existingNote = () => Response.json({ docs: [{ id: 'n-1', content: 'Старая заметка' }] })

async function open(user: ReturnType<typeof userEvent.setup>) {
  await user.click(screen.getByRole('button', { name: /Мои заметки/ }))
  await waitFor(() => expect(screen.getByRole('textbox')).toBeInTheDocument())
}

describe('заметки к уроку', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApi({})
  })

  describe('загрузка существующей заметки', () => {
    it('запрашивается заметка именно этого урока', async () => {
      const calls = mockApi({})
      render(<LessonNotes lessonId={42} />)

      await waitFor(() => expect(calls.length).toBeGreaterThan(0))
      expect(calls[0].url).toContain('where[lesson][equals]=42')
    })

    it('сохранённый текст подставляется в поле', async () => {
      mockApi({ load: existingNote })
      const user = userEvent.setup()
      render(<LessonNotes lessonId={42} />)

      await open(user)

      expect(screen.getByRole('textbox')).toHaveValue('Старая заметка')
    })

    it('наличие заметки помечается точкой, не раскрывая панель', async () => {
      mockApi({ load: existingNote })
      const { container } = render(<LessonNotes lessonId={42} />)

      await waitFor(() =>
        expect(container.querySelectorAll('span.rounded-full.bg-primary')).toHaveLength(1),
      )
      expect(screen.queryByRole('textbox'), 'панель должна оставаться свёрнутой').not.toBeInTheDocument()
    })

    it('без заметки точки нет', async () => {
      const calls = mockApi({})
      const { container } = render(<LessonNotes lessonId={42} />)

      await waitFor(() => expect(calls.length).toBeGreaterThan(0))
      expect(container.querySelectorAll('span.rounded-full.bg-primary')).toHaveLength(0)
    })

    it('ответ сервера с ошибкой — тоже отказ загрузки, а не «заметки нет»', async () => {
      mockApi({ load: () => new Response(null, { status: 500 }) })
      const user = userEvent.setup()
      render(<LessonNotes lessonId={42} />)

      await open(user)

      expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить')
    })

    it('отказ загрузки не ломает панель — можно писать заново', async () => {
      global.fetch = vi.fn(async () => {
        throw new Error('сеть недоступна')
      }) as unknown as typeof fetch
      const user = userEvent.setup()
      render(<LessonNotes lessonId={42} />)

      await open(user)

      expect(screen.getByRole('textbox')).toHaveValue('')
    })
  })

  describe('панель', () => {
    it('свёрнута по умолчанию — не занимает экран урока', () => {
      render(<LessonNotes lessonId={42} />)

      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    })

    it('разворачивается и сворачивается по клику', async () => {
      const user = userEvent.setup()
      render(<LessonNotes lessonId={42} />)

      await open(user)
      await user.click(screen.getByRole('button', { name: /Мои заметки/ }))

      expect(screen.queryByRole('textbox')).not.toBeInTheDocument()
    })
  })

  describe('сохранение новой заметки', () => {
    it('уходит POST с числовым id урока', async () => {
      const calls = mockApi({})
      const user = userEvent.setup()
      render(<LessonNotes lessonId={42} />)
      await open(user)

      await user.type(screen.getByRole('textbox'), 'Новая мысль')
      await user.click(screen.getByRole('button', { name: /Сохранить/ }))

      await waitFor(() => {
        const save = calls.find((call) => call.init?.method === 'POST')
        expect(save?.url).toBe('/api/notes')
        const body = JSON.parse(String(save?.init?.body)) as Record<string, unknown>
        expect(body.lesson).toBe(42)
        expect(body.content).toBe('Новая мысль')
      })
    })

    it('успех подтверждается уведомлением', async () => {
      const user = userEvent.setup()
      render(<LessonNotes lessonId={42} />)
      await open(user)

      await user.type(screen.getByRole('textbox'), 'Текст')
      await user.click(screen.getByRole('button', { name: /Сохранить/ }))

      await waitFor(() => expect(toast).toHaveBeenCalledWith('Заметка сохранена', 'success'))
    })

    it('отказ сервера виден ученику, а не проглатывается', async () => {
      mockApi({ save: () => new Response(null, { status: 500 }) })
      const user = userEvent.setup()
      render(<LessonNotes lessonId={42} />)
      await open(user)

      await user.type(screen.getByRole('textbox'), 'Текст')
      await user.click(screen.getByRole('button', { name: /Сохранить/ }))

      await waitFor(() => expect(toast).toHaveBeenCalledWith('Не удалось сохранить заметку', 'error'))
    })

    it('после неудачи текст остаётся в поле — ввод не потерян', async () => {
      mockApi({ save: () => new Response(null, { status: 500 }) })
      const user = userEvent.setup()
      render(<LessonNotes lessonId={42} />)
      await open(user)

      await user.type(screen.getByRole('textbox'), 'Важная мысль')
      await user.click(screen.getByRole('button', { name: /Сохранить/ }))

      await waitFor(() => expect(toast).toHaveBeenCalled())
      expect(screen.getByRole('textbox')).toHaveValue('Важная мысль')
    })
  })

  describe('несохранённая правка', () => {
    it('помечается, пока текст не ушёл на сервер', async () => {
      const user = userEvent.setup()
      render(<LessonNotes lessonId={42} />)
      await open(user)

      await user.type(screen.getByRole('textbox'), 'Черновик')
      expect(screen.getByText('Не сохранено')).toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: /Сохранить/ }))
      await waitFor(() => expect(screen.queryByText('Не сохранено')).not.toBeInTheDocument())
    })

    it('без правок сохранять нечего', async () => {
      mockApi({ load: existingNote })
      const user = userEvent.setup()
      render(<LessonNotes lessonId={42} />)
      await open(user)

      expect(screen.getByRole('button', { name: /Сохранить/ })).toBeDisabled()
    })

    it('Ctrl+Enter сохраняет, не отрываясь от клавиатуры', async () => {
      const calls = mockApi({})
      const user = userEvent.setup()
      render(<LessonNotes lessonId={42} />)
      await open(user)

      await user.type(screen.getByRole('textbox'), 'Быстро{Control>}{Enter}{/Control}')

      await waitFor(() => expect(calls.some((call) => call.init?.method === 'POST')).toBe(true))
      expect(screen.getByRole('textbox')).toHaveValue('Быстро')
    })

    it('закрытие вкладки с правкой браузер переспрашивает', async () => {
      const user = userEvent.setup()
      render(<LessonNotes lessonId={42} />)
      await open(user)
      await user.type(screen.getByRole('textbox'), 'Черновик')

      const event = new Event('beforeunload', { cancelable: true })
      window.dispatchEvent(event)

      expect(event.defaultPrevented).toBe(true)
    })

    it('ссылка ведёт на все заметки', async () => {
      const user = userEvent.setup()
      render(<LessonNotes lessonId={42} />)
      await open(user)

      expect(screen.getByRole('link', { name: 'все заметки' })).toHaveAttribute('href', '/notes')
    })
  })

  describe('метки времени видео', () => {
    function withVideo(currentTime: number) {
      const el = document.createElement('video')
      el.currentTime = currentTime
      document.body.appendChild(el)
      return el
    }

    it('без видео на странице кнопки нет', async () => {
      const user = userEvent.setup()
      render(<LessonNotes lessonId={42} />)
      await open(user)

      expect(screen.queryByRole('button', { name: /Вставить время видео/ })).not.toBeInTheDocument()
    })

    it('вставляет текущее время видео туда, где курсор', async () => {
      const el = withVideo(754)
      const user = userEvent.setup()
      render(<LessonNotes lessonId={42} />)
      await open(user)

      await user.type(screen.getByRole('textbox'), 'хуки')
      await user.click(screen.getByRole('button', { name: /Вставить время видео/ }))

      expect(screen.getByRole('textbox')).toHaveValue('хуки[12:34] ')
      el.remove()
    })

    it('метки из текста — кнопки перехода к моменту видео', async () => {
      const el = withVideo(0)
      mockApi({ load: () => Response.json({ docs: [{ id: 'n-1', content: '[1:05] начало, 2:30 пример' }] }) })
      const seek = vi.fn()
      window.addEventListener('lms:video-seek', seek)
      const user = userEvent.setup()
      render(<LessonNotes lessonId={42} />)
      await open(user)
      await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue('[1:05] начало, 2:30 пример'))

      const group = screen.getByRole('group', { name: 'Перейти к моменту видео' })
      await user.click(within(group).getByRole('button', { name: /2:30/ }))

      expect((seek.mock.calls[0][0] as CustomEvent).detail).toEqual({ seconds: 150 })
      window.removeEventListener('lms:video-seek', seek)
      el.remove()
    })
  })

  describe('обновление существующей заметки', () => {
    it('уходит PATCH по id заметки, а не второй POST', async () => {
      const calls = mockApi({ load: existingNote })
      const user = userEvent.setup()
      render(<LessonNotes lessonId={42} />)
      await open(user)

      await user.type(screen.getByRole('textbox'), ' дополнение')
      await user.click(screen.getByRole('button', { name: /Сохранить/ }))

      await waitFor(() => {
        const save = calls.find((call) => call.init?.method === 'PATCH')
        expect(save?.url).toBe('/api/notes/n-1')
      })
      expect(calls.some((call) => call.init?.method === 'POST')).toBe(false)
    })
  })

  describe('удаление', () => {
    it('кнопки удаления нет, пока заметка не сохранена', async () => {
      const user = userEvent.setup()
      render(<LessonNotes lessonId={42} />)
      await open(user)

      expect(screen.queryByRole('button', { name: /Удалить/ })).not.toBeInTheDocument()
    })

    it('удаляет по id и очищает поле', async () => {
      const calls = mockApi({ load: existingNote })
      const user = userEvent.setup()
      render(<LessonNotes lessonId={42} />)
      await open(user)

      await user.click(screen.getByRole('button', { name: /Удалить/ }))

      await waitFor(() => {
        const remove = calls.find((call) => call.init?.method === 'DELETE')
        expect(remove?.url).toBe('/api/notes/n-1')
      })
      await waitFor(() => expect(screen.getByRole('textbox')).toHaveValue(''))
      expect(toast).toHaveBeenCalledWith('Заметка удалена', 'info')
    })

    it('отказ удаления не стирает текст на экране', async () => {
      mockApi({ load: existingNote, remove: () => new Response(null, { status: 500 }) })
      const user = userEvent.setup()
      render(<LessonNotes lessonId={42} />)
      await open(user)

      await user.click(screen.getByRole('button', { name: /Удалить/ }))

      await waitFor(() => expect(toast).toHaveBeenCalledWith('Не удалось удалить заметку', 'error'))
      expect(screen.getByRole('textbox')).toHaveValue('Старая заметка')
    })
  })

  describe('ограничения ввода', () => {
    it('пустую заметку сохранить нельзя', async () => {
      const user = userEvent.setup()
      render(<LessonNotes lessonId={42} />)
      await open(user)

      expect(screen.getByRole('button', { name: /Сохранить/ })).toBeDisabled()
    })

    it('одни пробелы за текст не считаются', async () => {
      const user = userEvent.setup()
      render(<LessonNotes lessonId={42} />)
      await open(user)

      await user.type(screen.getByRole('textbox'), '   ')

      expect(screen.getByRole('button', { name: /Сохранить/ })).toBeDisabled()
    })

    it('счётчик показывает длину и предел', async () => {
      const user = userEvent.setup()
      render(<LessonNotes lessonId={42} />)
      await open(user)

      await user.type(screen.getByRole('textbox'), 'Пять')

      expect(screen.getByText('4/5000')).toBeInTheDocument()
    })

    it('поле ограничено пятью тысячами символов', async () => {
      const user = userEvent.setup()
      render(<LessonNotes lessonId={42} />)
      await open(user)

      expect(screen.getByRole('textbox')).toHaveAttribute('maxLength', '5000')
    })
  })
})
