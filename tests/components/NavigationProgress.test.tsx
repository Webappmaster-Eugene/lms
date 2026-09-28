import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render } from '@testing-library/react'

const nav = { pathname: '/courses' }
vi.mock('next/navigation', () => ({
  usePathname: () => nav.pathname,
  useSearchParams: () => new URLSearchParams(),
}))

// Как настоящий Link: отменяет обычный переход и навигирует сам
vi.mock('next/link', () => ({
  default: ({ href, children }: { href: string; children: React.ReactNode }) => (
    <a href={href} onClick={(event) => event.preventDefault()}>
      {children}
    </a>
  ),
}))

const { NavigationProgress } = await import('@/components/layout/NavigationProgress')
const { default: Link } = await import('next/link')

/** Полоса — единственная обратная связь при переходе на страницы без скелетона. */

function page(links: React.ReactNode) {
  return render(
    <>
      <NavigationProgress />
      {links}
    </>,
  )
}

const bar = () => document.querySelector('[aria-hidden="true"].fixed')

describe('полоса загрузки при переходе', () => {
  beforeEach(() => {
    nav.pathname = '/courses'
    window.history.replaceState(null, '', '/courses')
  })

  it('появляется по клику на внутреннюю ссылку и гаснет со сменой адреса', () => {
    const link = <Link href="/lessons/intro">урок</Link>
    const { rerender, getByText } = page(link)

    fireEvent.click(getByText('урок'), { button: 0 })
    expect(bar()).not.toBeNull()

    nav.pathname = '/lessons/intro'
    window.history.replaceState(null, '', '/lessons/intro')
    rerender(
      <>
        <NavigationProgress />
        {link}
      </>,
    )
    expect(bar()).toBeNull()
  })

  it('внешние ссылки, новая вкладка и якоря полосу не включают', () => {
    const { getByText } = page(
      <>
        <a href="https://t.me/mentor">телеграм</a>
        <a href="/courses/x" target="_blank">вкладка</a>
        <a href="#section">якорь</a>
      </>,
    )
    fireEvent.click(getByText('телеграм'), { button: 0 })
    fireEvent.click(getByText('вкладка'), { button: 0 })
    fireEvent.click(getByText('якорь'), { button: 0 })
    fireEvent.click(getByText('телеграм'), { button: 0, metaKey: true })

    expect(bar()).toBeNull()
  })
})
