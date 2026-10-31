import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import type { ReactNode } from 'react'

import { BootcampFunnelReport } from '@/components/bootcamp/BootcampFunnelReport'
import { BootcampFunnelView } from '@/components/bootcamp/BootcampFunnelView'
import { FUNNEL_STEPS, parseFunnelFilter } from '@/lib/bootcamp-funnel'
import type { FunnelReport } from '@/server/bootcamp-funnel'

const { getLearningAccess, bootcampFunnel, logError } = vi.hoisted(() => ({
  getLearningAccess: vi.fn(async () => ({ admin: true })),
  bootcampFunnel: vi.fn(),
  logError: vi.fn(),
}))
vi.mock('@/server/learning-access', () => ({ getLearningAccess }))
vi.mock('@/server/bootcamp-funnel', () => ({ bootcampFunnel, FUNNEL_ADMIN_PATH: '/admin/bootcamp-funnel' }))
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
  queue: [{ id: 41, email: 'ivan@mail.test', name: 'Иван', reason: 'review', since: '2026-10-28T09:00:00.000Z' }],
  queueTotal: 51,
}
const filter = parseFunnelFilter({ period: '30', source: 'utm:telegram' }, new Date('2026-10-31T12:00:00Z'))
const props = { params: { segments: ['bootcamp-funnel'] }, searchParams: { period: '30' }, initPageResult: { req: { user: { id: 1, role: 'admin' }, payload: {}, i18n: {} }, permissions: {}, visibleEntities: { collections: [], globals: [] } } } as unknown as Parameters<typeof BootcampFunnelView>[0]

beforeEach(() => {
  getLearningAccess.mockReset().mockResolvedValue({ admin: true })
  bootcampFunnel.mockReset().mockResolvedValue(report)
  logError.mockReset()
})

describe('страница воронки в админке', () => {
  it('открывается админу и считает воронку по фильтру из адреса', async () => {
    render(await BootcampFunnelView(props))
    expect(screen.getByTestId('payload-template')).toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Воронка буткемпа' })).toBeInTheDocument()
    expect(bootcampFunnel).toHaveBeenCalledWith(props.initPageResult.req.payload, expect.objectContaining({ period: '30', source: null }))
  })

  it('не открывается без пользователя и не-админу', async () => {
    const anonymous = { ...props, initPageResult: { ...props.initPageResult, req: { ...props.initPageResult.req, user: null } } } as Parameters<typeof BootcampFunnelView>[0]
    await expect(BootcampFunnelView(anonymous)).rejects.toThrow('redirect:/')
    getLearningAccess.mockResolvedValue({ admin: false })
    await expect(BootcampFunnelView(props)).rejects.toThrow('redirect:/')
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
    render(<BootcampFunnelReport report={report} filter={filter} action="/admin/bootcamp-funnel" />)
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
    const { container } = render(<BootcampFunnelReport report={report} filter={filter} action="/admin/bootcamp-funnel" />)
    const form = container.querySelector('form')
    expect(form).toHaveAttribute('method', 'get')
    expect(form).toHaveAttribute('action', '/admin/bootcamp-funnel')
    expect(screen.getByRole('combobox', { name: 'Период' })).toHaveValue('30')
    expect(screen.getByRole('combobox', { name: 'Источник' })).toHaveValue('utm:telegram')
  })

  it('источники и список дел со ссылкой на заявку', () => {
    render(<BootcampFunnelReport report={report} filter={filter} action="/admin/bootcamp-funnel" />)
    const sources = within(screen.getByRole('region', { name: 'Откуда пришли' }))
    expect(sources.getByRole('row', { name: /прямой заход/ })).toHaveTextContent('прямой заход32100')
    const queue = within(screen.getByRole('region', { name: 'Ждут вашего действия' }))
    expect(queue.getByRole('link', { name: 'Иван, ivan@mail.test' })).toHaveAttribute('href', '/admin/collections/bootcamp-leads/41')
    expect(queue.getByText(/Решение ждёт ответа, с 28 октября/)).toBeInTheDocument()
    expect(queue.getByText('Всего таких заявок 51, здесь самые давние 1.')).toBeInTheDocument()
  })

  it('пустой период - подсказка вместо таблицы, тексты без длинного тире', () => {
    const empty: FunnelReport = { ...report, steps: report.steps.map((step) => ({ ...step, count: 0, fromPrevious: null, fromLeads: null })), sources: [], queue: [], queueTotal: 0 }
    const { container } = render(<BootcampFunnelReport report={empty} filter={{ ...filter, source: null }} action="/admin/bootcamp-funnel" />)
    expect(screen.getByText(/За этот период заявок нет/)).toBeInTheDocument()
    expect(screen.getByText('Сейчас таких заявок нет.')).toBeInTheDocument()
    expect(container.textContent).not.toMatch(/[—–]/)
  })

  it('источник из адреса, которого нет в периоде, остаётся выбранным', () => {
    render(<BootcampFunnelReport report={{ ...report, sources: [] }} filter={{ ...filter, source: 'utm:vk' }} action="/admin/bootcamp-funnel" />)
    expect(screen.getByRole('combobox', { name: 'Источник' })).toHaveValue('utm:vk')
  })
})
