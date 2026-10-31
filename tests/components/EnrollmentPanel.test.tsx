import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@payloadcms/ui', () => ({
  useDocumentInfo: () => ({ id: 5 }),
  Button: ({ children, onClick, disabled }: { children: ReactNode, onClick: () => void, disabled?: boolean }) => <button type="button" onClick={onClick} disabled={disabled}>{children}</button>,
}))
vi.mock('next/link', async () => (await import('../helpers/component-mocks')).linkMock())
const { EnrollmentPanel } = await import('@/components/bootcamp/EnrollmentPanel')

const lead = { id: 5, email: 'ivan@mail.test', name: 'Иван Петров', status: 'admitted', statusLabel: 'Допущен' }
const defaults = { firstName: 'Иван', lastName: 'Петров', username: 'ivan', group: 'nodejs-bootcamp' }
const step = (key: string, label: string, state: string, detail?: string) => ({ key, label, state, ...(detail ? { detail } : {}) })
const enrollment = (status: string, extra: Record<string, unknown> = {}) => ({
  id: 9, status, statusLabel: { queued: 'Ждёт GitLab', failed: 'Ошибка', done: 'Готово' }[status], error: null,
  firstName: 'Иван', lastName: 'Петров', gitlabUsername: 'ivan', streamGroup: 'nodejs-bootcamp', accessUntil: null,
  gitlabProjectUrl: null, lmsUserId: 31, attempts: 0, queuedAt: null, startedAt: null, finishedAt: null, lmsSignedInAt: null, gitlabSignedInAt: null,
  steps: [step('lms_account', 'Учётка LMS и приглашение', 'done', 'создана'), step('gitlab_user', 'Учётка GitLab и письмо для пароля', 'pending')],
  ...extra,
})

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

describe('панель «Зачисление» в заявке', () => {
  it('подставляет данные заявки, просит подтверждение и показывает ход', async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json({ lead, enrollment: null, defaults }))
      .mockResolvedValueOnce(Response.json({ lead, enrollment: enrollment('queued'), defaults }, { status: 201 }))
    render(<EnrollmentPanel />)
    const username = await screen.findByLabelText(/Логин GitLab/)
    expect(username).toHaveValue('ivan')
    expect(screen.getByLabelText('Имя')).toHaveValue('Иван')
    await userEvent.clear(username)
    await userEvent.type(username, 'ivan-p')

    await userEvent.click(screen.getByRole('button', { name: 'Зачислить' }))
    expect(fetchMock).toHaveBeenCalledTimes(1)
    expect(screen.getByText(/уйдут два письма/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Да, зачислить' }))

    expect(await screen.findByText('Зачисление: Ждёт GitLab')).toBeInTheDocument()
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(url).toBe('/api/bootcamp/leads/5/enrollment')
    expect(JSON.parse(String(init.body))).toEqual({ ...defaults, username: 'ivan-p', accessUntil: '' })
    expect(screen.getByText('создана')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Учётка LMS' })).toHaveAttribute('href', '/admin/collections/users/31')
  })

  it('ошибку сервера показывает, форма остаётся', async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json({ lead, enrollment: null, defaults }))
      .mockResolvedValueOnce(Response.json({ error: 'Логин ivan уже у другого зачисления' }, { status: 409 }))
    render(<EnrollmentPanel />)
    await userEvent.click(await screen.findByRole('button', { name: 'Зачислить' }))
    await userEvent.click(screen.getByRole('button', { name: 'Да, зачислить' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Логин ivan уже у другого зачисления')
    expect(screen.getByLabelText(/Логин GitLab/)).toBeInTheDocument()
  })

  it('упавшее зачисление можно повторить', async () => {
    fetchMock
      .mockResolvedValueOnce(Response.json({ lead, enrollment: enrollment('failed', { error: 'Почта уже у учётки GitLab x' }), defaults }))
      .mockResolvedValueOnce(Response.json({ enrollment: enrollment('queued') }))
      .mockResolvedValueOnce(Response.json({ lead, enrollment: enrollment('queued'), defaults }))
    render(<EnrollmentPanel />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Почта уже у учётки GitLab x')
    await userEvent.click(screen.getByRole('button', { name: 'Повторить шаги GitLab' }))
    await waitFor(() => expect(screen.getByText('Зачисление: Ждёт GitLab')).toBeInTheDocument())
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/bootcamp/enrollments/9/retry')
  })

  it('этап заявки не «Допущен» - подсказывает, но не мешает', async () => {
    fetchMock.mockResolvedValueOnce(Response.json({ lead: { ...lead, status: 'new', statusLabel: 'Новая' }, enrollment: null, defaults }))
    render(<EnrollmentPanel />)
    expect(await screen.findByText(/Этап заявки сейчас «Новая»/)).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Зачислить' })).toBeEnabled()
  })
})
