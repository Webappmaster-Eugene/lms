import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LearningAccessManager } from '@/components/learning-access/LearningAccessManager'
import type { AssignmentSnapshot } from '@/components/learning-access/contracts'

const original: AssignmentSnapshot = { userId: 34, student: { id: 34, title: 'Александр Студент' }, mode: 'all', catalogVisibility: 'catalog', trainerMode: 'all', revision: 'a'.repeat(64), rules: [] }
let saved: Record<string, unknown> | null
let saveError: string | null
let saveStatus = 409
let snapshotError: { error: string; code: string } | null = null
const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
  const address = new URL(String(url), 'http://localhost')
  if (init?.method === 'PUT') {
    saved = JSON.parse(String(init.body)) as Record<string, unknown>
    if (saveError) return Response.json({ error: saveError }, { status: saveStatus })
    return Response.json({ ...original, ...saved, revision: 'b'.repeat(64) })
  }
  if (init?.method === 'POST') return Response.json({ courses: [{ id: 1, title: 'Node.js', access: 'full', visible: true }, { id: 2, title: 'React', access: 'closed', visible: false }], hiddenCount: 1, availableCount: 1, totalCount: 2, page: Number(address.searchParams.get('page') ?? 1), hasNextPage: false, trainer: { tasks: [{ id: 90, title: 'Тестовая задача', access: 'open', visible: true }], availableCount: 1, totalCount: 30, page: Number(address.searchParams.get('trainerPage') ?? 1), hasNextPage: Number(address.searchParams.get('trainerPage') ?? 1) === 1 } })
  if (address.searchParams.get('kind') === 'students') return Response.json({ docs: [{ id: 34, title: 'Александр (alexander@example.test)' }, { id: 35, title: 'Другой ученик' }], page: 1, hasNextPage: false })
  if (address.searchParams.get('kind') === 'targets' && address.searchParams.get('type') === 'trainer-tasks') return Response.json({ docs: [{ id: 80, title: 'Замыкания: счётчик' }], page: 1, hasNextPage: false })
  if (address.searchParams.get('kind') === 'targets' && address.searchParams.get('type') === 'trainer-topics') return Response.json({ docs: [{ id: 81, title: 'Замыкания' }], page: 1, hasNextPage: false })
  if (address.searchParams.get('kind') === 'targets') return Response.json({ docs: [{ id: address.searchParams.get('type') === 'roadmaps' ? 1 : 20, title: address.searchParams.get('type') === 'roadmaps' ? 'Backend Node.js' : 'Курс по Express' }], page: 1, hasNextPage: false })
  return snapshotError ? Response.json(snapshotError, { status: 409 }) : Response.json(original)
})

beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockClear(); saved = null; saveError = null; saveStatus = 409; snapshotError = null })

