import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LearningAccessManager } from '@/components/learning-access/LearningAccessManager'
import type { AssignmentSnapshot } from '@/components/learning-access/contracts'

const original: AssignmentSnapshot = { userId: 34, student: { id: 34, title: 'Александр Студент' }, mode: 'all', revision: 'a'.repeat(64), rules: [] }
let saved: Record<string, unknown> | null
let saveError: string | null
const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
  const address = new URL(String(url), 'http://localhost')
  if (init?.method === 'PUT') {
    saved = JSON.parse(String(init.body)) as Record<string, unknown>
    if (saveError) return Response.json({ error: saveError }, { status: 409 })
    return Response.json({ ...original, ...saved, revision: 'b'.repeat(64) })
  }
  if (init?.method === 'POST') return Response.json({ courses: [{ id: 1, title: 'Node.js', access: 'full' }, { id: 2, title: 'React', access: 'closed' }], availableCount: 1, totalCount: 2, page: 1, hasNextPage: false })
  if (address.searchParams.get('kind') === 'students') return Response.json({ docs: [{ id: 34, title: 'Александр (alexander@example.test)' }, { id: 35, title: 'Другой ученик' }], page: 1, hasNextPage: false })
  if (address.searchParams.get('kind') === 'targets') return Response.json({ docs: [{ id: address.searchParams.get('type') === 'roadmaps' ? 1 : 20, title: address.searchParams.get('type') === 'roadmaps' ? 'Backend Node.js' : 'Курс по Express' }], page: 1, hasNextPage: false })
  return Response.json(original)
})

beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockClear(); saved = null; saveError = null })

describe('админ назначает обучение', () => {
  it('сохраняет режим и правила одним действием, до сохранения блокирует смену ученика', async () => {
    const user = userEvent.setup()
    render(<LearningAccessManager initialUserId={34} />)
    await screen.findByRole('heading', { name: 'Александр Студент' })
    await user.click(screen.getByRole('radio', { name: /Только назначенные/ }))
    await user.click(await screen.findByRole('button', { name: 'Открыть' }))
    expect(screen.getByRole('button', { name: 'Другой ученик' })).toBeDisabled()
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
    expect(within(screen.getByRole('region', { name: 'Предварительный просмотр доступа' })).getByText('Закрыт')).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: /Только назначенные/ }))
    expect(screen.queryByText('Доступны 1 из 2 опубликованных курсов.')).not.toBeInTheDocument()
    expect(saved).toBeNull()
  })

  it('при конфликте не сбрасывает правки, позволяет отменить их и загрузить текущие', async () => {
    saveError = 'Другой администратор уже изменил назначения'
    const user = userEvent.setup()
    render(<LearningAccessManager initialUserId={34} />)
    await screen.findByRole('heading', { name: 'Александр Студент' })
    await user.click(screen.getByRole('radio', { name: /Только назначенные/ }))
    await user.click(screen.getByRole('button', { name: 'Сохранить назначения' }))
    await screen.findByRole('alert')
    expect(screen.getByRole('radio', { name: /Только назначенные/ })).toBeChecked()
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
