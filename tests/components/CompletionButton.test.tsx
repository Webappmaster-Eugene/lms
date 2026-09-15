import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { CompletionButton } from '@/components/lesson/CompletionButton'

/**
 * Кнопка «Отметить пройденным». Id урока обязан уходить числом: строковые id
 * в relationship Payload отвергает, и прогресс не сохранится.
 */

const refresh = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}))

function lastRequest() {
  const calls = vi.mocked(global.fetch).mock.calls
  const [url, init] = calls[calls.length - 1] as [string, RequestInit]
  return { url, init, body: JSON.parse(String(init.body)) as Record<string, unknown> }
}

describe('кнопка завершения урока', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    global.fetch = vi.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch
  })

  describe('внешний вид', () => {
    it('непройденный урок предлагает отметить', () => {
      render(<CompletionButton lessonId={42} isCompleted={false} />)

      expect(screen.getByRole('button')).toHaveTextContent('Отметить пройденным')
    })

    it('пройденный урок показывает это состояние', () => {
      render(<CompletionButton lessonId={42} isCompleted progressId="p-1" />)

      expect(screen.getByRole('button')).toHaveTextContent('Урок пройден')
    })
  })

  describe('первая отметка — записи прогресса ещё нет', () => {
    it('создаёт запись через POST', async () => {
      const user = userEvent.setup()
      render(<CompletionButton lessonId={42} isCompleted={false} />)

      await user.click(screen.getByRole('button'))

      await waitFor(() => expect(global.fetch).toHaveBeenCalled())
      expect(lastRequest().url).toBe('/api/user-progress')
      expect(lastRequest().init.method).toBe('POST')
    })

    it('id урока уходит числом — строку Payload не примет', async () => {
      const user = userEvent.setup()
      render(<CompletionButton lessonId={42} isCompleted={false} />)

      await user.click(screen.getByRole('button'))

      await waitFor(() => expect(global.fetch).toHaveBeenCalled())
      expect(lastRequest().body.lesson).toBe(42)
      expect(typeof lastRequest().body.lesson).toBe('number')
    })

    it('проставляет отметку и время прохождения', async () => {
      const user = userEvent.setup()
      render(<CompletionButton lessonId={42} isCompleted={false} />)

      await user.click(screen.getByRole('button'))

      await waitFor(() => expect(global.fetch).toHaveBeenCalled())
      const { body } = lastRequest()
      expect(body.isCompleted).toBe(true)
      expect(Date.parse(String(body.completedAt))).not.toBeNaN()
    })

    it('после успеха кнопка показывает пройденный урок', async () => {
      const user = userEvent.setup()
      render(<CompletionButton lessonId={42} isCompleted={false} />)

      await user.click(screen.getByRole('button'))

      await waitFor(() => expect(screen.getByRole('button')).toHaveTextContent('Урок пройден'))
    })
  })

  describe('повторная отметка — запись уже есть', () => {
    it('снимает отметку через PATCH по id записи', async () => {
      const user = userEvent.setup()
      render(<CompletionButton lessonId={42} isCompleted progressId="p-7" />)

      await user.click(screen.getByRole('button'))

      await waitFor(() => expect(global.fetch).toHaveBeenCalled())
      const { url, init, body } = lastRequest()
      expect(url).toBe('/api/user-progress/p-7')
      expect(init.method).toBe('PATCH')
      expect(body).toMatchObject({ isCompleted: false, completedAt: null })
    })

    it('возвращает отметку, не создавая вторую запись', async () => {
      const user = userEvent.setup()
      render(<CompletionButton lessonId={42} isCompleted={false} progressId="p-7" />)

      await user.click(screen.getByRole('button'))

      await waitFor(() => expect(global.fetch).toHaveBeenCalled())
      const { url, init, body } = lastRequest()
      expect(url).toBe('/api/user-progress/p-7')
      expect(init.method).toBe('PATCH')
      expect(body.isCompleted).toBe(true)
    })
  })

  describe('когда сервер ответил ошибкой', () => {
    beforeEach(() => {
      global.fetch = vi.fn(
        async () => new Response(null, { status: 500 }),
      ) as unknown as typeof fetch
    })

    it('состояние откатывается к исходному', async () => {
      const user = userEvent.setup()
      render(<CompletionButton lessonId={42} isCompleted={false} />)

      await user.click(screen.getByRole('button'))

      await waitFor(() =>
        expect(screen.getByRole('button')).toHaveTextContent('Отметить пройденным'),
      )
    })

    it('ученик видит текст ошибки, а не молчание', async () => {
      const user = userEvent.setup()
      render(<CompletionButton lessonId={42} isCompleted={false} />)

      await user.click(screen.getByRole('button'))

      expect(await screen.findByText(/Не удалось обновить прогресс/)).toBeInTheDocument()
    })

    it('страница не перезагружается — обновлять нечего', async () => {
      const user = userEvent.setup()
      render(<CompletionButton lessonId={42} isCompleted={false} />)

      await user.click(screen.getByRole('button'))

      await waitFor(() => expect(screen.getByRole('button')).not.toBeDisabled())
      expect(refresh).not.toHaveBeenCalled()
    })

    it('кнопка снова доступна — попытку можно повторить', async () => {
      const user = userEvent.setup()
      render(<CompletionButton lessonId={42} isCompleted={false} />)

      await user.click(screen.getByRole('button'))

      await waitFor(() => expect(screen.getByRole('button')).not.toBeDisabled())
    })

    it('сообщение об ошибке исчезает при следующей успешной попытке', async () => {
      const user = userEvent.setup()
      render(<CompletionButton lessonId={42} isCompleted={false} />)

      await user.click(screen.getByRole('button'))
      expect(await screen.findByText(/Не удалось обновить прогресс/)).toBeInTheDocument()

      global.fetch = vi.fn(async () => new Response(null, { status: 200 })) as unknown as typeof fetch
      await user.click(screen.getByRole('button'))

      await waitFor(() =>
        expect(screen.queryByText(/Не удалось обновить прогресс/)).not.toBeInTheDocument(),
      )
    })
  })

  describe('во время запроса', () => {
    it('кнопка заблокирована — двойной клик не создаст две записи', async () => {
      let release: (value: Response) => void = () => {}
      global.fetch = vi.fn(
        () => new Promise<Response>((resolve) => { release = resolve }),
      ) as unknown as typeof fetch

      const user = userEvent.setup()
      render(<CompletionButton lessonId={42} isCompleted={false} />)

      await user.click(screen.getByRole('button'))

      await waitFor(() => expect(screen.getByRole('button')).toBeDisabled())
      expect(global.fetch).toHaveBeenCalledTimes(1)

      release(new Response(null, { status: 200 }))
    })
  })

  describe('после успеха', () => {
    it('серверные данные страницы перезапрашиваются', async () => {
      const user = userEvent.setup()
      render(<CompletionButton lessonId={42} isCompleted={false} />)

      await user.click(screen.getByRole('button'))

      await waitFor(() => expect(refresh).toHaveBeenCalledTimes(1))
    })

    it('запрос уходит с сессионной кукой', async () => {
      const user = userEvent.setup()
      render(<CompletionButton lessonId={42} isCompleted={false} />)

      await user.click(screen.getByRole('button'))

      await waitFor(() => expect(global.fetch).toHaveBeenCalled())
      expect(lastRequest().init.credentials).toBe('include')
    })
  })
})
