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
  refunds: [],
  refund: { available: false, viaApi: false, left: '0', note: null },
  offerUrl: 'https://info.test/bootcamp/nodejs/offer/',
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

  it('без решения входного задания допуск подтверждают отдельной кнопкой', async () => {
    fetchMock.mockResolvedValueOnce(Response.json(state({}, { status: 'new', statusLabel: 'Новая', entrySubmittedAt: null, entrySubmissionCount: 0, entryPassed: null, entryTotal: null })))
      .mockResolvedValueOnce(Response.json(state()))
    render(<LeadPathPanel />)
    await userEvent.click(await screen.findByRole('button', { name: 'Допустить' }))
    expect(screen.getByText(/Кандидат ещё не прислал решение входного задания/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Да, допустить без входного задания' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toMatchObject({ action: 'admit', withoutEntryTask: 'yes' })
  })

  it('задание ещё не отправлено: главная кнопка отправляет его, текст о продлении не показывается', async () => {
    fetchMock.mockResolvedValueOnce(Response.json(state({}, { status: 'new', statusLabel: 'Новая', entryTaskSentAt: null, entryTaskDueAt: null, entrySubmittedAt: null })))
      .mockResolvedValueOnce(Response.json(state()))
    render(<LeadPathPanel />)
    await userEvent.click(await screen.findByRole('button', { name: 'Отправить входное задание' }))
    expect(screen.getByText(/уйдёт письмо с личной ссылкой на задание/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Продлить срок и отправить задание ещё раз' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Да, отправить' }))
    await waitFor(() => expect(fetchMock).toHaveBeenCalledTimes(2))
    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toMatchObject({ action: 'extend-entry-task' })
  })

  it('задание уже ушло: кнопка продлевает срок', async () => {
    fetchMock.mockResolvedValueOnce(Response.json(state()))
    render(<LeadPathPanel />)
    expect(await screen.findByRole('button', { name: 'Продлить срок и отправить задание ещё раз' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Отправить входное задание' })).not.toBeInTheDocument()
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

  it('возврат: сумма из остатка, причина обязательна в форме, ссылка на оферту и список возвратов', async () => {
    const paidLead = { status: 'enrolled', statusLabel: 'Зачислен', admittedAt: at, paidAt: at, amount: '45 000 ₽' }
    const refundState = state({ refund: { available: true, viaApi: true, left: '45000', note: null } }, paidLead)
    const processing = state({
      refund: { available: true, viaApi: true, left: '18000', note: null },
      refunds: [{ id: 3, amount: '27 000 ₽', status: 'processing', statusLabel: 'Выполняется', method: 'robokassa', reason: 'Отказ после 8-й недели', createdAt: at, finishedAt: null }],
    }, paidLead)
    fetchMock.mockResolvedValueOnce(Response.json(refundState)).mockResolvedValueOnce(Response.json(processing))
    render(<LeadPathPanel />)
    expect(await screen.findByText('6. Возврат денег')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'оферты' })).toHaveAttribute('href', 'https://info.test/bootcamp/nodejs/offer/')

    await userEvent.click(screen.getByRole('button', { name: 'Вернуть деньги' }))
    const amount = screen.getByLabelText(/Сумма возврата/)
    expect(amount).toHaveValue('45000')
    await userEvent.clear(amount)
    await userEvent.type(amount, '27000')
    await userEvent.type(screen.getByLabelText(/Причина/), 'Отказ после 8-й недели')
    expect(screen.getByText(/заблокирует учётку GitLab и отправит письмо на ivan@mail.test/)).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Да, вернуть деньги' }))

    const list = await screen.findByRole('list', { name: 'Возвраты' })
    expect(list).toHaveTextContent('Возврат 27 000 ₽: выполняется, через Робокассу')
    const [, init] = fetchMock.mock.calls[1] as [string, RequestInit]
    expect(JSON.parse(String(init.body))).toMatchObject({ action: 'refund', amount: '27000', reason: 'Отказ после 8-й недели' })
  })

  it('оплата мимо Робокассы: только отметка возврата вручную и пояснение почему', async () => {
    fetchMock.mockResolvedValueOnce(Response.json(state({ refund: { available: true, viaApi: false, left: '45000', note: 'Оплата отмечена вручную, мимо Робокассы: верните деньги тем же способом и отметьте возврат.' } },
      { status: 'paid', statusLabel: 'Оплачен', admittedAt: at, paidAt: at, amount: '45 000 ₽' })))
    render(<LeadPathPanel />)
    expect(await screen.findByText(/мимо Робокассы/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Вернуть деньги' })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Отметить возврат вручную' }))
    expect(screen.getByRole('button', { name: 'Да, отметить возврат' })).toBeInTheDocument()
  })

  it('деньги возвращены до зачисления: зачислять нельзя, кнопки «Зачислить» нет', async () => {
    fetchMock.mockResolvedValueOnce(Response.json(state({
      refunds: [{ id: 4, amount: '45 000 ₽', status: 'done', statusLabel: 'Выполнен', method: 'manual', reason: 'Отказ до старта', createdAt: at, finishedAt: at }],
    }, { status: 'refunded', statusLabel: 'Деньги возвращены', admittedAt: at, paidAt: at, amount: '45 000 ₽' })))
    render(<LeadPathPanel />)
    expect(await screen.findByText(/Деньги возвращены до зачисления: зачислять нельзя/)).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Зачислить' })).not.toBeInTheDocument()
    expect(screen.getByRole('list', { name: 'Возвраты' })).toHaveTextContent('выполнен, отмечен вручную')
  })

  it('без Робокассы предупреждает, что оплату отмечают вручную', async () => {
    fetchMock.mockResolvedValueOnce(Response.json(state({ paymentsEnabled: false })))
    render(<LeadPathPanel />)
    await waitFor(() => expect(screen.getByText(/Робокасса не подключена/)).toBeInTheDocument())
  })
})
