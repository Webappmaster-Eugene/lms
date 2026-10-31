import type { ReactNode } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('@payloadcms/ui', () => ({
  useDocumentInfo: () => ({ id: 5 }),
  Button: ({ children, onClick, disabled }: { children: ReactNode, onClick: () => void, disabled?: boolean }) => <button type="button" onClick={onClick} disabled={disabled}>{children}</button>,
}))
vi.mock('next/link', async () => (await import('../helpers/component-mocks')).linkMock())
const { LeadPathPanel } = await import('@/components/bootcamp/LeadPathPanel')

const at = '2026-10-31T09:00:00.000Z'
const lead = (extra: Record<string, unknown> = {}) => ({
  id: 5, email: 'ivan@mail.test', name: 'Иван Петров', status: 'diagnostic', statusLabel: 'Решение на проверке', createdAt: at,
  entryTaskSentAt: at, entryTaskDueAt: at, entrySubmittedAt: at, entrySubmissionCount: 1, entryPassed: 19, entryTotal: 19,
  admittedAt: null, amount: null, paymentDueAt: null, paymentUrl: null, paymentLinkSentAt: null, paymentPageOpenedAt: null,
  paymentStartedAt: null, paymentReminderSentAt: null, paymentExpired: false, paidAt: null, decisionMessage: null,
  ...extra,
})
const state = (extra: Record<string, unknown> = {}, leadExtra: Record<string, unknown> = {}) => ({
  lead: lead(leadExtra),
  admission: null,
  payments: [],
  enrollment: null,
  defaults: { firstName: 'Иван', lastName: 'Петров', username: 'ivan', group: 'nodejs-bootcamp', amount: '45000', dueDays: 7 },
  paymentsEnabled: true,
  paymentsTest: false,
  events: [{ id: 1, type: 'solution_submitted', label: 'Решение отправлено', message: 'Решение входного задания: 19 из 19 тестов', actor: null, at }],
  ...extra,
})

let fetchMock: ReturnType<typeof vi.fn>

beforeEach(() => {
  fetchMock = vi.fn()
  vi.stubGlobal('fetch', fetchMock)
})

describe('панель «Путь заявки»', () => {
  it('«Допустить» подставляет данные, просит подтверждение и отправляет форму', async () => {
    const admittedState = state({ admission: { enrollment: { firstName: 'Иван', lastName: 'Петров', username: 'ivan-p', group: 'nodejs-bootcamp', accessUntil: null }, comment: null } },
      { status: 'admitted', statusLabel: 'Допущен, ждёт оплаты', admittedAt: at, amount: '45 000 ₽', paymentDueAt: at, paymentUrl: 'https://learn.test/pay/x', paymentLinkSentAt: at })
    fetchMock.mockResolvedValueOnce(Response.json(state())).mockResolvedValueOnce(Response.json(admittedState))
    render(<LeadPathPanel />)
    expect(await screen.findByText('Путь заявки: Решение на проверке')).toBeInTheDocument()
    expect(screen.getByText('Решение входного задания: 19 из 19 тестов')).toBeInTheDocument()

    await userEvent.click(screen.getByRole('button', { name: 'Допустить' }))
    const username = screen.getByLabelText(/Логин GitLab/)
    expect(username).toHaveValue('ivan')
    expect(screen.getByLabelText(/Сумма к оплате/)).toHaveValue('45000')
    await userEvent.clear(username)
    await userEvent.type(username, 'ivan-p')
    expect(screen.getByText(/уйдёт письмо с личной ссылкой на оплату/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Да, допустить' }))

    expect(await screen.findByText('Путь заявки: Допущен, ждёт оплаты')).toBeInTheDocument()
    const [url, init] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(url).toBe('/api/bootcamp/leads/5/path')
    expect(JSON.parse(String(init.body))).toMatchObject({ action: 'admit', username: 'ivan-p', amount: '45000', dueDays: '7', group: 'nodejs-bootcamp' })
    expect(screen.getByRole('link', { name: 'https://learn.test/pay/x' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Отметить оплату вручную' })).toBeInTheDocument()
  })

  it('ошибку сервера показывает, форма остаётся открытой', async () => {
    fetchMock.mockResolvedValueOnce(Response.json(state())).mockResolvedValueOnce(Response.json({ error: 'Логин ivan уже у зачисленного ученика' }, { status: 409 }))
    render(<LeadPathPanel />)
    await userEvent.click(await screen.findByRole('button', { name: 'Отказать' }))
    await userEvent.click(screen.getByRole('button', { name: 'Да, отказать' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Логин ivan уже у зачисленного ученика')
    expect(screen.getByRole('button', { name: 'Да, отказать' })).toBeInTheDocument()
  })

  it('закрытая заявка: видно решение и можно вернуть на рассмотрение', async () => {
    fetchMock.mockResolvedValueOnce(Response.json(state({}, { status: 'preparation', statusLabel: 'Нужна подготовка', decisionMessage: 'Повторить промисы' })))
    render(<LeadPathPanel />)
    expect(await screen.findByText(/Текст: Повторить промисы/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Допустить' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Вернуть на рассмотрение' })).toBeInTheDocument()
  })

  it('оплата есть, зачисления нет - кнопка «Зачислить» с данными допуска', async () => {
    fetchMock.mockResolvedValueOnce(Response.json(state({ admission: { enrollment: { firstName: 'Иван', lastName: 'Петров', username: 'ivan-p', group: 'nodejs-bootcamp', accessUntil: null }, comment: null } },
      { status: 'paid', statusLabel: 'Оплачен', admittedAt: at, paidAt: at, amount: '45 000 ₽' })))
    render(<LeadPathPanel />)
    await userEvent.click(await screen.findByRole('button', { name: 'Зачислить' }))
    expect(screen.getByLabelText(/Логин GitLab/)).toHaveValue('ivan-p')
  })

  it('без Робокассы предупреждает, что оплату отмечают вручную', async () => {
    fetchMock.mockResolvedValueOnce(Response.json(state({ paymentsEnabled: false })))
    render(<LeadPathPanel />)
    await waitFor(() => expect(screen.getByText(/Робокасса не подключена/)).toBeInTheDocument())
  })
})
