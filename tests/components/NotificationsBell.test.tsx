import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('next/link', async () => (await import('../helpers/component-mocks')).linkMock())

const { NotificationsBell } = await import('@/components/layout/NotificationsBell')

/**
 * Колокольчик уведомлений в шапке.
 *
 * Счётчик непрочитанного — единственный сигнал, что ментор что-то ответил,
 * поэтому важнее всего, чтобы он не врал: не показывал ноль при наличии
 * непрочитанных и не оставался висеть после прочтения.
 */

type Notification = {
  id: string
  title: string
  message: string
  type: string
  link?: string | null
  isRead: boolean
  createdAt: string
}

function notification(id: string, overrides: Partial<Notification> = {}): Notification {
  return {
    id,
    title: `Уведомление ${id}`,
    message: 'Текст уведомления',
    type: 'course_completed',
    isRead: false,
    createdAt: '2026-09-15T10:00:00.000Z',
    ...overrides,
  }
}

let patched: string[] = []

function mockApi(docs: Notification[]) {
  patched = []
  global.fetch = vi.fn(async (input: RequestInfo | URL, init?: RequestInit) => {
    if (init?.method === 'PATCH') {
      patched.push(String(input))
      const id = String(input).split('/').at(-1)
      const doc = docs.find((notification) => notification.id === id)
      if (doc) doc.isRead = true
      return Response.json({ doc: { isRead: true } })
    }
    if (String(input).includes('/count?')) return Response.json({ totalDocs: docs.filter((notification) => !notification.isRead).length })
    return Response.json({ docs })
  }) as unknown as typeof fetch
}

const openBell = async (user: ReturnType<typeof userEvent.setup>) =>
  user.click(screen.getByRole('button', { name: 'Уведомления' }))

