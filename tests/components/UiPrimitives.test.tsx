import { describe, expect, it, vi } from 'vitest'
import { act, render, renderHook, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const setTheme = vi.fn()
const theme = { current: 'light' as string | undefined }

vi.mock('next-themes', () => ({
  useTheme: () => ({ theme: theme.current, setTheme }),
  ThemeProvider: ({ children }: { children: React.ReactNode }) => (
    <div data-testid="next-themes">{children}</div>
  ),
}))

const { ThemeToggle } = await import('@/components/layout/ThemeToggle')
const { ThemeProvider } = await import('@/components/layout/ThemeProvider')
const { SidebarProvider, useSidebar } = await import('@/components/layout/SidebarContext')
const { ExternalLinkBlock } = await import('@/components/lesson/ExternalLink')
const { MiroEmbed } = await import('@/components/lesson/MiroEmbed')
const { FaqAccordion } = await import('@/components/help/FaqAccordion')

/** Мелкие примитивы интерфейса: переключатель темы, контекст меню, блоки урока. */

describe('переключатель темы', () => {
  it('переключает тёмную на светлую', async () => {
    theme.current = 'dark'
    const user = userEvent.setup()
    render(<ThemeToggle />)

    await user.click(screen.getByRole('button', { name: 'Переключить тему' }))

    expect(setTheme).toHaveBeenCalledWith('light')
  })

  it('и обратно', async () => {
    theme.current = 'light'
    const user = userEvent.setup()
    render(<ThemeToggle />)

    await user.click(screen.getByRole('button', { name: 'Переключить тему' }))

    expect(setTheme).toHaveBeenCalledWith('dark')
  })

  it('иконка отражает противоположную тему — это подсказка, куда переключит', () => {
    theme.current = 'dark'
    const { container: dark } = render(<ThemeToggle />)
    theme.current = 'light'
    const { container: light } = render(<ThemeToggle />)

    expect(dark.querySelector('svg')?.getAttribute('class')).toBeTruthy()
    expect(dark.innerHTML).not.toBe(light.innerHTML)
  })

  it('кнопка подписана для скринридера', () => {
    theme.current = 'light'
    render(<ThemeToggle />)

    expect(screen.getByRole('button', { name: 'Переключить тему' })).toBeInTheDocument()
  })
})

describe('обёртка темы', () => {
  it('прокидывает детей в провайдер next-themes', () => {
    render(
      <ThemeProvider>
        <span>содержимое</span>
      </ThemeProvider>,
    )

    expect(screen.getByTestId('next-themes')).toHaveTextContent('содержимое')
  })
})

describe('состояние мобильного меню', () => {
  const wrapper = ({ children }: { children: React.ReactNode }) => (
    <SidebarProvider>{children}</SidebarProvider>
  )

  it('по умолчанию закрыто', () => {
    const { result } = renderHook(() => useSidebar(), { wrapper })

    expect(result.current.mobileOpen).toBe(false)
  })

  it('переключается туда и обратно', () => {
    const { result } = renderHook(() => useSidebar(), { wrapper })

    act(() => result.current.toggleMobile())
    expect(result.current.mobileOpen).toBe(true)

    act(() => result.current.toggleMobile())
    expect(result.current.mobileOpen).toBe(false)
  })

  it('закрывается напрямую — это нужно при переходе по ссылке', () => {
    const { result } = renderHook(() => useSidebar(), { wrapper })

    act(() => result.current.setMobileOpen(true))
    act(() => result.current.setMobileOpen(false))

    expect(result.current.mobileOpen).toBe(false)
  })

  it('вне провайдера бросает понятную ошибку, а не undefined', () => {
    expect(() => renderHook(() => useSidebar())).toThrow(/SidebarProvider/)
  })
})

describe('блок внешней ссылки в уроке', () => {
  const link = { title: 'Исходники урока', url: 'https://github.com/example' }

  it('ведёт по адресу и открывается в новой вкладке безопасно', () => {
    render(<ExternalLinkBlock {...link} platform="github" />)
    const anchor = screen.getByRole('link')

    expect(anchor).toHaveAttribute('href', link.url)
    expect(anchor).toHaveAttribute('target', '_blank')
    expect(anchor).toHaveAttribute('rel', expect.stringContaining('noopener'))
  })

  it.each([
    ['boosty', 'Boosty'],
    ['telegram', 'Telegram'],
    ['youtube', 'YouTube'],
    ['github', 'GitHub'],
  ] as const)('площадка %s подписана как %s', (platform, label) => {
    render(<ExternalLinkBlock {...link} platform={platform} />)

    expect(screen.getByText(label)).toBeInTheDocument()
  })

  it('без площадки подпись нейтральная, а не пустая', () => {
    render(<ExternalLinkBlock {...link} platform={null} />)

    expect(screen.getByText('Ссылка')).toBeInTheDocument()
  })

  it('описание показывается, когда задано', () => {
    render(<ExternalLinkBlock {...link} description="Код из видео" />)

    expect(screen.getByText('Код из видео')).toBeInTheDocument()
  })
})

describe('встроенная доска Miro', () => {
  const board = { title: 'Карта навыков', embedUrl: 'https://miro.com/app/live-embed/abc' }

  it('показывает заголовок и кадр', () => {
    render(<MiroEmbed {...board} />)

    expect(screen.getByText('Карта навыков')).toBeInTheDocument()
    expect(screen.getByTitle('Карта навыков')).toHaveAttribute('src', board.embedUrl)
  })

  it('кадр в песочнице — доска не должна дотянуться до платформы', () => {
    render(<MiroEmbed {...board} />)
    const sandbox = screen.getByTitle('Карта навыков').getAttribute('sandbox') ?? ''

    expect(sandbox).toContain('allow-scripts')
  })

  it('высота задаётся пропсом', () => {
    const { container } = render(<MiroEmbed {...board} height={400} />)

    expect(container.querySelector('[style*="400px"]')).not.toBeNull()
  })

  it('без высоты берётся значение по умолчанию', () => {
    const { container } = render(<MiroEmbed {...board} height={null} />)

    expect(container.querySelector('[style*="600px"]')).not.toBeNull()
  })

  it('кадр грузится лениво — доска тяжёлая', () => {
    render(<MiroEmbed {...board} />)

    expect(screen.getByTitle('Карта навыков')).toHaveAttribute('loading', 'lazy')
  })
})

describe('раскрывающийся список вопросов', () => {
  const items = [
    { id: 1, question: 'Как получить доступ?', answerText: 'По приглашению от ментора.' },
    { id: 2, question: 'Где смотреть прогресс?', answerText: 'На дашборде.' },
  ]

  it('вопросы видны, ответы скрыты', () => {
    render(<FaqAccordion items={items} />)

    expect(screen.getByText('Как получить доступ?')).toBeInTheDocument()
    expect(screen.queryByText('По приглашению от ментора.')).not.toBeInTheDocument()
  })

  it('клик раскрывает ответ', async () => {
    const user = userEvent.setup()
    render(<FaqAccordion items={items} />)

    await user.click(screen.getByText('Как получить доступ?'))

    expect(screen.getByText('По приглашению от ментора.')).toBeInTheDocument()
  })

  it('повторный клик закрывает', async () => {
    const user = userEvent.setup()
    render(<FaqAccordion items={items} />)

    await user.click(screen.getByText('Как получить доступ?'))
    await user.click(screen.getByText('Как получить доступ?'))

    expect(screen.queryByText('По приглашению от ментора.')).not.toBeInTheDocument()
  })

  it('открыт всегда только один ответ', async () => {
    const user = userEvent.setup()
    render(<FaqAccordion items={items} />)

    await user.click(screen.getByText('Как получить доступ?'))
    await user.click(screen.getByText('Где смотреть прогресс?'))

    expect(screen.queryByText('По приглашению от ментора.')).not.toBeInTheDocument()
    expect(screen.getByText('На дашборде.')).toBeInTheDocument()
  })

  it('пустой список не ломает страницу помощи', () => {
    const { container } = render(<FaqAccordion items={[]} />)

    expect(container.querySelectorAll('button')).toHaveLength(0)
  })
})
