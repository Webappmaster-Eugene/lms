import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'

import { BootcampFunnelReport } from '@/components/bootcamp/BootcampFunnelReport'
import { BootcampFunnelView } from '@/components/bootcamp/BootcampFunnelView'
import { FUNNEL_STEPS, parseFunnelFilter } from '@/lib/bootcamp-funnel'
import type { FunnelProgram, FunnelReport } from '@/server/bootcamp-funnel'

const { getLearningAccess, bootcampFunnel, funnelPrograms, logError } = vi.hoisted(() => ({
  getLearningAccess: vi.fn(async () => ({ admin: true })),
  bootcampFunnel: vi.fn(),
  funnelPrograms: vi.fn(),
  logError: vi.fn(),
}))
vi.mock('@/server/learning-access', () => ({ getLearningAccess }))
vi.mock('@/server/bootcamp-funnel', () => ({ bootcampFunnel, funnelPrograms, FUNNEL_ADMIN_PATH: '/admin/bootcamp-funnel' }))
vi.mock('@/lib/telemetry', () => ({ logger: { error: logError, warn: vi.fn(), info: vi.fn() } }))
vi.mock('@payloadcms/next/templates', () => ({ DefaultTemplate: ({ children }: { children: ReactNode }) => <div data-testid="payload-template">{children}</div> }))
vi.mock('next/navigation', () => ({ redirect: (href: string) => { throw new Error(`redirect:${href}`) } }))
vi.mock('next/link', async () => (await import('../helpers/component-mocks')).linkMock())

const counts = { leads: 10, submitted: 6, admitted: 4, paid: 2, enrolled: 2, gitlab: 1, mr: 0 }
const report: FunnelReport = {
  steps: FUNNEL_STEPS.map((step, index) => ({
    key: step.key,
    label: step.label,
    count: counts[step.key],
    fromPrevious: index === 0 ? null : Math.round((counts[step.key] / counts[FUNNEL_STEPS[index - 1].key]) * 100),
    fromLeads: index === 0 ? null : counts[step.key] * 10,
    median: step.key === 'submitted' ? 2.5 * 86_400_000 : null,
  })),
  entryScore: 0.82,
  revenue: { kopecks: 9_000_000, payments: 2 },
  sources: [
    { key: 'utm:telegram', label: 'telegram', leads: 7, submitted: 4, admitted: 3, paid: 2, enrolled: 2 },
    { key: 'direct', label: 'прямой заход', leads: 3, submitted: 2, admitted: 1, paid: 0, enrolled: 0 },
  ],
  queue: [
    { id: 41, email: 'ivan@mail.test', name: 'Иван', program: 'nodejs', reason: 'review', since: '2026-10-28T09:00:00.000Z', test: false },
    { id: 42, email: 'check@mail.test', name: null, program: 'nodejs', reason: 'not_enrolled', since: '2026-10-29T09:00:00.000Z', test: true },
  ],
  queueTotal: 51,
  queueElsewhere: 0,
}
const programs: FunnelProgram[] = [{ key: 'nodejs', shortTitle: 'Node.js', isActive: true }, { key: 'python', shortTitle: 'Python', isActive: true }]
const programKeys = programs.map((item) => item.key)
const filter = parseFunnelFilter({ period: '30', source: 'utm:telegram' }, new Date('2026-10-31T12:00:00Z'), programKeys)
const props = { params: { segments: ['bootcamp-funnel'] }, searchParams: { period: '30' }, initPageResult: { req: { user: { id: 1, role: 'admin' }, payload: {}, i18n: {} }, permissions: {}, visibleEntities: { collections: [], globals: [] } } } as unknown as Parameters<typeof BootcampFunnelView>[0]

beforeEach(() => {
  getLearningAccess.mockReset().mockResolvedValue({ admin: true })
  bootcampFunnel.mockReset().mockResolvedValue(report)
  funnelPrograms.mockReset().mockResolvedValue(programs)
  logError.mockReset()
})

