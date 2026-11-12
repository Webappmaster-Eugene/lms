import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { CredentialsNotice, NewStudentForm, StudentCard } from '@/components/learning-access/StudentPanel'
import type { StudentDetails } from '@/components/learning-access/contracts'

const noFreeze = { active: false, since: null, endsAt: null, frozenUntil: null, reason: null, note: null, plannedAt: '2027-05-12T09:00:00.000Z' }
const details: StudentDetails = { student: { id: 7, email: 'rost@example.test', firstName: 'Ростислав', lastName: 'Ученик', telegram: null, isActive: true, isTestStudent: false, freeze: noFreeze }, impact: { progress: 3, certificates: 1, comments: 2, notes: 0, rules: 4, points: 50, blockers: [] } }
let current: StudentDetails
let failure: { error: string; status: number } | null
const requests: { url: string; method: string; body: unknown }[] = []
const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
  const method = init?.method ?? 'GET'
  if (method !== 'GET') requests.push({ url: String(url), method, body: init?.body ? JSON.parse(String(init.body)) : undefined })
  if (failure && method !== 'GET') return Response.json({ error: failure.error }, { status: failure.status })
  if (String(url).endsWith('/password')) return Response.json({ credentials: { email: 'rost@example.test', password: 'Pass2word345abc' } })
  if (method === 'POST') return Response.json({ student: { ...details.student, id: 8 }, credentials: { email: 'new@example.test', password: 'Pass2word345abc' } }, { status: 201 })
  if (method === 'DELETE') return Response.json({ deleted: true })
  if (method === 'PATCH') return Response.json({ student: current.student })
  return Response.json(current)
})

beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockClear(); requests.length = 0; failure = null; current = details })

