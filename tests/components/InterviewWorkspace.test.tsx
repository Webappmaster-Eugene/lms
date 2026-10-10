import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { InterviewRoom } from '@/lib/trainer/interview'

const run = vi.hoisted(() => vi.fn())
const cancel = vi.hoisted(() => vi.fn())
vi.mock('@/components/trainer/useCodeRunner', () => ({ useCodeRunner: () => ({ run, cancel }) }))
vi.mock('@/components/trainer/CodeEditor', () => ({ CodeEditor: ({ value, onChange, readOnly }: { value: string; onChange: (code: string) => void; readOnly?: boolean }) => <textarea aria-label="Код" value={value} onChange={(event) => onChange(event.target.value)} readOnly={readOnly} /> }))
vi.mock('@/components/trainer/FrontendEditor', () => ({ FrontendEditor: ({ value, onChange, previewHtml, previewUrl }: { value: string; onChange: (code: string) => void; previewHtml?: string | null; previewUrl?: string | null }) => <div><textarea aria-label="Файлы проекта" value={value} onChange={(event) => onChange(event.target.value)} />{previewHtml && <p>Предпросмотр обновлён</p>}{previewUrl && <output aria-label="Адрес предпросмотра">{previewUrl}</output>}</div> }))
vi.mock('next/link', async () => (await import('../helpers/component-mocks')).linkMock())
const { InterviewWorkspace } = await import('@/components/trainer/interview/InterviewWorkspace')

const token = 'aa573b25-ab70-4b9f-aec4-9dd78d38b109'
let room: InterviewRoom

beforeEach(() => {
  vi.clearAllMocks()
  room = { token, ownerId: 1, title: 'Сумма', descriptionMd: 'Обсудите сложность.', setupCode: '', code: 'console.log(42)', language: 'js', version: 1, createdAt: '2026-10-06T00:00:00Z', endedAt: null, participants: [{ id: 1, name: 'Ученик', lastSeen: new Date().toISOString() }] }
  run.mockResolvedValue({ status: 'passed', consoleOutput: ['42'], tests: [], passedCount: 0, totalCount: 0, totalMs: 1 })
  let previewSequence = 0
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.includes('/preview-release/')) return new Response(null, { status: 204 })
    if (url.endsWith('/compile')) return Response.json({ js: 'console.log(42)', diagnostics: [] })
    if (url.endsWith('/run')) {
      const data = JSON.parse(String(init?.body))
      if (data.language === 'next') {
        const leaseToken = (++previewSequence).toString().padStart(48, 'a')
        return Response.json({ preview: { leaseToken, previewPath: `/api/trainer/preview/${leaseToken}/` } })
      }
      return Response.json(data.language === 'go'
        ? { result: { status: 'passed', consoleOutput: ['Go output'], tests: [], passedCount: 0, totalCount: 0, totalMs: 1 } }
        : { preview: { html: '<h1>Предпросмотр</h1>' } })
    }
    if (init?.method === 'PATCH') {
      const data = JSON.parse(String(init.body))
      room = { ...room, code: data.code, language: data.language, version: room.version + 1 }
    }
    return Response.json({ room, userId: 1 })
  }))
})

