import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useRef, useState } from 'react'
import Link from 'next/link'
import { MobileSheet } from '@/components/layout/MobileSheet'
import { CourseSidebar } from '@/components/course/CourseSidebar'
import { LessonNavigation } from '@/components/lesson/LessonNavigation'
import { SidebarProvider } from '@/components/layout/SidebarContext'
import { Sidebar } from '@/components/layout/Sidebar'
import { BottomNav } from '@/components/layout/BottomNav'

const current = vi.hoisted(() => ({ pathname: '/lessons/first' }))
const disconnect = vi.hoisted(() => vi.fn(async () => {}))
vi.mock('next/navigation', () => ({ usePathname: () => current.pathname }))
vi.mock('next/link', async () => (await import('../helpers/component-mocks')).linkMock())
vi.mock('@/lib/pwa-client', () => ({ disconnectDevicePush: disconnect }))

const longTitle = 'Лиды, квалификация и онбординг: подробная программа с длинным названием'
const sections = [{ id: 's', title: 'Очень длинное название раздела, которое должно читаться полностью', order: 1, lessons: [
  { id: '1', slug: 'first', title: 'Первый урок', order: 1 },
  { id: '2', slug: 'second', title: longTitle, order: 2 },
] }]

function SheetExample() {
  const [open, setOpen] = useState(false)
  return <><button onClick={() => setOpen(true)}>Открыть</button><MobileSheet open={open} onClose={() => setOpen(false)} title="Содержание курса"><Link href="/courses">К курсу</Link></MobileSheet></>
}

