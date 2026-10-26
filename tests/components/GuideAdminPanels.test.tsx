import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'

vi.mock('next/link', async () => (await import('../helpers/component-mocks')).linkMock())

const { GuideReviewNotice } = await import('@/components/guides/GuideReviewNotice')
const { GuideStats } = await import('@/components/guides/GuideStats')

type ReviewProps = Parameters<typeof GuideReviewNotice>[0]
type StatsProps = Parameters<typeof GuideStats>[0]
type DueGuide = { id: number; title: string; reviewBy: string; isPublished: boolean }

const NOW = new Date('2026-10-26T09:00:00.000Z')
const admin = { id: 1, role: 'admin' }
const student = { id: 2, role: 'student' }

beforeEach(() => {
  vi.useFakeTimers({ toFake: ['Date'] })
  vi.setSystemTime(NOW)
})

afterEach(() => vi.useRealTimers())

describe('блок «Пора пересмотреть» над списком гайдов', () => {
  function cms({ pages = [[]] as DueGuide[][], unreviewed = 0 } = {}) {
    const payload = {
      find: vi.fn(async ({ page }: { page: number }) => ({ docs: pages[page - 1] ?? [], hasNextPage: page < pages.length })),
      count: vi.fn(async () => ({ totalDocs: unreviewed })),
    }
    return { payload, props: (user: unknown = admin) => ({ payload, user }) as unknown as ReviewProps }
  }

  it('не показывается и не запрашивает базу для не-админа', async () => {
    const { payload, props } = cms({ pages: [[{ id: 1, title: 'VPN', reviewBy: '2026-10-01T12:00:00.000Z', isPublished: true }]] })
    expect(await GuideReviewNotice(props(student))).toBeNull()
    expect(await GuideReviewNotice(props(null))).toBeNull()
    expect(payload.find).not.toHaveBeenCalled()
    expect(payload.count).not.toHaveBeenCalled()
  })

  it('не показывается, когда пересматривать нечего и у всех гайдов есть дата проверки', async () => {
    const { props } = cms()
    expect(await GuideReviewNotice(props())).toBeNull()
  })

  it('берёт гайды со сроком в ближайшие 14 дней, включая просроченные, раньше всего — самые срочные', async () => {
    const { payload, props } = cms()
    await GuideReviewNotice(props())
    expect(payload.find).toHaveBeenCalledWith(expect.objectContaining({
      collection: 'guides',
      where: { reviewBy: { less_than_equal: '2026-11-09T09:00:00.000Z' } },
      // id вторым ключом: при равных сроках постраничная выборка иначе теряет или дублирует гайды на границе страниц.
      sort: ['reviewBy', 'id'],
    }))
    expect(payload.count).toHaveBeenCalledWith(expect.objectContaining({ collection: 'guides', where: { reviewedAt: { exists: false } } }))
  })

  it('отличает просроченный срок от близкого и помечает черновики', async () => {
    const { props } = cms({ pages: [[
      { id: 7, title: 'Налоги самозанятого', reviewBy: '2026-10-20T12:00:00.000Z', isPublished: true },
      { id: 9, title: 'Резюме', reviewBy: '2026-11-05T12:00:00.000Z', isPublished: false },
    ]] })
    render(await GuideReviewNotice(props()))

    const section = screen.getByRole('region', { name: 'Пора пересмотреть' })
    const [overdue, soon] = within(section).getAllByRole('listitem')
    expect(within(overdue).getByRole('link', { name: 'Налоги самозанятого' })).toHaveAttribute('href', '/admin/collections/guides/7')
    expect(overdue).toHaveTextContent('срок прошёл 20 октября 2026 г.')
    expect(overdue).not.toHaveTextContent('черновик')
    expect(within(soon).getByRole('link', { name: 'Резюме' })).toHaveAttribute('href', '/admin/collections/guides/9')
    expect(soon).toHaveTextContent('срок 5 ноября 2026 г. · черновик')
    expect(soon).not.toHaveTextContent('срок прошёл')
    expect(screen.queryByText(/Без даты проверки/)).not.toBeInTheDocument()
  })

  it('собирает все страницы выборки, а не только первую', async () => {
    const { payload, props } = cms({ pages: [
      [{ id: 1, title: 'Первая страница', reviewBy: '2026-10-01T12:00:00.000Z', isPublished: true }],
      [{ id: 2, title: 'Вторая страница', reviewBy: '2026-10-02T12:00:00.000Z', isPublished: true }],
    ] })
    render(await GuideReviewNotice(props()))
    expect(payload.find).toHaveBeenCalledTimes(2)
    expect(screen.getByRole('link', { name: 'Вторая страница' })).toBeInTheDocument()
  })

  it('без сроков, но с непроверенными гайдами показывает только их число и подсказку', async () => {
    const { props } = cms({ unreviewed: 3 })
    render(await GuideReviewNotice(props()))
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
    expect(screen.getByText(/Без даты проверки: 3\./)).toBeInTheDocument()
    expect(screen.getByText('pnpm guide:check-links')).toBeInTheDocument()
  })
})

describe('статистика гайда в боковой панели CMS', () => {
  type Read = { guide: number; helpful?: 'yes' | 'no'; comment?: string }
  type Where = { and: Record<string, { equals?: unknown; exists?: boolean }>[] }

  /** Отвечает на count так, как ответила бы база на эти условия. */
  function cms(reads: Read[]) {
    const count = vi.fn(async ({ where }: { where: Where }) => ({
      totalDocs: reads.filter((read) => where.and.every((condition) => Object.entries(condition).every(([field, rule]) => {
        const value = read[field as keyof Read]
        return 'equals' in rule ? value === rule.equals : (value !== undefined) === rule.exists
      }))).length,
    }))
    return { count, props: (id: number | string | undefined, user: unknown = admin) => ({ id, req: { user, payload: { count } } }) as unknown as StatsProps }
  }

  const reads: Read[] = [
    { guide: 5, helpful: 'yes', comment: 'Спасибо' },
    { guide: 5, helpful: 'yes' },
    { guide: 5, helpful: 'no', comment: 'Устарело' },
    { guide: 5 },
    { guide: 6, helpful: 'no', comment: 'Чужой гайд' },
  ]

  function value(term: string) {
    return screen.getByText(term).nextElementSibling?.textContent
  }

  it('считает прочтения, ответы и комментарии только этого гайда и ведёт к списку', async () => {
    const { props } = cms(reads)
    render(await GuideStats(props('5')))
    expect(value('Открыли')).toBe('4')
    expect(value('Помог')).toBe('2')
    expect(value('Не помог')).toBe('1')
    expect(value('Комментарии')).toBe('2')
    expect(screen.getByRole('link', { name: 'Все прочтения и отзывы' })).toHaveAttribute('href', '/admin/collections/guide-reads?where[guide][equals]=5')
  })

  it('без прочтений показывает нули и не ведёт в пустой список', async () => {
    const { props } = cms(reads)
    render(await GuideStats(props(42)))
    expect(value('Открыли')).toBe('0')
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('не показывается ученику и у ещё не сохранённого гайда', async () => {
    const { count, props } = cms(reads)
    expect(await GuideStats(props(5, student))).toBeNull()
    expect(await GuideStats(props(undefined))).toBeNull()
    expect(count).not.toHaveBeenCalled()
  })
})
