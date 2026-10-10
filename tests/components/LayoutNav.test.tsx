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
const getProfileAvatar = vi.fn()
vi.mock('@/server/profile/read', () => ({ getProfileAvatar: (...args: unknown[]) => getProfileAvatar(...args) }))
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

    expect(screen.getAllByRole('link').map((link) => link.textContent)).toEqual(['Роадмапы', 'Курсы', 'Тренажёр', 'Главная'])
    for (const label of ['Главная', 'Курсы', 'Тренажёр', 'Роадмапы']) {
      expect(screen.getByText(label)).toBeInTheDocument()
    }
  })

  it('закрытый тренажёр отсутствует в мобильной навигации, остальные разделы доступны', () => {
    render(<BottomNav trainerEnabled={false} />)

    expect(screen.queryByRole('link', { name: /Тренажёр/ })).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: /Курсы/ })).toHaveAttribute('href', '/courses')
    expect(screen.getByRole('button', { name: /Ещё/ })).toBeInTheDocument()
  })

  it('ссылки ведут по своим адресам', () => {
    render(<BottomNav />)

    expect(screen.getByRole('link', { name: /Курсы/ })).toHaveAttribute('href', '/courses')
    expect(screen.getByRole('link', { name: /Тренажёр/ })).toHaveAttribute('href', '/trainer')
    expect(screen.getByRole('link', { name: /Роадмапы/ })).toHaveAttribute('href', '/roadmaps')
    expect(screen.queryByRole('link', { name: /Рейтинг/ })).not.toBeInTheDocument()
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

  it('вложенный роадмап подсвечивает вкладку учебных карт', () => {
    pathname.current = '/roadmaps/react'
    render(<BottomNav />)
    expect(screen.getByRole('link', { name: /Роадмапы/ })).toHaveAttribute('aria-current', 'page')
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
    getProfileAvatar.mockResolvedValue(null)
    find.mockResolvedValue({ docs: [{ currentStreak: 12, lastActivityDate: new Date().toISOString().slice(0, 10) }] })
  })

  it('показывает имя, баллы и серию', async () => {
    render(await Header())

    expect(screen.getByText('Алексей Морозов')).toBeInTheDocument()
    expect(screen.getByText('1625')).toBeInTheDocument()
    expect(screen.getByText(/12/)).toBeInTheDocument()
  })

  it('имя и аватар ведут к настройке профиля, ссылка доступна и без текста на телефоне', async () => {
    render(await Header())
    const link = screen.getByRole('link', { name: 'Настроить профиль: Алексей Морозов' })
    expect(link).toHaveAttribute('href', '/profile/edit')
    expect(link).toHaveTextContent('АМ')
    expect(link).toHaveTextContent('Алексей Морозов')
    expect(getProfileAvatar).not.toHaveBeenCalled()
  })

  it('показывает проверенный аватар и не использует URL из непроверенной auth-связи', async () => {
    auth.mockResolvedValue({ user: { ...user, avatar: { id: 4, url: '/api/media/file/private-course.png' } } })
    getProfileAvatar.mockResolvedValue({ id: 4, url: '/api/media/file/my-avatar.png', alt: 'Фото' })
    const { container } = render(await Header())
    expect(container.querySelector('img')).toHaveAttribute('src', '/api/media/file/my-avatar.png')
    expect(getProfileAvatar).toHaveBeenCalledOnce()
  })

  it('не подставляет непроверенный аватар, если проверка доступа вернула null', async () => {
    auth.mockResolvedValue({ user: { ...user, avatar: { id: 4, url: '/api/media/file/private-course.png' } } })
    getProfileAvatar.mockResolvedValue(null)
    const { container } = render(await Header())
    expect(container.querySelector('img')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Настроить профиль: Алексей Морозов' })).toHaveTextContent('АМ')
  })

  it('если аватар недоступен или чтение падает, инициалы и ссылка продолжают работать', async () => {
    auth.mockResolvedValue({ user: { ...user, avatar: 4 } })
    getProfileAvatar.mockRejectedValue(new Error('БД недоступна'))
    const { container } = render(await Header())
    expect(container.querySelector('img')).not.toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Настроить профиль: Алексей Морозов' })).toHaveTextContent('АМ')
  })

  it('пустое имя не скрывает вход в профиль', async () => {
    auth.mockResolvedValue({ user: { ...user, firstName: '', lastName: '' } })
    render(await Header())
    expect(screen.getByRole('link', { name: 'Настроить профиль: Мой профиль' })).toHaveAttribute('href', '/profile/edit')
  })

  it('нулевая серия не показывается — пустой огонёк выглядит поломкой', async () => {
    find.mockResolvedValue({ docs: [{ currentStreak: 0 }] })

    render(await Header())

    expect(screen.queryByText(/🔥/)).not.toBeInTheDocument()
  })

  it('прерванная серия не показывается — в базе остаётся старое число', async () => {
    find.mockResolvedValue({ docs: [{ currentStreak: 12, lastActivityDate: '2020-01-01' }] })

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
