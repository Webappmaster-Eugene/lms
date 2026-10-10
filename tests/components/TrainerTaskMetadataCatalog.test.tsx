import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'

const find = vi.hoisted(() => vi.fn())
vi.mock('next/link', async () => (await import('../helpers/component-mocks')).linkMock())
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('next/navigation', () => ({ useSearchParams: () => new URLSearchParams(), usePathname: () => '/trainer/tasks', useRouter: () => ({ replace: vi.fn() }) }))
vi.mock('@/components/ui/ShareButton', () => ({ ShareButton: () => null }))
vi.mock('@/lib/payload', () => ({ getPayload: async () => ({ auth: async () => ({ user: null }), find }) }))
vi.mock('@/server/trainer-access', () => ({ getTrainerAccess: async () => ({ admin: true, canAccessTask: () => true }) }))

const { default: AllTasksPage } = await import('@/app/(frontend)/(lists)/trainer/tasks/page')

describe('метаданные в серверном каталоге задач', () => {
  beforeEach(() => {
    find.mockReset()
    find.mockImplementation(async ({ collection }: { collection: string }) => ({
      docs: collection === 'trainer-topics' ? [{ id: 1, slug: 'go', title: 'Go' }] : [{ id: 2, slug: 'cancel', title: 'Остановка запросов', topic: 1, difficulty: 'easy', languages: ['go'], tags: ['concurrency'], companies: ['google'], interviewFormat: 'debugging', recommendedMinutes: 20 }],
      hasNextPage: false,
    }))
  })

  it('формат включается в запрос к БД, а карточка содержит все сведения без вложенных ссылок', async () => {
    render(await AllTasksPage({ searchParams: Promise.resolve({ format: 'debugging' }) }))
    expect(find).toHaveBeenCalledWith(expect.objectContaining({ collection: 'trainer-tasks', where: { and: expect.arrayContaining([{ interviewFormat: { equals: 'debugging' } }]) }, select: expect.objectContaining({ interviewFormat: true, recommendedMinutes: true, companyEvidence: true }) }))
    const card = screen.getByRole('link', { name: /Остановка запросов/ })
    expect(within(card).getByText('Поиск ошибок')).toBeInTheDocument()
    expect(within(card).getByText('Тренировка: 20 мин')).toBeInTheDocument()
    expect(within(card).getByText('Конкурентность')).toBeInTheDocument()
    expect(within(card).getByText('Google: Источник не подтверждён')).toBeInTheDocument()
    expect(within(card).queryByRole('link')).not.toBeInTheDocument()
  })

  it('неизвестный формат не отправляется как значение enum в БД', async () => {
    render(await AllTasksPage({ searchParams: Promise.resolve({ format: '__unknown_format' }) }))
    const query = find.mock.calls.find(([args]) => args.collection === 'trainer-tasks')?.[0]
    expect(query.where.and.some((condition: Record<string, unknown>) => 'interviewFormat' in condition)).toBe(false)
    expect(screen.getByRole('combobox', { name: 'Формат собеседования' })).toHaveValue('')
  })
})