describe('колокольчик уведомлений', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    mockApi([])
  })

  describe('счётчик непрочитанного', () => {
    it('без уведомлений не показывается', async () => {
      render(<NotificationsBell />)

      await waitFor(() => expect(global.fetch).toHaveBeenCalled())
      expect(screen.queryByText('0')).not.toBeInTheDocument()
    })

    it('считает только непрочитанные', async () => {
      mockApi([notification('1'), notification('2'), notification('3', { isRead: true })])
      render(<NotificationsBell />)

      expect(await screen.findByText('2')).toBeInTheDocument()
    })

    it('больше девяти показывается как 9+, иначе цифра не влезает', async () => {
      mockApi(Array.from({ length: 12 }, (_, i) => notification(String(i))))
      render(<NotificationsBell />)

      expect(await screen.findByText('9+')).toBeInTheDocument()
    })

    it('все прочитанные — счётчика нет', async () => {
      mockApi([notification('1', { isRead: true })])
      render(<NotificationsBell />)

      await waitFor(() => expect(global.fetch).toHaveBeenCalled())
      expect(screen.queryByText('1')).not.toBeInTheDocument()
    })
  })

  describe('список', () => {
    it('открывается по клику', async () => {
      mockApi([notification('1', { title: 'Курс завершён!' })])
      const user = userEvent.setup()
      render(<NotificationsBell />)

      await openBell(user)

      expect(await screen.findByText('Курс завершён!')).toBeInTheDocument()
    })

    it('закрывается повторным кликом', async () => {
      mockApi([notification('1', { title: 'Курс завершён!' })])
      const user = userEvent.setup()
      render(<NotificationsBell />)

      await openBell(user)
      await openBell(user)

      expect(screen.queryByText('Курс завершён!')).not.toBeInTheDocument()
    })

    it('закрывается кликом вне области', async () => {
      mockApi([notification('1', { title: 'Курс завершён!' })])
      const user = userEvent.setup()
      render(
        <div>
          <NotificationsBell />
          <button>снаружи</button>
        </div>,
      )

      await openBell(user)
      await user.click(screen.getByRole('button', { name: 'снаружи' }))

      expect(screen.queryByText('Курс завершён!')).not.toBeInTheDocument()
    })

    it('пустой список честно об этом говорит', async () => {
      const user = userEvent.setup()
      render(<NotificationsBell />)

      await openBell(user)

      expect(await screen.findByText('Нет уведомлений')).toBeInTheDocument()
    })

    it('уведомление со ссылкой ведёт по ней', async () => {
      mockApi([notification('1', { link: '/profile' })])
      const user = userEvent.setup()
      render(<NotificationsBell />)

      await openBell(user)

      expect(await screen.findByRole('link', { name: /Уведомление 1/ })).toHaveAttribute('href', '/profile')
    })

    it('уведомление без ссылки ссылкой не становится', async () => {
      mockApi([notification('1', { link: null })])
      const user = userEvent.setup()
      render(<NotificationsBell />)

      await openBell(user)

      await screen.findByText('Уведомление 1')
      expect(screen.queryByRole('link', { name: /Уведомление 1/ })).not.toBeInTheDocument()
    })
  })

  describe('отметка прочитанным', () => {
    it('кнопка появляется только при наличии непрочитанных', async () => {
      mockApi([notification('1', { isRead: true })])
      const user = userEvent.setup()
      render(<NotificationsBell />)

      await openBell(user)

      expect(screen.queryByRole('button', { name: 'Прочитать показанные' })).not.toBeInTheDocument()
    })

    it('отмечает на сервере каждое непрочитанное', async () => {
      mockApi([notification('1'), notification('2'), notification('3', { isRead: true })])
      const user = userEvent.setup()
      render(<NotificationsBell />)

      await openBell(user)
      await user.click(await screen.findByRole('button', { name: 'Прочитать показанные' }))

      await waitFor(() => expect(patched).toHaveLength(2))
      expect(patched).toEqual(['/api/notifications/1', '/api/notifications/2'])
    })

    it('счётчик гаснет сразу, не дожидаясь перезагрузки списка', async () => {
      mockApi([notification('1')])
      const user = userEvent.setup()
      render(<NotificationsBell />)

      await openBell(user)
      await user.click(await screen.findByRole('button', { name: 'Прочитать показанные' }))

      await waitFor(() =>
        expect(screen.queryByRole('button', { name: 'Прочитать показанные' })).not.toBeInTheDocument(),
      )
    })
  })

  describe('загрузка', () => {
    it('считает все непрочитанные, даже за пределами последних десяти, и сообщает PWA badge', async () => {
      const event = vi.fn()
      window.addEventListener('lms:notification-count', event)
      global.fetch = vi.fn(async (input) => String(input).includes('/count?') ? Response.json({ totalDocs: 42 }) : Response.json({ docs: [notification('1')] })) as typeof fetch
      try {
        render(<NotificationsBell userId={34} />)
        expect(await screen.findByText('9+')).toBeInTheDocument()
        expect(event.mock.calls.some(([value]) => (value as CustomEvent<number>).detail === 42)).toBe(true)
        expect(vi.mocked(global.fetch).mock.calls.every(([url]) => String(url).includes('where[user][equals]=34'))).toBe(true)
      } finally {
        window.removeEventListener('lms:notification-count', event)
      }
    })

    it('не отмечает прочитанным после ошибки PATCH', async () => {
      global.fetch = vi.fn(async (input, init) => init?.method === 'PATCH' ? new Response(null, { status: 500 }) : String(input).includes('/count?') ? Response.json({ totalDocs: 1 }) : Response.json({ docs: [notification('1')] })) as typeof fetch
      const user = userEvent.setup()
      render(<NotificationsBell />)
      await openBell(user)
      await user.click(await screen.findByRole('button', { name: 'Прочитать показанные' }))
      expect(await screen.findByRole('alert')).toHaveTextContent('Не все уведомления')
      expect(screen.getByText('1', { exact: true })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Прочитать показанные' })).toBeInTheDocument()
    })

    it('Escape закрывает список и возвращает фокус; сообщение SW перезагружает список', async () => {
      const user = userEvent.setup()
      render(<NotificationsBell />)
      await openBell(user)
      expect(screen.getByRole('button', { name: 'Уведомления' })).toHaveAttribute('aria-expanded', 'true')
      await user.keyboard('{Escape}')
      expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'Уведомления' })).toHaveFocus()
      const calls = vi.mocked(global.fetch).mock.calls.length
      act(() => window.dispatchEvent(new Event('lms:notification')))
      await waitFor(() => expect(vi.mocked(global.fetch).mock.calls.length).toBeGreaterThan(calls))
    })

    it('401 прекращает опрос и обновления SW даже при ошибке второго запроса', async () => {
      global.fetch = vi.fn(async (input) => new Response(null, { status: String(input).includes('/count?') ? 500 : 401 })) as typeof fetch
      const user = userEvent.setup()
      render(<NotificationsBell />)
      await openBell(user)
      expect(await screen.findByText(/Сессия истекла/)).toBeInTheDocument()
      const calls = vi.mocked(global.fetch).mock.calls.length
      await act(async () => window.dispatchEvent(new Event('lms:notification')))
      expect(vi.mocked(global.fetch).mock.calls.length).toBe(calls)
    })

    it('запрашивает последние уведомления с сессией', async () => {
      render(<NotificationsBell />)

      await waitFor(() => expect(global.fetch).toHaveBeenCalled())
      const [url, init] = vi.mocked(global.fetch).mock.calls[0] as [string, RequestInit]
      expect(url).toContain('/api/notifications')
      expect(url).toContain('sort=-createdAt')
      expect(init.credentials).toBe('include')
    })

    it('битый ответ не роняет шапку', async () => {
      global.fetch = vi.fn(async () => new Response('не json', { status: 200 })) as unknown as typeof fetch

      render(<NotificationsBell />)

      expect(await screen.findByRole('button', { name: 'Уведомления' })).toBeInTheDocument()
    })
  })
})