describe('страница воронки в админке', () => {
  it('открывается админу и считает воронку по фильтру из адреса', async () => {
    render(await BootcampFunnelView(props))
    expect(screen.getByTestId('payload-template')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Воронка буткемпа' })).toBeInTheDocument()
    expect(bootcampFunnel).toHaveBeenCalledWith(props.initPageResult.req.payload, expect.objectContaining({ period: '30', source: null, program: 'nodejs' }))
    expect(screen.getByRole('combobox', { name: 'Программа' })).toHaveValue('nodejs')
  })

  it('программа из адреса открывается, пустой параметр даёт все программы', async () => {
    render(await BootcampFunnelView({ ...props, searchParams: { program: 'python' } }))
    expect(bootcampFunnel).toHaveBeenLastCalledWith(props.initPageResult.req.payload, expect.objectContaining({ program: 'python' }))
    expect(screen.getByRole('combobox', { name: 'Программа' })).toHaveValue('python')
    render(await BootcampFunnelView({ ...props, searchParams: { program: '' } }))
    expect(bootcampFunnel).toHaveBeenLastCalledWith(props.initPageResult.req.payload, expect.objectContaining({ program: null }))
  })

  it('не открывается без пользователя и не-админу', async () => {
    const anonymous = { ...props, initPageResult: { ...props.initPageResult, req: { ...props.initPageResult.req, user: null } } } as Parameters<typeof BootcampFunnelView>[0]
    await expect(BootcampFunnelView(anonymous)).rejects.toThrow('redirect:/')
    getLearningAccess.mockResolvedValue({ admin: false })
    await expect(BootcampFunnelView(props)).rejects.toThrow('redirect:/')
    expect(bootcampFunnel).not.toHaveBeenCalled()
  })

  it('сбой списка программ - то же сообщение, а не падение страницы', async () => {
    funnelPrograms.mockRejectedValue(new Error('db down'))
    render(await BootcampFunnelView(props))
    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось посчитать воронку')
    expect(bootcampFunnel).not.toHaveBeenCalled()
  })

  it('сбой расчёта - понятное сообщение и запись в журнал, а не пустая страница', async () => {
    bootcampFunnel.mockRejectedValue(new Error('db down'))
    render(await BootcampFunnelView(props))
    expect(screen.getByRole('alert')).toHaveTextContent('Не удалось посчитать воронку')
    expect(logError).toHaveBeenCalledWith('Bootcamp funnel report failed', expect.any(Error))
  })
})

describe('отчёт воронки', () => {
  it('шаги с долями, временем и итогами', () => {
    render(<BootcampFunnelReport report={report} filter={filter} programs={programs} action="/admin/bootcamp-funnel" />)
    const steps = within(screen.getByRole('region', { name: 'Шаги' }))
    const paidRow = steps.getByRole('row', { name: /Оплатили/ })
    expect(within(paidRow).getAllByRole('cell').map((cell) => cell.textContent)).toEqual(['2', '50 %', '20 %', 'нет данных'])
    expect(steps.getByRole('row', { name: /Прислали решение/ })).toHaveTextContent('2,5 дня')
    // Шаг без единого кандидата не показывает время.
    expect(within(steps.getByRole('row', { name: /первый MR/ })).getAllByRole('cell').at(-1)).toHaveTextContent('')
    expect(screen.getByText('90 000 ₽')).toBeInTheDocument()
    expect(screen.getByText('82 %')).toBeInTheDocument()
  })

  it('фильтр - обычная форма GET с выбранными значениями', () => {
    const { container } = render(<BootcampFunnelReport report={report} filter={filter} programs={programs} action="/admin/bootcamp-funnel" />)
    const form = container.querySelector('form')
    expect(form).toHaveAttribute('method', 'get')
    expect(form).toHaveAttribute('action', '/admin/bootcamp-funnel')
    expect(screen.getByRole('combobox', { name: 'Период' })).toHaveValue('30')
    expect(screen.getByRole('combobox', { name: 'Источник' })).toHaveValue('utm:telegram')
  })

  it('дела других программ не теряются за фильтром, а в общем списке у заявки названа программа', () => {
    const { unmount } = render(<BootcampFunnelReport report={{ ...report, queueElsewhere: 3 }} filter={filter} programs={programs} action="/admin/bootcamp-funnel" />)
    expect(screen.getByText('В других программах ждут действия ещё заявок: 3.')).toBeInTheDocument()
    expect(screen.queryByText(/^Node\.js\. Решение ждёт ответа/)).not.toBeInTheDocument()
    unmount()
    const everything = parseFunnelFilter({ program: '' }, new Date('2026-10-31T12:00:00Z'), programKeys)
    render(<BootcampFunnelReport report={report} filter={everything} programs={programs} action="/admin/bootcamp-funnel" />)
    expect(screen.getByRole('combobox', { name: 'Программа' })).toHaveValue('')
    expect(screen.queryByText(/В других программах/)).not.toBeInTheDocument()
    expect(screen.getByText(/^Node\.js\. Решение ждёт ответа, с 28 октября/)).toBeInTheDocument()
    expect(screen.getByText(/^Node\.js\. Тестовая заявка\. Оплачен/)).toBeInTheDocument()
  })

  it('источники и список дел со ссылкой на заявку', () => {
    render(<BootcampFunnelReport report={report} filter={filter} programs={programs} action="/admin/bootcamp-funnel" />)
    const sources = within(screen.getByRole('region', { name: 'Откуда пришли' }))
    expect(sources.getByRole('row', { name: /прямой заход/ })).toHaveTextContent('прямой заход32100')
    const queue = within(screen.getByRole('region', { name: 'Ждут вашего действия' }))
    expect(queue.getByRole('link', { name: 'Иван, ivan@mail.test' })).toHaveAttribute('href', '/admin/collections/bootcamp-leads/41')
    expect(queue.getByText(/^Решение ждёт ответа, с 28 октября/)).toBeInTheDocument()
    // Тестовая заявка в списке дел остаётся, но видно, что это проверка.
    expect(queue.getByText(/^Тестовая заявка\. Оплачен, зачисление не начато, с 29 октября/)).toBeInTheDocument()
    expect(queue.getByText('Всего таких заявок 51, здесь самые давние 2.')).toBeInTheDocument()
  })

  it('пустой период - подсказка вместо таблицы, тексты без длинного тире', () => {
    const empty: FunnelReport = { ...report, steps: report.steps.map((step) => ({ ...step, count: 0, fromPrevious: null, fromLeads: null })), sources: [], queue: [], queueTotal: 0 }
    const { container } = render(<BootcampFunnelReport report={empty} filter={{ ...filter, source: null }} programs={programs} action="/admin/bootcamp-funnel" />)
    expect(screen.getByText(/За этот период заявок нет/)).toBeInTheDocument()
    expect(screen.getByText('Сейчас таких заявок нет.')).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/[—–]/)
  })

  it('источник из адреса, которого нет в периоде, остаётся выбранным', () => {
    render(<BootcampFunnelReport report={{ ...report, sources: [] }} filter={{ ...filter, source: 'utm:vk' }} programs={programs} action="/admin/bootcamp-funnel" />)
    expect(screen.getByRole('combobox', { name: 'Источник' })).toHaveValue('utm:vk')
  })
})
