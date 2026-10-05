import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { InterviewRoom } from '@/lib/trainer/interview'

const run = vi.hoisted(() => vi.fn())
const cancel = vi.hoisted(() => vi.fn())
vi.mock('@/components/trainer/useCodeRunner', () => ({ useCodeRunner: () => ({ run, cancel }) }))
vi.mock('@/components/trainer/CodeEditor', () => ({ CodeEditor: ({ value, onChange, readOnly }: { value: string; onChange: (code: string) => void; readOnly?: boolean }) => <textarea aria-label="Код" value={value} onChange={(event) => onChange(event.target.value)} readOnly={readOnly} /> }))
vi.mock('next/link', async () => (await import('../helpers/component-mocks')).linkMock())
const { InterviewWorkspace } = await import('@/components/trainer/interview/InterviewWorkspace')

const token = 'aa573b25-ab70-4b9f-aec4-9dd78d38b109'
let room: InterviewRoom

beforeEach(() => {
  vi.clearAllMocks()
  room = { token, ownerId: 1, title: 'Сумма', descriptionMd: 'Обсудите сложность.', setupCode: '', code: 'console.log(42)', language: 'js', version: 1, createdAt: '2026-10-06T00:00:00Z', endedAt: null, participants: [{ id: 1, name: 'Ученик', lastSeen: new Date().toISOString() }] }
  run.mockResolvedValue({ status: 'passed', consoleOutput: ['42'], tests: [], passedCount: 0, totalCount: 0, totalMs: 1 })
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.endsWith('/compile')) return Response.json({ js: 'console.log(42)', diagnostics: [] })
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
})
