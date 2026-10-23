import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const toast = vi.fn()
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ toast }) }))

const { GuideFeedback } = await import('@/components/guides/GuideFeedback')

type Call = { url: string; method: string; body: Record<string, unknown> }
let calls: Call[] = []
let release: (() => void) | null = null

/** Как REST Payload: ответ — запись целиком после правки; `hold` придерживает первый POST, как медленная сеть. */
function mockApi({ ok = true, hold = false, stored = { helpful: null as unknown, comment: null as unknown } } = {}) {
  calls = []
  global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const call = { url: String(url), method: String(init?.method), body: JSON.parse(String(init?.body ?? '{}')) as Record<string, unknown> }
    calls.push(call)
    if (hold && calls.length === 1) await new Promise<void>((resolve) => { release = resolve })
    if (!ok) return new Response(null, { status: 500 })
    Object.assign(stored, 'helpful' in call.body ? { helpful: call.body.helpful } : {}, 'comment' in call.body ? { comment: call.body.comment } : {})
    return Response.json({ doc: { id: 31, ...stored } })
  }) as unknown as typeof fetch
}

beforeEach(() => {
  vi.clearAllMocks()
  release = null
  mockApi()
})

describe('«Гайд помог?»', () => {
  it('при первом открытии отмечает прочтение одним запросом', async () => {
    render(<GuideFeedback guideId={5} initial={null} maxComment={1000} />)
    await waitFor(() => expect(calls).toHaveLength(1))
    expect(calls[0]).toEqual({ url: '/api/guide-reads?depth=0', method: 'POST', body: { guide: 5 } })
  })

  it('уже прочитанный гайд повторно не отмечает; ответ уходит правкой своей записи', async () => {
    render(<GuideFeedback guideId={5} initial={{ id: 12, helpful: null, comment: null }} maxComment={1000} />)
    await userEvent.click(screen.getByRole('button', { name: 'Да' }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Да' })).toHaveAttribute('aria-pressed', 'true'))
    expect(calls).toEqual([{ url: '/api/guide-reads/12?depth=0', method: 'PATCH', body: { helpful: 'yes' } }])
    expect(screen.getByLabelText('Спасибо! Чего не хватило бы, чтобы гайд стал ещё лучше?')).toBeInTheDocument()
  })

  it('ответ, данный раньше, чем записалось прочтение, ждёт эту запись и не создаёт вторую', async () => {
    mockApi({ hold: true })
    render(<GuideFeedback guideId={5} initial={null} maxComment={1000} />)
    await waitFor(() => expect(calls).toHaveLength(1))
    await userEvent.click(screen.getByRole('button', { name: 'Нет' }))
    expect(calls).toHaveLength(1)
    release?.()
    await waitFor(() => expect(calls).toHaveLength(2))
    expect(calls[1]).toEqual({ url: '/api/guide-reads/31?depth=0', method: 'PATCH', body: { helpful: 'no' } })
  })

  it('комментарий отправляется по кнопке; без текста кнопка неактивна', async () => {
    mockApi({ stored: { helpful: 'no', comment: null } })
    render(<GuideFeedback guideId={5} initial={{ id: 12, helpful: 'no', comment: null }} maxComment={1000} />)
    const send = screen.getByRole('button', { name: 'Отправить' })
    expect(send).toBeDisabled()
    await userEvent.type(screen.getByRole('textbox'), '  Где взять прокси?  ')
    await userEvent.click(send)
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Отзыв отправлен'))
    expect(calls).toEqual([{ url: '/api/guide-reads/12?depth=0', method: 'PATCH', body: { comment: 'Где взять прокси?' } }])
    expect(toast).toHaveBeenCalledWith('Спасибо! Ментор прочитает отзыв', 'success')
  })

  it('ошибка сервера видна ученику, ответ не отмечается выбранным', async () => {
    mockApi({ ok: false })
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<GuideFeedback guideId={5} initial={{ id: 12, helpful: null, comment: null }} maxComment={1000} />)
    await userEvent.click(screen.getByRole('button', { name: 'Да' }))
    await waitFor(() => expect(toast).toHaveBeenCalledWith('Не удалось сохранить отзыв — попробуйте ещё раз', 'error'))
    expect(screen.getByRole('button', { name: 'Да' })).toHaveAttribute('aria-pressed', 'false')
  })
})
