import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, renderHook, screen } from '@testing-library/react'

const navigation = vi.hoisted(() => ({ pathname: '/' as string | null }))
vi.mock('next/navigation', () => ({ usePathname: () => navigation.pathname }))

const { captureException, setUser } = vi.hoisted(() => ({ captureException: vi.fn(), setUser: vi.fn() }))
vi.mock('@sentry/nextjs', () => ({ captureException, setUser }))

const { CurrentPath } = await import('@/components/errors/CurrentPath')
const { ErrorReference } = await import('@/components/errors/ErrorReference')
const { ErrorReportingUser } = await import('@/components/errors/ErrorReportingUser')
const { supportHref, useErrorReport } = await import('@/components/errors/use-error-report')

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('адрес ненайденной страницы', () => {
  it('показывает путь по-русски, а не процент-кодами', () => {
    navigation.pathname = '/courses/%D1%83%D1%80%D0%BE%D0%BA'
    render(<p><CurrentPath /></p>)
    expect(screen.getByText('/courses/урок')).toBeInTheDocument()
  })

  it('битую кодировку показывает как есть, а не падает', () => {
    navigation.pathname = '/courses/%E0%A4%A'
    render(<p><CurrentPath /></p>)
    expect(screen.getByText('/courses/%E0%A4%A')).toBeInTheDocument()
  })

  it('без пути подставляет запасной адрес', () => {
    navigation.pathname = null
    render(<p><CurrentPath fallback="/guides" /></p>)
    expect(screen.getByText('/guides')).toBeInTheDocument()
  })
})

describe('код ошибки для поддержки', () => {
  async function press() {
    await act(async () => {
      fireEvent.click(screen.getByRole('button'))
    })
  }

  it('копирует код и через две секунды возвращает подпись кнопки', async () => {
    vi.useFakeTimers()
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    render(<ErrorReference value="2913870412" />)
    expect(screen.getByText('2913870412')).toBeInTheDocument()

    await press()
    expect(writeText).toHaveBeenCalledWith('2913870412')
    expect(screen.getByRole('button', { name: 'Скопировано' })).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(2000))
    expect(screen.getByRole('button', { name: 'Скопировать' })).toBeInTheDocument()
  })

  it('без доступа к буферу просит выделить код вручную', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('denied')) } })
    render(<ErrorReference value="abc" />)
    await press()
    expect(screen.getByRole('button', { name: 'Не удалось скопировать — выделите код вручную' })).toBeInTheDocument()
    expect(screen.getByText('abc')).toBeInTheDocument()
  })
})

describe('пользователь в отчётах об ошибках', () => {
  it('привязывает отчёты к id ученика без имени и почты и отвязывает при выходе', () => {
    const { rerender, unmount } = render(<ErrorReportingUser userId={34} />)
    expect(setUser).toHaveBeenLastCalledWith({ id: 34 })

    rerender(<ErrorReportingUser userId={35} />)
    expect(setUser).toHaveBeenCalledWith(null)
    expect(setUser).toHaveBeenLastCalledWith({ id: 35 })

    unmount()
    expect(setUser).toHaveBeenLastCalledWith(null)
  })
})

describe('код ошибки браузера', () => {
  it('без crypto.randomUUID (страница не по HTTPS) код всё равно в формате id события Sentry', () => {
    vi.stubGlobal('crypto', {})
    const error = new Error('boom')
    const { result } = renderHook(() => useErrorReport(error))
    expect(result.current).toMatch(/^[0-9a-f]{32}$/)
    expect(captureException).toHaveBeenCalledWith(error, expect.objectContaining({ event_id: result.current }))
  })

  it('ссылка в поддержку без кода и адреса ведёт просто на форму с темой ошибки', () => {
    expect(supportHref(undefined, null)).toBe('/help?topic=error#support')
    expect(supportHref('abc', '/courses')).toBe('/help?topic=error&ref=abc&from=%2Fcourses#support')
  })
})
