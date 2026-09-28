import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { CompletionButton } from '@/components/lesson/CompletionButton'
import { VIDEO_ENDED_EVENT } from '@/lib/video-memory'

/**
 * Кнопка «Отметить пройденным». Id урока обязан уходить числом: строковые id
 * в relationship Payload отвергает, и прогресс не сохранится.
 */

const refresh = vi.fn()

vi.mock('next/navigation', () => ({
  useRouter: () => ({ refresh }),
}))
vi.mock('next/link', async () => (await import('../helpers/component-mocks')).linkMock())

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

  describe('что дальше после отметки', () => {
    const next = { slug: 'lesson-3', title: 'Хуки' }

    it('после отметки ведёт в следующий урок', async () => {
      render(<CompletionButton lessonId={42} isCompleted={false} next={next} courseHref="/courses/react" />)
      expect(screen.queryByRole('link', { name: /Следующий урок/ })).not.toBeInTheDocument()

      await userEvent.click(screen.getByRole('button'))

      expect(await screen.findByRole('link', { name: /Следующий урок: Хуки/ })).toHaveAttribute('href', '/lessons/lesson-3')
    })

    it('последний урок завершает курс, если остальные пройдены', async () => {
      render(<CompletionButton lessonId={42} isCompleted={false} completesCourse courseHref="/courses/react" />)

      await userEvent.click(screen.getByRole('button'))

      expect(await screen.findByText('Курс пройден!')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'Вернуться к курсу' })).toHaveAttribute('href', '/courses/react')
    })

    it('последний урок при непройденных других подсказывает вернуться к программе', () => {
      render(<CompletionButton lessonId={42} isCompleted progressId="p-1" courseHref="/courses/react" />)

      expect(screen.getByText(/остались непройденные/)).toBeInTheDocument()
    })

    it('сбой сохранения не показывает переход дальше', async () => {
      global.fetch = vi.fn(async () => new Response(null, { status: 500 })) as unknown as typeof fetch
      render(<CompletionButton lessonId={42} isCompleted={false} next={next} />)

      await userEvent.click(screen.getByRole('button'))

      await waitFor(() => expect(screen.getByText(/Не удалось обновить прогресс/)).toBeInTheDocument())
      expect(screen.queryByRole('link', { name: /Следующий урок/ })).not.toBeInTheDocument()
    })
  })

  describe('видео досмотрено', () => {
    const next = { slug: 'hooks', title: 'Хуки' }
    const videoEnded = () => act(() => void window.dispatchEvent(new CustomEvent(VIDEO_ENDED_EVENT)))

    it('до конца видео предложения нет', () => {
      render(<CompletionButton lessonId={1} isCompleted={false} next={next} />)

      expect(screen.queryByRole('dialog', { name: 'Видео досмотрено' })).not.toBeInTheDocument()
    })

    it('после видео предлагает отметить урок, не прокручивая к кнопке', async () => {
      const user = userEvent.setup()
      render(<CompletionButton lessonId={1} isCompleted={false} next={next} />)
      videoEnded()

      const dialog = screen.getByRole('dialog', { name: 'Видео досмотрено' })
      await user.click(within(dialog).getByRole('button', { name: 'Отметить' }))

      await waitFor(() => expect(lastRequest().body).toMatchObject({ lesson: 1, isCompleted: true }))
      expect(await within(dialog).findByRole('link', { name: /Дальше: Хуки/ })).toHaveAttribute('href', '/lessons/hooks')
    })

    it('пройденный урок после видео сразу ведёт дальше', () => {
      render(<CompletionButton lessonId={1} isCompleted progressId="5" next={next} />)
      videoEnded()

      const dialog = screen.getByRole('dialog', { name: 'Видео досмотрено' })
      expect(within(dialog).getByRole('link', { name: /Дальше: Хуки/ })).toBeInTheDocument()
      expect(within(dialog).queryByRole('button', { name: 'Отметить' })).not.toBeInTheDocument()
    })

    it('последний урок пройден — предложение исчезает, остаётся «Курс пройден»', async () => {
      const user = userEvent.setup()
      render(<CompletionButton lessonId={1} isCompleted={false} completesCourse />)
      videoEnded()

      await user.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Отметить' }))

      await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
      expect(screen.getByText('Курс пройден!')).toBeInTheDocument()
    })

    it('закрывается крестиком', async () => {
      const user = userEvent.setup()
      render(<CompletionButton lessonId={1} isCompleted={false} next={next} />)
      videoEnded()

      await user.click(screen.getByRole('button', { name: 'Закрыть' }))

      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    })
  })
})
