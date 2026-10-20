import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('next/link', async () => (await import('../helpers/component-mocks')).linkMock())

const refresh = vi.fn()
vi.mock('next/navigation', () => ({
  usePathname: () => '/courses/react/урок-9',
  useRouter: () => ({ refresh, push: vi.fn(), replace: vi.fn() }),
}))

const captureException = vi.fn()
vi.mock('@sentry/nextjs', () => ({ captureException }))

const { default: FrontendNotFound } = await import('@/app/(frontend)/not-found')
const { default: FrontendError } = await import('@/app/(frontend)/error')
const { default: AuthError } = await import('@/app/(auth)/error')

beforeEach(() => {
  vi.clearAllMocks()
})

describe('404 платформы', () => {
  it('объясняет, что случилось, показывает запрошенный адрес и ведёт обратно в обучение', () => {
    render(<FrontendNotFound />)
    expect(screen.getByRole('heading', { level: 1, name: 'Такой страницы нет в программе' })).toBeInTheDocument()
    expect(screen.getByText('/courses/react/урок-9', { exact: false })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'На дашборд' })).toHaveAttribute('href', '/')
    expect(screen.getByRole('link', { name: 'Каталог курсов' })).toHaveAttribute('href', '/courses')
  })
})

describe('ошибка страницы', () => {
  it('серверную ошибку не отправляет второй раз и показывает её digest как код', () => {
    render(<FrontendError error={Object.assign(new Error('An error occurred in the Server Components render'), { digest: '2913870412' })} reset={vi.fn()} />)
    expect(captureException).not.toHaveBeenCalled()
    expect(screen.getByText('2913870412')).toBeInTheDocument()
    const support = screen.getByRole('link', { name: 'Написать в поддержку' })
    const url = new URL(support.getAttribute('href') ?? '', 'https://lms.invalid')
    expect(url.pathname).toBe('/help')
    expect(url.searchParams.get('ref')).toBe('2913870412')
    expect(url.searchParams.get('from')).toBe('/courses/react/урок-9')
    expect(url.hash).toBe('#support')
  })

  it('ошибку браузера отправляет в Sentry под тем же id, что видит ученик', () => {
    const error = new TypeError('Cannot read properties of undefined')
    const { rerender } = render(<FrontendError error={error} reset={vi.fn()} />)
    rerender(<FrontendError error={error} reset={vi.fn()} />)
    expect(captureException).toHaveBeenCalledOnce()
    const [reported, hint] = captureException.mock.calls[0] as unknown as [Error, { event_id: string; mechanism: unknown }]
    expect(reported).toBe(error)
    expect(hint.mechanism).toEqual({ handled: false, type: 'auto.react.error_boundary' })
    expect(hint.event_id).toMatch(/^[0-9a-f]{32}$/)
    expect(screen.getByText(hint.event_id)).toBeInTheDocument()
  })

  it('«Попробовать снова» перезапрашивает серверную часть и сбрасывает границу ошибки', async () => {
    const reset = vi.fn()
    render(<FrontendError error={Object.assign(new Error('x'), { digest: '1' })} reset={reset} />)
    await userEvent.click(screen.getByRole('button', { name: 'Попробовать снова' }))
    expect(refresh).toHaveBeenCalledOnce()
    expect(reset).toHaveBeenCalledOnce()
  })

  it('на экране входа ведёт на страницу входа, а не в закрытый дашборд', () => {
    render(<AuthError error={Object.assign(new Error('x'), { digest: '7' })} reset={vi.fn()} />)
    expect(screen.getByRole('link', { name: 'На страницу входа' })).toHaveAttribute('href', '/login')
    expect(screen.queryByRole('link', { name: 'На дашборд' })).toBeNull()
  })
})