describe('создание ученика', () => {
  it('отправляет только почту и имя, отдаёт логин и пароль наверх', async () => {
    const user = userEvent.setup()
    const onCreated = vi.fn()
    render(<NewStudentForm onCreated={onCreated} onCancel={() => undefined} />)
    await user.type(screen.getByLabelText('Почта (логин)'), 'new@example.test')
    await user.type(screen.getByLabelText('Имя'), 'Новый')
    await user.type(screen.getByLabelText('Фамилия'), 'Ученик')
    await user.click(screen.getByRole('button', { name: 'Создать ученика' }))
    await waitFor(() => expect(onCreated).toHaveBeenCalled())
    expect(requests[0]).toMatchObject({ url: '/api/manage/students', method: 'POST', body: { email: 'new@example.test', firstName: 'Новый', lastName: 'Ученик' } })
    expect(onCreated.mock.calls[0][0].credentials.password).toBe('Pass2word345abc')
  })

  it('показывает причину отказа сервера', async () => {
    failure = { error: 'Такая почта уже занята другим аккаунтом', status: 409 }
    const user = userEvent.setup()
    render(<NewStudentForm onCreated={() => undefined} onCancel={() => undefined} />)
    await user.type(screen.getByLabelText('Почта (логин)'), 'new@example.test')
    await user.type(screen.getByLabelText('Имя'), 'Новый')
    await user.type(screen.getByLabelText('Фамилия'), 'Ученик')
    await user.click(screen.getByRole('button', { name: 'Создать ученика' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Такая почта уже занята')
  })
})

describe('логин и пароль', () => {
  it('содержит готовый текст и копирует его', async () => {
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined)
    render(<CredentialsNotice credentials={{ email: 'a@example.test', password: 'Pass2word345abc' }} onClose={() => undefined} />)
    const text = screen.getByLabelText('Текст для отправки ученику') as HTMLTextAreaElement
    expect(text.value).toContain('Логин: a@example.test')
    expect(text.value).toContain('Пароль: Pass2word345abc')
    await user.click(screen.getByRole('button', { name: 'Скопировать' }))
    expect(writeText).toHaveBeenCalledWith(text.value)
    expect(await screen.findByRole('status')).toHaveTextContent('Скопировано')
  })

  it('при отказе буфера обмена просит скопировать вручную', async () => {
    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'))
    render(<CredentialsNotice credentials={{ email: 'a@example.test', password: 'Pass2word345abc' }} onClose={() => undefined} />)
    await user.click(screen.getByRole('button', { name: 'Скопировать' }))
    expect(await screen.findByRole('status')).toHaveTextContent('выделите текст вручную')
  })
})

describe('карточка ученика', () => {
  const card = (overrides: Partial<Parameters<typeof StudentCard>[0]> = {}) => {
    const props = { userId: 7, disabled: false, onChanged: vi.fn(), onDeleted: vi.fn(), onCredentials: vi.fn(), ...overrides }
    render(<StudentCard {...props} />)
    return props
  }

  it('меняет данные и сообщает об изменении', async () => {
    const user = userEvent.setup()
    const props = card()
    await user.click(await screen.findByRole('button', { name: 'Изменить данные' }))
    const lastName = screen.getByLabelText('Фамилия')
    await user.clear(lastName)
    await user.type(lastName, 'Иванов')
    await user.click(screen.getByRole('button', { name: 'Сохранить данные' }))
    await waitFor(() => expect(props.onChanged).toHaveBeenCalled())
    expect(requests[0]).toMatchObject({ url: '/api/manage/students/7', method: 'PATCH', body: { lastName: 'Иванов', telegram: null } })
  })

  it('новый пароль - только после подтверждения', async () => {
    const user = userEvent.setup()
    const props = card()
    await user.click(await screen.findByRole('button', { name: 'Новый пароль' }))
    expect(requests).toHaveLength(0)
    await user.click(screen.getByRole('button', { name: 'Создать новый пароль' }))
    await waitFor(() => expect(props.onCredentials).toHaveBeenCalledWith({ email: 'rost@example.test', password: 'Pass2word345abc' }))
  })

  it('замораживает на выбранный срок с причиной и заметкой', async () => {
    const user = userEvent.setup()
    const props = card()
    expect(await screen.findByText('Доступ до 12.05.2027')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Заморозить' }))
    const form = screen.getByRole('form', { name: 'Заморозка аккаунта' })
    await user.click(within(form).getByLabelText('6 месяцев'))
    await user.selectOptions(within(form).getByLabelText('Причина'), 'не выходит на связь')
    await user.type(within(form).getByLabelText('Заметка для себя'), 'Не отвечает с октября')
    await user.click(within(form).getByRole('button', { name: 'Заморозить аккаунт' }))
    await waitFor(() => expect(props.onChanged).toHaveBeenCalled())
    expect(requests[0]).toMatchObject({ url: '/api/manage/students/7/freeze', method: 'POST', body: { action: 'freeze', term: '6m', reason: 'no-contact', note: 'Не отвечает с октября' } })
  })

  it('заморозка до даты отправляет дату, бессрочная - без даты', async () => {
    const user = userEvent.setup()
    card()
    await user.click(await screen.findByRole('button', { name: 'Заморозить' }))
    const form = screen.getByRole('form', { name: 'Заморозка аккаунта' })
    await user.click(within(form).getByLabelText('До даты'))
    const until = within(form).getByLabelText('Разморозить')
    await user.clear(until)
    await user.type(until, '2030-01-15')
    await user.click(within(form).getByRole('button', { name: 'Заморозить аккаунт' }))
    await waitFor(() => expect(requests[0]).toMatchObject({ body: { action: 'freeze', term: 'date', until: '2030-01-15' } }))
    await user.click(screen.getByRole('button', { name: 'Заморозить' }))
    await user.click(within(screen.getByRole('form', { name: 'Заморозка аккаунта' })).getByLabelText('Бессрочно, до разморозки'))
    await user.click(screen.getByRole('button', { name: 'Заморозить аккаунт' }))
    await waitFor(() => expect(requests[1]?.body).toEqual({ action: 'freeze', term: 'forever', reason: 'vacation', note: '' }))
  })

  it('показывает заморозку и размораживает с новой плановой датой', async () => {
    current = { ...details, student: { ...details.student, freeze: { active: true, since: '2026-11-01T09:00:00.000Z', endsAt: null, frozenUntil: null, reason: 'no-contact', note: 'Пропал', plannedAt: null } } }
    const user = userEvent.setup()
    card()
    expect(await screen.findByText('Заморожен бессрочно, не выходит на связь. Войти не сможет.')).toBeInTheDocument()
    expect(screen.getByText('Пропал')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Отключить' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Разморозить' }))
    const form = screen.getByRole('form', { name: 'Разморозка аккаунта' })
    await user.click(within(form).getByLabelText(/Через год/))
    await user.click(within(form).getByRole('button', { name: 'Разморозить аккаунт' }))
    await waitFor(() => expect(requests[0]).toMatchObject({ url: '/api/manage/students/7/freeze', body: { action: 'unfreeze', next: '1y' } }))
  })

  it('срок, за которым начнётся плановая заморозка, объясняет, что ученик останется замороженным', async () => {
    current = { ...details, student: { ...details.student, freeze: { active: true, since: '2026-11-01T09:00:00.000Z', endsAt: '2027-08-01T09:00:00.000Z', frozenUntil: null, reason: 'vacation', note: null, plannedAt: '2027-05-12T09:00:00.000Z' } } }
    card()
    expect(await screen.findByText('Заморожен до 01.08.2027, отпуск. Войти не сможет. Потом заморозка продлится бессрочно: к этому дню истечёт срок доступа.')).toBeInTheDocument()
  })

  it('переносит и снимает плановую заморозку', async () => {
    const user = userEvent.setup()
    card()
    await user.click(await screen.findByRole('button', { name: 'Изменить срок доступа' }))
    const form = screen.getByRole('form', { name: 'Плановая заморозка' })
    const date = within(form).getByLabelText('Доступ до') as HTMLInputElement
    expect(date.value).toBe('2027-05-12')
    await user.clear(date)
    await user.type(date, '2027-09-01')
    await user.click(within(form).getByRole('button', { name: 'Сохранить дату' }))
    await waitFor(() => expect(requests[0]).toMatchObject({ body: { action: 'plan', date: '2027-09-01' } }))
    await user.click(screen.getByRole('button', { name: 'Изменить срок доступа' }))
    await user.click(screen.getByRole('button', { name: 'Без плановой заморозки' }))
    await waitFor(() => expect(requests[1]).toMatchObject({ body: { action: 'plan', date: null } }))
  })

  it('отмечает тестового ученика', async () => {
    const user = userEvent.setup()
    card()
    await user.click(await screen.findByRole('checkbox', { name: /Тестовый ученик/ }))
    await waitFor(() => expect(requests[0]).toMatchObject({ url: '/api/manage/students/7', method: 'PATCH', body: { isTestStudent: true } }))
  })

  it('отключённую раньше учётку можно только включить', async () => {
    current = { ...details, student: { ...details.student, isActive: false } }
    const user = userEvent.setup()
    card()
    await user.click(await screen.findByRole('button', { name: 'Включить' }))
    await waitFor(() => expect(requests[0]).toMatchObject({ method: 'PATCH', body: { isActive: true } }))
  })

  it('удаление требует ввода почты и показывает последствия', async () => {
    const user = userEvent.setup()
    const props = card()
    await user.click(await screen.findByRole('button', { name: 'Удалить' }))
    expect(screen.getByText(/сертификатов - 1/)).toBeInTheDocument()
    const remove = screen.getByRole('button', { name: 'Удалить навсегда' })
    expect(remove).toBeDisabled()
    await user.type(screen.getByLabelText('Для подтверждения введите почту ученика'), 'rost@example.test')
    await user.click(remove)
    await waitFor(() => expect(props.onDeleted).toHaveBeenCalled())
    expect(requests[0]).toMatchObject({ method: 'DELETE', body: { confirmEmail: 'rost@example.test' } })
  })

  it('при зачислении на буткемп удалять не даёт и называет причину', async () => {
    current = { ...details, impact: { ...details.impact, blockers: ['Ученик зачислен на буткемп'] } }
    const user = userEvent.setup()
    card()
    await user.click(await screen.findByRole('button', { name: 'Удалить' }))
    expect(screen.getByText('Ученик зачислен на буткемп')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Удалить навсегда' })).not.toBeInTheDocument()
  })

  it('пока есть несохранённые доступы, действия заблокированы и объяснено почему', async () => {
    card({ disabled: true })
    expect(await screen.findByRole('button', { name: 'Изменить данные' })).toBeDisabled()
    expect(screen.getByText('Сначала сохраните или отмените изменения доступа.')).toBeInTheDocument()
  })
})
