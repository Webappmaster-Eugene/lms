import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { navigationRouter, setNavigationURL } from '../helpers/url-navigation'

vi.mock('next/navigation', async () => (await import('../helpers/url-navigation')).urlNavigationMock())

const { InterviewStart } = await import('@/components/trainer/interview/InterviewStart')

/** Создание комнаты собеседования: один запрос на одно нажатие и понятный отказ. */

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

const created = (token = 'room-token') => Response.json({ room: { token } }, { status: 201 })

beforeEach(() => {
  setNavigationURL('/trainer/interview')
  vi.clearAllMocks()
})

afterEach(() => vi.unstubAllGlobals())

describe('создание комнаты собеседования', () => {
  it('по задаче создаёт комнату с её условием и переходит в неё', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => created('abc123')))
    render(<InterviewStart taskId="task-7" />)
    expect(screen.getByText('Комната откроется с условием и шаблоном выбранной задачи.')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Создать комнату' }))

    await waitFor(() => expect(navigationRouter().push).toHaveBeenCalledWith('/trainer/interview/abc123'))
    expect(fetch).toHaveBeenCalledWith('/api/trainer/interview', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ taskId: 'task-7' }) })
  })

  it('без задачи создаёт пустую комнату', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => created()))
    render(<InterviewStart />)
    expect(screen.getByText(/с чистым редактором/)).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Создать комнату' }))

    await waitFor(() => expect(navigationRouter().push).toHaveBeenCalledWith('/trainer/interview/room-token'))
    expect(JSON.parse(String(vi.mocked(fetch).mock.calls[0][1]?.body))).toEqual({})
  })

  it('пока комната создаётся, кнопка заблокирована и второй клик не создаёт вторую комнату', async () => {
    const user = userEvent.setup()
    const answer = deferred<Response>()
    vi.stubGlobal('fetch', vi.fn(() => answer.promise))
    render(<InterviewStart taskId="task-7" />)

    await user.click(screen.getByRole('button', { name: 'Создать комнату' }))
    const button = screen.getByRole('button', { name: 'Создаём комнату…' })
    expect(button).toBeDisabled()
    await user.click(button)
    expect(fetch).toHaveBeenCalledOnce()

    answer.resolve(created())
    await waitFor(() => expect(navigationRouter().push).toHaveBeenCalledOnce())
    // До перехода кнопка остаётся заблокированной: иначе можно успеть создать ещё одну комнату.
    expect(screen.getByRole('button', { name: 'Создаём комнату…' })).toBeDisabled()
  })

  it('отказ сервера показан его словами, после чего можно повторить', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(Response.json({ error: 'Слишком много комнат за час' }, { status: 429 }))
      .mockResolvedValueOnce(created('second')))
    render(<InterviewStart />)

    await user.click(screen.getByRole('button', { name: 'Создать комнату' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Слишком много комнат за час')
    expect(navigationRouter().push).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Создать комнату' }))
    await waitFor(() => expect(navigationRouter().push).toHaveBeenCalledWith('/trainer/interview/second'))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('отказ без пояснения заменяется общим текстом', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json({}, { status: 500 })))
    render(<InterviewStart />)

    await userEvent.click(screen.getByRole('button', { name: 'Создать комнату' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось создать комнату')
    expect(screen.getByRole('button', { name: 'Создать комнату' })).toBeEnabled()
  })

  // Дефект: InterviewStart.tsx:18 разбирает ответ через response.json() без защиты.
  // На ответ прокси «502 Bad Gateway» текстом пользователь видит ошибку парсера
  // JSON на английском вместо «Не удалось создать комнату».
  it.fails('сбой прокси объяснён по-русски — дефект: показывается ошибка разбора JSON', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('Bad Gateway', { status: 502 })))
    render(<InterviewStart />)

    await userEvent.click(screen.getByRole('button', { name: 'Создать комнату' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось создать комнату')
  })
})
