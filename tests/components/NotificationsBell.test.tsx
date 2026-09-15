import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
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
      return Response.json({})
    }
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

      expect(await screen.findByRole('link')).toHaveAttribute('href', '/profile')
    })

    it('уведомление без ссылки ссылкой не становится', async () => {
      mockApi([notification('1', { link: null })])
      const user = userEvent.setup()
      render(<NotificationsBell />)

      await openBell(user)

      await screen.findByText('Уведомление 1')
      expect(screen.queryByRole('link')).not.toBeInTheDocument()
    })
  })

  describe('отметка прочитанным', () => {
    it('кнопка появляется только при наличии непрочитанных', async () => {
      mockApi([notification('1', { isRead: true })])
      const user = userEvent.setup()
      render(<NotificationsBell />)

      await openBell(user)

      expect(screen.queryByRole('button', { name: 'Прочитать все' })).not.toBeInTheDocument()
    })

    it('отмечает на сервере каждое непрочитанное', async () => {
      mockApi([notification('1'), notification('2'), notification('3', { isRead: true })])
      const user = userEvent.setup()
      render(<NotificationsBell />)

      await openBell(user)
      await user.click(await screen.findByRole('button', { name: 'Прочитать все' }))

      await waitFor(() => expect(patched).toHaveLength(2))
      expect(patched).toEqual(['/api/notifications/1', '/api/notifications/2'])
    })

    it('счётчик гаснет сразу, не дожидаясь перезагрузки списка', async () => {
      mockApi([notification('1')])
      const user = userEvent.setup()
      render(<NotificationsBell />)

      await openBell(user)
      await user.click(await screen.findByRole('button', { name: 'Прочитать все' }))

      await waitFor(() =>
        expect(screen.queryByRole('button', { name: 'Прочитать все' })).not.toBeInTheDocument(),
      )
    })
  })

  describe('загрузка', () => {
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