describe('мобильные панели', () => {
  beforeEach(() => {
    current.pathname = '/lessons/first'
    document.body.style.overflow = ''
  })

  it('закрытый тренажёр скрыт и в боковом меню, и в нижних вкладках', async () => {
    render(<SidebarProvider><Sidebar trainerEnabled={false} /><BottomNav /></SidebarProvider>)
    expect(screen.queryByRole('link', { name: /Тренажёр/ })).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Ещё' }))
    expect(within(screen.getByRole('dialog')).queryByRole('link', { name: /Тренажёр/ })).not.toBeInTheDocument()
    expect(within(screen.getByRole('dialog')).getByRole('link', { name: /Курсы/ })).toBeInTheDocument()
  })

  it('закрытие по Escape восстанавливает фокус на кнопку и прежний scroll lock', async () => {
    const user = userEvent.setup()
    document.body.style.overflow = 'auto'
    render(<SheetExample />)
    const trigger = screen.getByRole('button', { name: 'Открыть' })
    await user.click(trigger)
    expect(screen.getByRole('dialog', { name: 'Содержание курса' })).toHaveAttribute('open')
    expect(document.body.style.overflow).toBe('hidden')
    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.body.style.overflow).toBe('auto')
    expect(trigger).toHaveFocus()
  })

  it('Tab и Shift+Tab циклически обходят доступные элементы, пропуская скрытые и disabled', async () => {
    const user = userEvent.setup()
    render(<MobileSheet open onClose={vi.fn()} title="Содержание курса"><input aria-label="Поиск урока" /><Link href="/courses">К курсу</Link><button disabled>Недоступно</button><button hidden>Скрыто</button></MobileSheet>)
    const first = screen.getByRole('button', { name: 'Закрыть содержание' })
    const middle = screen.getByRole('textbox', { name: 'Поиск урока' })
    const last = screen.getByRole('link', { name: 'К курсу' })
    const rectangles = [new DOMRect(0, 0, 100, 44)] as unknown as DOMRectList
    // jsdom has no layout; only these actual visible controls get geometry.
    const spies = [first, middle, last].map((element) => vi.spyOn(element, 'getClientRects').mockReturnValue(rectangles))
    try {
      act(() => last.focus())
      await user.tab()
      expect(first).toHaveFocus()
      await user.tab({ shift: true })
      expect(last).toHaveFocus()
      act(() => first.focus())
      await user.tab()
      expect(middle).toHaveFocus()
    } finally {
      spies.forEach((spy) => spy.mockRestore())
    }
  })

  it('при переходе на desktop панель закрывается и возвращает прокрутку', async () => {
    const change = new Set<(event: MediaQueryListEvent) => void>()
    const original = window.matchMedia
    window.matchMedia = vi.fn(() => ({ matches: false, addEventListener: (_type: string, handler: (event: MediaQueryListEvent) => void) => change.add(handler), removeEventListener: (_type: string, handler: (event: MediaQueryListEvent) => void) => change.delete(handler) }) as unknown as MediaQueryList)
    try {
      render(<SheetExample />)
      await userEvent.click(screen.getByRole('button', { name: 'Открыть' }))
      act(() => change.forEach((handler) => handler({ matches: true } as MediaQueryListEvent)))
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(document.body.style.overflow).toBe('')
    } finally {
      window.matchMedia = original
    }
  })

  it('на широком экране панель не открывается модально, а сразу закрывается', () => {
    vi.stubGlobal('matchMedia', vi.fn(() => ({ matches: true, addEventListener: vi.fn(), removeEventListener: vi.fn() })))
    const onClose = vi.fn()
    try {
      render(<MobileSheet open onClose={onClose} title="Содержание курса"><p>Уроки</p></MobileSheet>)
      expect(onClose).toHaveBeenCalledOnce()
      expect(document.body.style.overflow).toBe('')
    } finally {
      vi.unstubAllGlobals()
    }
  })

  it('Tab, когда фокус оказался вне панели, возвращает его на первый элемент; Tab с модификатором не перехватывается', () => {
    render(<><button>Снаружи</button><MobileSheet open onClose={vi.fn()} title="Содержание курса"><Link href="/courses">К курсу</Link></MobileSheet></>)
    const dialog = screen.getByRole('dialog')
    const close = screen.getByRole('button', { name: 'Закрыть содержание' })
    const link = screen.getByRole('link', { name: 'К курсу' })
    const rectangles = [new DOMRect(0, 0, 100, 44)] as unknown as DOMRectList
    const spies = [close, link].map((element) => vi.spyOn(element, 'getClientRects').mockReturnValue(rectangles))
    try {
      act(() => screen.getByRole('button', { name: 'Снаружи', hidden: true }).focus())
      expect(fireEvent.keyDown(dialog, { key: 'Tab' })).toBe(false)
      expect(close).toHaveFocus()
      expect(fireEvent.keyDown(dialog, { key: 'Tab', ctrlKey: true })).toBe(true)
      expect(fireEvent.keyDown(dialog, { key: 'Tab', altKey: true })).toBe(true)
      expect(close).toHaveFocus()
    } finally {
      spies.forEach((spy) => spy.mockRestore())
    }
  })

  it('элементы с положительным tabindex обходятся раньше остальных', () => {
    render(<MobileSheet open onClose={vi.fn()} title="Содержание курса"><Link href="/a">Обычная</Link><Link href="/b" tabIndex={2}>Вторая</Link><Link href="/c" tabIndex={1}>Первая</Link></MobileSheet>)
    const dialog = screen.getByRole('dialog')
    const links = ['Первая', 'Вторая', 'Обычная'].map((name) => screen.getByRole('link', { name }))
    const close = screen.getByRole('button', { name: 'Закрыть содержание' })
    const rectangles = [new DOMRect(0, 0, 100, 44)] as unknown as DOMRectList
    const spies = [close, ...links].map((element) => vi.spyOn(element, 'getClientRects').mockReturnValue(rectangles))
    try {
      act(() => links[2].focus())
      fireEvent.keyDown(dialog, { key: 'Tab' })
      expect(links[0]).toHaveFocus()
      fireEvent.keyDown(dialog, { key: 'Tab', shiftKey: true })
      expect(links[2]).toHaveFocus()
    } finally {
      spies.forEach((spy) => spy.mockRestore())
    }
  })

  it('без видимых элементов Tab не перехватывается', () => {
    render(<MobileSheet open onClose={vi.fn()} title="Содержание курса"><p>Пусто</p></MobileSheet>)
    expect(fireEvent.keyDown(screen.getByRole('dialog'), { key: 'Tab' })).toBe(true)
  })

  it('ставит фокус на указанный элемент и после закрытия возвращает его на заданную кнопку', () => {
    function Example() {
      const [open, setOpen] = useState(true)
      const anchor = useRef<HTMLButtonElement>(null)
      return <><button ref={anchor}>Меню</button><MobileSheet open={open} onClose={() => setOpen(false)} title="Поиск" returnFocusRef={anchor} initialFocusSelector="input"><input aria-label="Что ищем" /></MobileSheet></>
    }
    render(<Example />)
    expect(screen.getByRole('textbox', { name: 'Что ищем' })).toHaveFocus()
    fireEvent.click(screen.getByRole('button', { name: 'Закрыть поиск' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Меню' })).toHaveFocus()
  })

  it('кнопка закрытия подписана по смыслу панели или явной подписью', () => {
    render(<><MobileSheet open onClose={vi.fn()} title="Меню платформы"><p>a</p></MobileSheet><MobileSheet open onClose={vi.fn()} title="Фильтры" closeLabel="Скрыть фильтры"><p>b</p></MobileSheet></>)
    expect(screen.getByRole('button', { name: 'Закрыть меню', hidden: true })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Скрыть фильтры', hidden: true })).toBeInTheDocument()
  })

  it('нажатие фона закрывает панель, а внутренние элементы сохраняют её', async () => {
    render(<SheetExample />)
    await userEvent.click(screen.getByRole('button', { name: 'Открыть' }))
    const dialog = screen.getByRole('dialog')
    fireEvent.click(within(dialog).getByText('К курсу'))
    expect(dialog).toBeInTheDocument()
    fireEvent.click(dialog, { clientX: 0, clientY: -1 })
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('«Ещё» открывает отдельное модальное меню и закрывает его при переходе', async () => {
    render(<SidebarProvider><Sidebar guidesEnabled /><BottomNav /></SidebarProvider>)
    const more = screen.getByRole('button', { name: 'Ещё' })
    expect(more).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(more)
    const dialog = screen.getByRole('dialog', { name: 'Меню платформы' })
    expect(more).toHaveAttribute('aria-expanded', 'true')
    expect(within(dialog).getByRole('link', { name: 'Приложение' })).toHaveAttribute('href', '/settings/app')
    expect(within(dialog).getAllByRole('link').map((link) => link.textContent)).toEqual([
      'Дашборд', 'Роадмапы', 'Курсы', 'Тренажёр', 'Собеседования', 'Гайды', 'История обучения', 'Сертификаты', 'Заметки', 'Вопросы',
      'Сохранённое', 'Лидерборд', 'Профиль', 'Приложение', 'Уведомления', 'Контакты', 'Помощь',
    ])
    expect(within(dialog).getByRole('link', { name: 'Собеседования' })).toHaveAttribute('href', '/interviews')
    const settings = within(dialog).getByRole('link', { name: 'Уведомления' })
    expect(settings).toHaveAttribute('href', '/settings/notifications')
    await userEvent.click(settings)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(more).toHaveFocus()
  })

  it('оглавление открывает текущий раздел, показывает название целиком и закрывается после выбора урока', async () => {
    render(<CourseSidebar courseTitle="Курс" sections={sections} completedLessonIds={new Set(['1'])} currentLessonId="1" totalLessons={2} totalCompleted={1} />)
    const trigger = screen.getByRole('button', { name: 'Показать содержание' })
    await userEvent.click(trigger)
    const dialog = screen.getByRole('dialog', { name: 'Содержание курса' })
    expect(within(dialog).getByRole('button', { name: new RegExp(sections[0].title) })).toHaveAttribute('aria-expanded', 'true')
    expect(within(dialog).getByRole('link', { name: /Первый урок/ })).toHaveAttribute('aria-current', 'page')
    const next = within(dialog).getByRole('link', { name: longTitle })
    expect(next).toHaveAttribute('href', '/lessons/second')
    await userEvent.click(next)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(document.body.style.overflow).toBe('')
  })

  it('оглавление курса закрывается крестиком и возвращает фокус на кнопку', async () => {
    render(<CourseSidebar courseTitle="Курс" sections={sections} completedLessonIds={new Set()} currentLessonId="1" totalLessons={2} totalCompleted={0} />)
    const trigger = screen.getByRole('button', { name: 'Показать содержание' })
    await userEvent.click(trigger)
    expect(trigger).toHaveAttribute('aria-expanded', 'true')
    await userEvent.click(within(screen.getByRole('dialog')).getByRole('button', { name: 'Закрыть содержание' }))
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(trigger).toHaveAttribute('aria-expanded', 'false')
    expect(trigger).toHaveFocus()
  })

  it('предыдущий и следующий урок имеют понятные полные названия', () => {
    render(<LessonNavigation previous={{ slug: 'previous', title: 'Предыдущий с длинным названием' }} next={{ slug: 'next', title: longTitle }} />)
    const nav = screen.getByRole('navigation', { name: 'Навигация по урокам' })
    expect(within(nav).getByRole('link', { name: `Следующий урок: ${longTitle}` })).toHaveAttribute('href', '/lessons/next')
    expect(within(nav).getByRole('link', { name: /Предыдущий урок: Предыдущий с длинным названием/ })).toHaveAttribute('href', '/lessons/previous')
  })
})