describe('рабочее место собеседования', () => {
  it('показывает условие и запускает код локально без тестов задачи и отправки прогресса', async () => {
    const user = userEvent.setup()
    render(<InterviewWorkspace token={token} />)
    await screen.findByRole('heading', { name: 'Сумма' })
    expect(screen.getByText('Обсудите сложность.')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Отправить' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Запустить' }))
    await waitFor(() => expect(screen.getByText('42')).toBeInTheDocument())
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ allowNoTests: true, userCode: 'console.log(42)', testCode: '', cases: [] }))
    expect(vi.mocked(fetch).mock.calls.every(([url]) => String(url).includes('/interview/'))).toBe(true)
  })

  it('компилирует TypeScript через комнату и не вызывает submit/typecheck задачи', async () => {
    const user = userEvent.setup()
    render(<InterviewWorkspace token={token} />)
    await screen.findByRole('heading', { name: 'Сумма' })
    fireEvent.change(screen.getByLabelText('Код'), { target: { value: 'const value: number = 42; console.log(value)' } })
    await user.selectOptions(screen.getByLabelText('Язык решения'), 'ts')
    await user.click(screen.getByRole('button', { name: 'Запустить' }))
    await waitFor(() => expect(run).toHaveBeenCalled())
    expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url) === `/api/trainer/interview/${token}/compile`)).toBe(true)
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ language: 'ts', userCode: 'console.log(42)' }))
    expect(vi.mocked(fetch).mock.calls.some(([url]) => /submit|typecheck/.test(String(url)))).toBe(false)
  })

  it('закрытая комната оставляет код для чтения и запрещает запуск и приглашение', async () => {
    room.endedAt = '2026-10-06T00:30:00Z'
    render(<InterviewWorkspace token={token} />)
    await screen.findByRole('heading', { name: 'Сумма' })
    expect(screen.getByLabelText('Код')).toHaveAttribute('readonly')
    expect(screen.getByRole('button', { name: 'Запустить' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Пригласить' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Завершить' })).not.toBeInTheDocument()
  })

  it('запускает Go на сервере комнаты и сохраняет JS-черновик при переключении языка', async () => {
    const user = userEvent.setup()
    render(<InterviewWorkspace token={token} />)
    await screen.findByRole('heading', { name: 'Сумма' })
    await user.selectOptions(screen.getByLabelText('Язык решения'), 'go')
    expect(screen.getByLabelText<HTMLTextAreaElement>('Код').value).toContain('package main')
    expect(screen.queryByLabelText('Автозапуск')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Запустить' }))
    await screen.findByText('Go output')
    expect(run).not.toHaveBeenCalled()
    const runtimeCall = vi.mocked(fetch).mock.calls.find(([url]) => String(url).endsWith('/run'))
    expect(runtimeCall?.[1]?.body).toContain('"language":"go"')
    await user.selectOptions(screen.getByLabelText('Язык решения'), 'js')
    expect(screen.getByLabelText('Код')).toHaveValue('console.log(42)')
    expect(vi.mocked(fetch).mock.calls.some(([url]) => /submit|typecheck/.test(String(url)))).toBe(false)
  })

  it('переключает комнату на проект React и обновляет предпросмотр без submit', async () => {
    const user = userEvent.setup()
    render(<InterviewWorkspace token={token} />)
    await screen.findByRole('heading', { name: 'Сумма' })
    await user.selectOptions(screen.getByLabelText('Язык решения'), 'react')
    expect((await screen.findByLabelText<HTMLTextAreaElement>('Файлы проекта')).value).toContain('App.tsx')
    await user.click(screen.getByRole('button', { name: 'Запустить' }))
    await screen.findByText('Предпросмотр обновлён')
    expect(run).not.toHaveBeenCalled()
    expect(screen.queryByRole('button', { name: 'Отправить' })).not.toBeInTheDocument()
    expect(vi.mocked(fetch).mock.calls.some(([url]) => /submit|typecheck/.test(String(url)))).toBe(false)
  })

  it('перед каждым повторным запуском Next.js закрывает предыдущую сессию и освобождает последнюю при выходе', async () => {
    const user = userEvent.setup()
    const view = render(<InterviewWorkspace token={token} />)
    await screen.findByRole('heading', { name: 'Сумма' })
    await user.selectOptions(screen.getByLabelText('Язык решения'), 'next')
    const leases: string[] = []
    for (let i = 0; i < 3; i++) {
      await user.click(screen.getByRole('button', { name: 'Запустить' }))
      await waitFor(() => expect(screen.getByLabelText('Адрес предпросмотра')).toHaveTextContent((i + 1).toString().padStart(48, 'a')))
      leases.push((i + 1).toString().padStart(48, 'a'))
    }
    const calls = vi.mocked(fetch).mock.calls
    const runs = calls.map(([url], index) => String(url).endsWith('/run') ? index : -1).filter((index) => index >= 0)
    for (let i = 1; i < runs.length; i++) {
      const releaseIndex = calls.findIndex(([url]) => String(url).endsWith(`/preview-release/${leases[i - 1]}`))
      expect(releaseIndex).toBeGreaterThan(runs[i - 1])
      expect(releaseIndex).toBeLessThan(runs[i])
    }
    view.unmount()
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledWith(`/api/trainer/preview-release/${leases[2]}`, expect.objectContaining({ method: 'POST', keepalive: true })))
  })

  it('закрывает Next.js-предпросмотр при смене языка и при pagehide', async () => {
    const user = userEvent.setup()
    render(<InterviewWorkspace token={token} />)
    await screen.findByRole('heading', { name: 'Сумма' })
    await user.selectOptions(screen.getByLabelText('Язык решения'), 'next')
    await user.click(screen.getByRole('button', { name: 'Запустить' }))
    await screen.findByLabelText('Адрес предпросмотра')
    const leaseToken = '1'.padStart(48, 'a')
    fireEvent(window, new Event('pagehide'))
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledWith(`/api/trainer/preview-release/${leaseToken}`, expect.objectContaining({ keepalive: true })))
    vi.mocked(fetch).mockClear()
    await user.selectOptions(screen.getByLabelText('Язык решения'), 'react')
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledWith(`/api/trainer/preview-release/${leaseToken}`, expect.objectContaining({ keepalive: true })))
    expect(screen.queryByLabelText('Адрес предпросмотра')).not.toBeInTheDocument()
  })

  it('показывает отказ закрытия сессии и не создаёт ещё один Next.js-предпросмотр', async () => {
    const user = userEvent.setup()
    render(<InterviewWorkspace token={token} />)
    await screen.findByRole('heading', { name: 'Сумма' })
    await user.selectOptions(screen.getByLabelText('Язык решения'), 'next')
    await user.click(screen.getByRole('button', { name: 'Запустить' }))
    await screen.findByLabelText('Адрес предпросмотра')
    const fallbackFetch = vi.mocked(fetch).getMockImplementation()
    if (!fallbackFetch) throw new Error('Fetch mock is missing')
    vi.mocked(fetch).mockImplementation(async (url, options) => String(url).includes('/preview-release/') ? new Response(null, { status: 503 }) : fallbackFetch(url, options))
    await user.click(screen.getByRole('button', { name: 'Запустить' }))
    await screen.findByText('Не удалось закрыть прежний предпросмотр. Повторите запуск.')
    expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('/run'))).toHaveLength(1)
    expect(screen.getByLabelText('Адрес предпросмотра')).toHaveTextContent('1'.padStart(48, 'a'))
    expect(screen.getByRole('button', { name: 'Запустить' })).toBeEnabled()
  })

  it('освобождает сессию из запоздалого ответа после смены языка', async () => {
    const user = userEvent.setup()
    const pending: { resolve?: (response: Response) => void } = {}
    const nextResponse = new Promise<Response>((resolve) => { pending.resolve = resolve })
    const fallbackFetch = vi.mocked(fetch).getMockImplementation()
    if (!fallbackFetch) throw new Error('Fetch mock is missing')
    vi.mocked(fetch).mockImplementation(async (url, options) => String(url).endsWith('/run') ? nextResponse : fallbackFetch(url, options))
    render(<InterviewWorkspace token={token} />)
    await screen.findByRole('heading', { name: 'Сумма' })
    await user.selectOptions(screen.getByLabelText('Язык решения'), 'next')
    await user.click(screen.getByRole('button', { name: 'Запустить' }))
    await waitFor(() => expect(vi.mocked(fetch).mock.calls.some(([url]) => String(url).endsWith('/run'))).toBe(true))
    await user.selectOptions(screen.getByLabelText('Язык решения'), 'react')
    const leaseToken = 'b'.repeat(48)
    pending.resolve?.(Response.json({ preview: { leaseToken, previewPath: `/api/trainer/preview/${leaseToken}/` } }))
    await waitFor(() => expect(vi.mocked(fetch)).toHaveBeenCalledWith(`/api/trainer/preview-release/${leaseToken}`, expect.objectContaining({ method: 'POST', keepalive: true })))
    expect(screen.queryByLabelText('Адрес предпросмотра')).not.toBeInTheDocument()
  })
})
