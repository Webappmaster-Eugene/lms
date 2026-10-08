import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useState } from 'react'
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
    render(<SidebarProvider><Sidebar /><BottomNav /></SidebarProvider>)
    const more = screen.getByRole('button', { name: 'Ещё' })
    expect(more).toHaveAttribute('aria-expanded', 'false')
    await userEvent.click(more)
    const dialog = screen.getByRole('dialog', { name: 'Меню платформы' })
    expect(more).toHaveAttribute('aria-expanded', 'true')
    const settings = within(dialog).getByRole('link', { name: 'Приложение и уведомления' })
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

  it('предыдущий и следующий урок имеют понятные полные названия', () => {
    render(<LessonNavigation previous={{ slug: 'previous', title: 'Предыдущий с длинным названием' }} next={{ slug: 'next', title: longTitle }} />)
    const nav = screen.getByRole('navigation', { name: 'Навигация по урокам' })
    expect(within(nav).getByRole('link', { name: `Следующий урок: ${longTitle}` })).toHaveAttribute('href', '/lessons/next')
    expect(within(nav).getByRole('link', { name: /Предыдущий урок: Предыдущий с длинным названием/ })).toHaveAttribute('href', '/lessons/previous')
  })
})