describe('админ назначает обучение', () => {
  it('при удалённой цели даёт ссылку на список назначений и не показывает сохранение', async () => {
    snapshotError = { error: 'У назначения удалена цель. Удалите правило с пустой целью.', code: 'orphaned-assignment' }
    render(<LearningAccessManager initialUserId={34} />)
    await screen.findByRole('alert')
    expect(screen.getByRole('link', { name: 'Открыть список назначений' })).toHaveAttribute('href', '/admin/collections/learning-access-grants?where[user][equals]=34')
    expect(screen.queryByRole('button', { name: 'Сохранить назначения' })).not.toBeInTheDocument()
  })

  it('показывает скрытый курс и задачи, листает тренажёр независимо от курсов', async () => {
    const user = userEvent.setup()
    render(<LearningAccessManager initialUserId={34} />)
    await screen.findByRole('heading', { name: 'Александр Студент' })
    await user.click(screen.getByRole('button', { name: 'Посмотреть доступ по курсам' }))
    await screen.findByText('Скрыты 1 неназначенных курсов.')
    await screen.findByText('Доступны 1 из 30 опубликованных задач.')
    const preview = screen.getByRole('region', { name: 'Предварительный просмотр доступа' })
    const pages = within(preview).getAllByRole('button', { name: 'Далее' })
    await user.click(pages[1])
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => init?.method === 'POST' && String(url).includes('page=1&trainerPage=2'))).toBe(true))
    expect(within(preview).getByText('React')).toBeInTheDocument()
    expect(saved).toBeNull()
  })

  it('при отказе сервера сохраняет выбор и разрешает повторное сохранение', async () => {
    saveError = 'Не удалось сохранить назначения. Повторите попытку'
    saveStatus = 500
    const user = userEvent.setup()
    render(<LearningAccessManager initialUserId={34} />)
    await screen.findByRole('heading', { name: 'Александр Студент' })
    await user.click(screen.getByRole('radio', { name: /Тренажёр выключен/ }))
    await user.click(screen.getByRole('button', { name: 'Сохранить назначения' }))
    await screen.findByRole('alert')
    expect(screen.getByRole('radio', { name: /Тренажёр выключен/ })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Сохранить назначения' })).toBeEnabled()
    saveError = null
    await user.click(screen.getByRole('button', { name: 'Сохранить назначения' }))
    await screen.findByText(/Назначения сохранены/)
    expect(saved).toMatchObject({ trainerMode: 'disabled' })
  })

  it('сохраняет только видимость и тренажёр без изменения курсов, отмена возвращает оба режима', async () => {
    const user = userEvent.setup()
    render(<LearningAccessManager initialUserId={34} />)
    await screen.findByRole('heading', { name: 'Александр Студент' })
    await user.click(screen.getByRole('radio', { name: /Показывать только назначенное/ }))
    await user.click(screen.getByRole('radio', { name: /Тренажёр выключен/ }))
    expect(await screen.findByRole('button', { name: 'Другой ученик' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Отменить изменения' }))
    expect(screen.getByRole('radio', { name: /Показывать все программы/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /Весь опубликованный тренажёр/ })).toBeChecked()
    await user.click(screen.getByRole('radio', { name: /Показывать только назначенное/ }))
    await user.click(screen.getByRole('radio', { name: /Только назначенные задачи/ }))
    await user.click(screen.getByRole('button', { name: 'Сохранить назначения' }))
    await screen.findByText(/Назначения сохранены/)
    expect(saved).toMatchObject({ mode: 'all', catalogVisibility: 'assigned', trainerMode: 'assigned', rules: [] })
    expect(screen.getByRole('button', { name: 'Сохранить назначения' })).toBeDisabled()
  })

  it('назначает отдельную задачу с фильтром по теме тренажёра', async () => {
    const user = userEvent.setup()
    render(<LearningAccessManager initialUserId={34} />)
    await screen.findByRole('heading', { name: 'Александр Студент' })
    await user.selectOptions(screen.getByLabelText('Материал'), 'trainer-tasks')
    await screen.findByText('Замыкания: счётчик')
    await user.click(screen.getByText('Ограничить поиск: выбрать тему тренажёра'))
    await screen.findByRole('option', { name: 'Замыкания' })
    await user.selectOptions(screen.getByLabelText('Родительский материал'), '81')
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('type=trainer-tasks') && String(url).includes('parent=81'))).toBe(true))
    await user.click(await screen.findByRole('button', { name: 'Открыть' }))
    await user.click(screen.getByRole('button', { name: 'Сохранить назначения' }))
    await screen.findByText(/Назначения сохранены/)
    expect(saved).toMatchObject({ rules: [{ target: { relationTo: 'trainer-tasks', value: 80 }, effect: 'allow' }] })
  })

  it('сохраняет режим и правила одним действием, до сохранения блокирует смену ученика', async () => {
    const user = userEvent.setup()
    render(<LearningAccessManager initialUserId={34} />)
    await screen.findByRole('heading', { name: 'Александр Студент' })
    await user.click(screen.getByRole('radio', { name: /Только назначенные материалы/ }))
    await user.click(await screen.findByRole('button', { name: 'Открыть' }))
    expect(await screen.findByRole('button', { name: 'Другой ученик' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Сохранить назначения' }))
    await screen.findByText(/Назначения сохранены/)
    expect(saved).toMatchObject({ userId: 34, mode: 'assigned', revision: original.revision, rules: [{ target: { relationTo: 'roadmaps', value: 1 }, effect: 'allow' }] })
    expect(screen.getByRole('button', { name: 'Сохранить назначения' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Другой ученик' })).toBeEnabled()
  })

  it('показывает предварительный доступ и сбрасывает его после изменения назначения', async () => {
    const user = userEvent.setup()
    render(<LearningAccessManager initialUserId={34} />)
    await screen.findByRole('heading', { name: 'Александр Студент' })
    await user.click(screen.getByRole('button', { name: 'Посмотреть доступ по курсам' }))
    await screen.findByText('Доступны 1 из 2 опубликованных курсов.')
    expect(within(screen.getByRole('region', { name: 'Предварительный просмотр доступа' })).getByText('Скрыт')).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: /Только назначенные материалы/ }))
    expect(screen.queryByText('Доступны 1 из 2 опубликованных курсов.')).not.toBeInTheDocument()
    expect(saved).toBeNull()
  })

  it('при конфликте не сбрасывает правки, позволяет отменить их и загрузить текущие', async () => {
    saveError = 'Другой администратор уже изменил назначения'
    const user = userEvent.setup()
    render(<LearningAccessManager initialUserId={34} />)
    await screen.findByRole('heading', { name: 'Александр Студент' })
    await user.click(screen.getByRole('radio', { name: /Только назначенные материалы/ }))
    await user.click(screen.getByRole('button', { name: 'Сохранить назначения' }))
    await screen.findByRole('alert')
    expect(screen.getByRole('radio', { name: /Только назначенные материалы/ })).toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Отменить изменения' }))
    expect(screen.getByRole('radio', { name: /Все опубликованные/ })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Сохранить назначения' })).toBeDisabled()
  })

  it('после смены типа не позволяет добавить старую цель под новым типом', async () => {
    render(<LearningAccessManager initialUserId={34} />)
    await screen.findByRole('button', { name: 'Открыть' })
    fireEvent.change(screen.getByLabelText('Материал'), { target: { value: 'courses' } })
    expect(screen.queryByRole('button', { name: 'Открыть' })).not.toBeInTheDocument()
    await screen.findByText('Курс по Express')
    fireEvent.click(screen.getByRole('button', { name: 'Открыть' }))
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить назначения' }))
    await waitFor(() => expect(saved).toMatchObject({ rules: [{ target: { relationTo: 'courses', value: 20 } }] }))
  })
})
