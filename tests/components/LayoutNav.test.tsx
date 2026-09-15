import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const pathname = { current: '/' }
const toggleMobile = vi.fn()

vi.mock('next/navigation', () => ({ usePathname: () => pathname.current }))
vi.mock('next/link', async () => (await import('../helpers/component-mocks')).linkMock())
vi.mock('@/components/layout/SidebarContext', () => ({
  useSidebar: () => ({ mobileOpen: false, setMobileOpen: vi.fn(), toggleMobile }),
}))

// Дочерние клиентские блоки шапки ходят в сеть — здесь проверяется сама шапка.
vi.mock('@/components/layout/NotificationsBell', () => ({
  NotificationsBell: () => <div data-testid="bell" />,
}))
vi.mock('@/components/layout/SearchBar', () => ({ SearchBar: () => <div data-testid="search" /> }))
vi.mock('@/components/layout/MobileSearchOverlay', () => ({
  MobileSearchOverlay: () => <div data-testid="search-mobile" />,
}))

const auth = vi.fn()
const find = vi.fn()
vi.mock('@/lib/payload', () => ({ getPayload: async () => ({ auth, find }) }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))

const { BottomNav } = await import('@/components/layout/BottomNav')
const { Header } = await import('@/components/layout/Header')

/** Нижняя навигация и шапка — их видно на каждой странице платформы. */

describe('нижняя навигация', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    pathname.current = '/'
  })

  it('содержит основные разделы', () => {
    render(<BottomNav />)

    for (const label of ['Главная', 'Курсы', 'Тренажёр', 'Рейтинг']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it('ссылки ведут по своим адресам', () => {
    render(<BottomNav />)

    expect(screen.getByRole('link', { name: /Курсы/ })).toHaveAttribute('href', '/courses')
    expect(screen.getByRole('link', { name: /Тренажёр/ })).toHaveAttribute('href', '/trainer')
  })

  it('текущий раздел подсвечен', () => {
    pathname.current = '/trainer'
    render(<BottomNav />)

    expect(screen.getByRole('link', { name: /Тренажёр/ }).className).toContain('text-primary')
  })

  it('вложенная страница раздела тоже считается текущей', () => {
    pathname.current = '/trainer/js-core/create-counter'
    render(<BottomNav />)

    expect(screen.getByRole('link', { name: /Тренажёр/ }).className).toContain('text-primary')
  })

  it('главная подсвечивается только на самой главной', () => {
    pathname.current = '/courses'
    render(<BottomNav />)

    expect(screen.getByRole('link', { name: /Главная/ }).className).not.toContain('text-primary')
  })

  it('кнопка «Ещё» открывает боковое меню', async () => {
    const user = userEvent.setup()
    render(<BottomNav />)

    await user.click(screen.getByRole('button', { name: /Ещё/ }))

    expect(toggleMobile).toHaveBeenCalled()
  })
})

describe('шапка', () => {
  const user = {
    id: 3,
    firstName: 'Алексей',
    lastName: 'Морозов',
    totalPoints: 1625,
  }

  beforeEach(() => {
    vi.clearAllMocks()
    auth.mockResolvedValue({ user })
    find.mockResolvedValue({ docs: [{ currentStreak: 12 }] })
  })

  it('показывает имя, баллы и серию', async () => {
    render(await Header())

    expect(screen.getByText('Алексей Морозов')).toBeInTheDocument()
    expect(screen.getByText('1625')).toBeInTheDocument()
    expect(screen.getByText(/12/)).toBeInTheDocument()
  })

  it('нулевая серия не показывается — пустой огонёк выглядит поломкой', async () => {
    find.mockResolvedValue({ docs: [{ currentStreak: 0 }] })

    render(await Header())

    expect(screen.queryByText(/🔥/)).not.toBeInTheDocument()
  })

  it('без серии в базе шапка всё равно строится', async () => {
    find.mockResolvedValue({ docs: [] })

    render(await Header())

    expect(screen.getByText('Алексей Морозов')).toBeInTheDocument()
  })

  it('отказ загрузки серии не роняет шапку', async () => {
    find.mockRejectedValue(new Error('БД недоступна'))

    render(await Header())

    expect(screen.getByText('Алексей Морозов')).toBeInTheDocument()
  })

  it('неавторизованному имя и баллы не показываются', async () => {
    auth.mockResolvedValue({ user: null })

    render(await Header())

    expect(screen.queryByText('Алексей Морозов')).not.toBeInTheDocument()
    expect(screen.queryByText('1625')).not.toBeInTheDocument()
  })

  it('без сессии колокольчик не монтируется — он опрашивал бы закрытую коллекцию', async () => {
    auth.mockResolvedValue({ user: null })

    render(await Header())

    expect(screen.queryByTestId('bell')).not.toBeInTheDocument()
  })

  it('вошедшему колокольчик показывается', async () => {
    render(await Header())

    expect(screen.getByTestId('bell')).toBeInTheDocument()
  })

  it('сбой авторизации не роняет страницу целиком', async () => {
    auth.mockRejectedValue(new Error('сессия истекла'))

    render(await Header())

    expect(screen.getByTestId('search')).toBeInTheDocument()
  })

  it('поиск есть и в настольной, и в мобильной версии', async () => {
    render(await Header())

    expect(screen.getByTestId('search')).toBeInTheDocument()
    expect(screen.getByTestId('search-mobile')).toBeInTheDocument()
  })

  it('пользователь без баллов видит ноль, а не пустоту', async () => {
    auth.mockResolvedValue({ user: { ...user, totalPoints: null } })

    render(await Header())

    expect(screen.getByText('0')).toBeInTheDocument()
  })
})
