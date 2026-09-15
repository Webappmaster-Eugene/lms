import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { LessonNotes } from '@/components/lesson/LessonNotes'

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
