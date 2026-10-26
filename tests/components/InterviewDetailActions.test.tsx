import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { navigationRouter, setNavigationURL } from '../helpers/url-navigation'
import type { InterviewRecordingDTO } from '@/lib/interviews/types'
import type { InterviewDetailsDTO } from '@/components/interviews/InterviewDetail'

vi.mock('next/link', async () => (await import('../helpers/component-mocks')).linkMock())
vi.mock('next/navigation', async () => (await import('../helpers/url-navigation')).urlNavigationMock())
vi.mock('@/hooks/use-video-memory', () => ({ useVideoMemory: () => ({}) }))

const { InterviewDetail } = await import('@/components/interviews/InterviewDetail')

/**
 * Страница личной записи: удаление с подтверждением, окно анализа, которое
 * нельзя закрыть посреди запроса, и опрос статуса разбора.
 */

const direction = { id: 1, slug: 'react', title: 'React.js', description: '' }
const recording: InterviewRecordingDTO = { id: 4, title: 'Техническое интервью', description: '', direction, category: 'personal', status: 'ready', size: 100, createdAt: '2026-10-11T10:00:00.000Z', isOwner: true, analysisStatus: 'idle', analysisProgress: '', analysisError: '' }

function details(overrides: Partial<InterviewRecordingDTO> = {}): InterviewDetailsDTO {
  return { recording: { ...recording, ...overrides }, analysis: null, analysisAvailable: true }
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

let hidden = false

beforeEach(() => {
  setNavigationURL('/interviews/4')
  vi.clearAllMocks()
  hidden = false
  Object.defineProperty(document, 'hidden', { configurable: true, get: () => hidden })
  vi.stubGlobal('fetch', vi.fn())
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  Reflect.deleteProperty(document, 'hidden')
})

describe('удаление своей записи', () => {
  it('удаляет только после подтверждения, во время запроса окно не закрыть, затем ведёт в «Мои собесы»', async () => {
    const user = userEvent.setup()
    const answer = deferred<Response>()
    vi.mocked(fetch).mockReturnValue(answer.promise)
    render(<InterviewDetail initial={details()} />)

    await user.click(screen.getByRole('button', { name: 'Удалить запись' }))
    const dialog = screen.getByRole('dialog', { name: 'Удалить мой собес?' })
    expect(fetch).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: 'Удалить запись и разбор' }))

    expect(within(dialog).getByRole('button', { name: 'Удаляем…' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Отмена' })).toBeDisabled()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByRole('dialog', { name: 'Удалить мой собес?' })).toBeInTheDocument()

    await act(async () => answer.resolve(Response.json({ deleted: true })))
    expect(fetch).toHaveBeenCalledWith('/api/interviews/4', { method: 'DELETE' })
    expect(navigationRouter().push).toHaveBeenCalledWith('/interviews?direction=react&category=personal')
    expect(navigationRouter().refresh).toHaveBeenCalled()
  })

  it('ошибка удаления показана в окне, запись остаётся, кнопки снова доступны', async () => {
    const user = userEvent.setup()
    vi.mocked(fetch).mockResolvedValue(Response.json({ error: 'Яндекс Диск не отвечает' }, { status: 503 }))
    render(<InterviewDetail initial={details()} />)

    await user.click(screen.getByRole('button', { name: 'Удалить запись' }))
    const dialog = screen.getByRole('dialog', { name: 'Удалить мой собес?' })
    await user.click(within(dialog).getByRole('button', { name: 'Удалить запись и разбор' }))

    expect(await within(dialog).findByRole('alert')).toHaveTextContent('Яндекс Диск не отвечает')
    expect(within(dialog).getByRole('button', { name: 'Удалить запись и разбор' })).toBeEnabled()
    expect(navigationRouter().push).not.toHaveBeenCalled()
    await user.click(within(dialog).getByRole('button', { name: 'Отмена' }))

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Техническое интервью' })).toBeInTheDocument()
    expect(screen.getByRole('alert')).toHaveTextContent('Яндекс Диск не отвечает')
  })

  it('ответ прокси без JSON при удалении заменяется понятным текстом', async () => {
    const user = userEvent.setup()
    vi.mocked(fetch).mockResolvedValue(new Response('<html>Bad Gateway</html>', { status: 502 }))
    render(<InterviewDetail initial={details()} />)

    await user.click(screen.getByRole('button', { name: 'Удалить запись' }))
    await user.click(screen.getByRole('button', { name: 'Удалить запись и разбор' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось выполнить действие. Попробуйте ещё раз.')
  })
})

describe('окно анализа', () => {
  it('«Отмена» и Escape закрывают окно без запроса', async () => {
    const user = userEvent.setup()
    render(<InterviewDetail initial={details()} />)

    await user.click(screen.getByRole('button', { name: 'Анализировать мой собес' }))
    await user.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Анализировать мой собес' }))
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('пока разбор запускается, форма заблокирована и окно не закрывается', async () => {
    const user = userEvent.setup()
    const answer = deferred<Response>()
    vi.mocked(fetch).mockReturnValue(answer.promise)
    render(<InterviewDetail initial={details()} />)

    await user.click(screen.getByRole('button', { name: 'Анализировать мой собес' }))
    await user.click(screen.getByRole('checkbox'))
    await user.click(screen.getByRole('button', { name: 'Получить разбор' }))

    const dialog = screen.getByRole('dialog', { name: 'Разбор моего собеседования' })
    expect(within(dialog).getByRole('button', { name: 'Запускаем…' })).toBeDisabled()
    expect(within(dialog).getByRole('button', { name: 'Отмена' })).toBeDisabled()
    expect(within(dialog).getByRole('combobox', { name: 'Целевой грейд' })).toBeDisabled()
    fireEvent.keyDown(document, { key: 'Escape' })
    expect(screen.getByRole('dialog')).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledOnce()

    await act(async () => answer.resolve(Response.json({ analysisStatus: 'queued' })))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByText('Разбор в очереди')).toBeInTheDocument()
  })
})

describe('опрос статуса разбора', () => {
  const tick = (ms: number) => act(async () => { await vi.advanceTimersByTimeAsync(ms) })

  it('раз в 5 секунд обновляет ход разбора и прекращает опрос, когда разбор завершился ошибкой', async () => {
    vi.useFakeTimers()
    vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json(details({ analysisStatus: 'processing', analysisProgress: 'Расшифровываем запись' })))
      .mockResolvedValueOnce(Response.json(details({ analysisStatus: 'failed', analysisError: 'Сервис не смог разобрать запись' })))
    render(<InterviewDetail initial={details({ analysisStatus: 'queued' })} />)
    expect(screen.getByText('Разбор в очереди')).toBeInTheDocument()

    await tick(4999)
    expect(fetch).not.toHaveBeenCalled()
    await tick(1)
    expect(fetch).toHaveBeenCalledWith('/api/interviews/4', { signal: expect.any(AbortSignal) })
    expect(screen.getByText('Готовим разбор')).toBeInTheDocument()
    expect(screen.getByText('Расшифровываем запись')).toBeInTheDocument()

    await tick(5000)
    expect(screen.getByRole('alert')).toHaveTextContent('Сервис не смог разобрать запись')
    expect(screen.getByRole('button', { name: 'Повторить анализ' })).toBeEnabled()
    await tick(30_000)
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('сбой опроса виден, но опрос продолжается и снимает ошибку при успехе', async () => {
    vi.useFakeTimers()
    vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json({ error: 'Сервис временно недоступен' }, { status: 503 }))
      .mockResolvedValueOnce(Response.json(details({ analysisStatus: 'processing' })))
    render(<InterviewDetail initial={details({ analysisStatus: 'queued' })} />)

    await tick(5000)
    expect(screen.getByRole('alert')).toHaveTextContent('Сервис временно недоступен')
    await tick(5000)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(screen.getByText('Готовим разбор')).toBeInTheDocument()
  })

  it('на скрытой вкладке не опрашивает, а при возвращении обновляет сразу', async () => {
    vi.useFakeTimers()
    vi.mocked(fetch).mockResolvedValue(Response.json(details({ analysisStatus: 'processing' })))
    render(<InterviewDetail initial={details({ analysisStatus: 'queued' })} />)

    hidden = true
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    await tick(20_000)
    expect(fetch).not.toHaveBeenCalled()

    hidden = false
    act(() => { document.dispatchEvent(new Event('visibilitychange')) })
    await tick(0)
    expect(fetch).toHaveBeenCalledOnce()
    expect(screen.getByText('Готовим разбор')).toBeInTheDocument()
  })

  it('чужую запись в обработке не опрашивает', async () => {
    vi.useFakeTimers()
    render(<InterviewDetail initial={details({ analysisStatus: 'queued', isOwner: false, category: 'community' })} />)

    await tick(20_000)

    expect(fetch).not.toHaveBeenCalled()
  })
})
