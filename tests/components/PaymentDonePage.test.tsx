import { render, screen } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

import type { ReturnState } from '@/server/bootcamp-payment'

const state = vi.hoisted(() => ({ current: null as ReturnState | null }))

vi.mock('@/lib/payload', () => ({ getPayload: vi.fn(async () => ({})) }))
vi.mock('@/server/bootcamp-payment', () => ({ successReturnState: vi.fn(async () => state.current) }))
vi.mock('@/components/bootcamp/CandidateFrame', () => ({ CandidateFrame: ({ children }: { children: React.ReactNode }) => <>{children}</> }))
vi.mock('@/components/bootcamp/PaymentStatusRefresh', () => ({ PaymentStatusRefresh: () => null }))

import PaymentDonePage from '@/app/(entry-task)/pay/done/page'

const paid: ReturnState = { kind: 'paid', amount: '45 000 ₽', invId: 17, test: false, landingUrl: null, program: null }

async function show(next: ReturnState) {
  state.current = next
  render(await PaymentDonePage({ searchParams: Promise.resolve({}) }))
}

describe('возврат с оплаты', () => {
  beforeEach(() => {
    state.current = null
  })

  it('настоящая оплата обещает письма с доступом', async () => {
    await show(paid)
    expect(screen.getByRole('heading', { name: 'Оплата получена' })).toBeInTheDocument()
    expect(screen.getByText(/придут письма с доступом/)).toBeInTheDocument()
  })

  it('тестовая оплата не обещает доступ: зачисление она не запускает', async () => {
    await show({ ...paid, test: true })
    expect(screen.getByRole('heading', { name: 'Тестовая оплата прошла' })).toBeInTheDocument()
    expect(screen.getByText(/Деньги не списаны/)).toBeInTheDocument()
    expect(screen.queryByText(/придут письма/)).toBeNull()
  })

  it('неподтверждённая оплата остаётся на проверке', async () => {
    await show({ ...paid, kind: 'pending' })
    expect(screen.getByRole('heading', { name: 'Проверяем оплату' })).toBeInTheDocument()
  })
})
