import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { NotificationInbox } from '@/components/notifications/NotificationInbox'
import type { NotificationDoc } from '@/components/layout/notifications-api'

vi.mock('next/link', async () => (await import('../helpers/component-mocks')).linkMock())

function notification(id: string): NotificationDoc { return { id, title: `Уведомление ${id}`, message: 'Пора продолжить обучение', type: 'info', isRead: false, createdAt: '2026-10-08T10:00:00.000Z', link: '/courses' } }
let docs: NotificationDoc[]

function mockApi() {
  global.fetch = vi.fn(async (input, init) => {
    const url = String(input)
    if (init?.method === 'PATCH') {
      const found = docs.find((doc) => String(doc.id) === url.split('/').at(-1))
      if (found) found.isRead = true
      return Response.json({ doc: { isRead: true } })
    }
    if (url.includes('/count?')) return Response.json({ totalDocs: docs.filter((doc) => !doc.isRead).length })
    const filtered = url.includes('where[isRead][equals]=false') ? docs.filter((doc) => !doc.isRead) : docs
    const page = Number(new URL(url, 'http://localhost').searchParams.get('page')) || 1
    return Response.json({ docs: filtered.slice((page - 1) * 20, page * 20), totalDocs: filtered.length, totalPages: Math.max(1, Math.ceil(filtered.length / 20)), page })
  }) as typeof fetch
}

describe('полный список уведомлений', () => {
  beforeEach(() => { vi.clearAllMocks(); docs = [notification('1'), notification('2')]; mockApi() })

  it('показывает сообщения, настройки и подтверждённое индивидуальное прочтение', async () => {
    render(<NotificationInbox userId={34} />)
    expect(await screen.findByText('Уведомление 1')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Приложение и напоминания' })).toHaveAttribute('href', '/settings/notifications')
    await userEvent.click(screen.getByRole('button', { name: 'Прочитано: Уведомление 1' }))
    await waitFor(() => expect(screen.queryByRole('button', { name: 'Прочитано: Уведомление 1' })).not.toBeInTheDocument())
    expect(screen.getByRole('button', { name: 'Прочитано: Уведомление 2' })).toBeInTheDocument()
    expect(screen.getByText('Непрочитанных: 1')).toBeInTheDocument()
  })

  it('пагинация загружает следующую страницу, фильтр серверный и ограничен текущим учеником', async () => {
    docs = Array.from({ length: 21 }, (_, index) => notification(String(index + 1)))
    render(<NotificationInbox userId={34} />)
    expect(await screen.findByText('Страница 1 из 2')).toBeInTheDocument()
    expect(screen.queryByText('Уведомление 21')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Дальше' }))
    expect(await screen.findByText('Уведомление 21')).toBeInTheDocument()
    expect(screen.queryByText('Уведомление 1')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Непрочитанные' }))
    expect(await screen.findByText('Уведомление 1')).toBeInTheDocument()
    expect(vi.mocked(global.fetch).mock.calls.some(([url]) => String(url).includes('where[user][equals]=34') && String(url).includes('where[isRead][equals]=false'))).toBe(true)
  })

  it('частичный отказ PATCH оставляет непрочитанные и показывает ошибку', async () => {
    const original = global.fetch
    global.fetch = vi.fn(async (input, init) => init?.method === 'PATCH' && String(input).endsWith('/2') ? new Response(null, { status: 500 }) : original(input, init)) as typeof fetch
    render(<NotificationInbox userId={34} />)
    await userEvent.click(await screen.findByRole('button', { name: 'Прочитать эту страницу' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Не все изменения сохранились')
    expect(screen.getByRole('button', { name: 'Прочитано: Уведомление 2' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Прочитано: Уведомление 1' })).not.toBeInTheDocument()
  })

  it('пустой список и сетевой сбой различаются', async () => {
    docs = []
    const first = render(<NotificationInbox userId={34} />)
    expect(await screen.findByText('Уведомлений пока нет')).toBeInTheDocument()
    first.unmount()
    global.fetch = vi.fn(async () => new Response(null, { status: 503 })) as typeof fetch
    render(<NotificationInbox userId={34} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить')
    expect(screen.queryByText('Уведомлений пока нет')).not.toBeInTheDocument()
  })

  it('401 показывает повторный вход без чужих или старых сообщений', async () => {
    global.fetch = vi.fn(async () => new Response(null, { status: 401 })) as typeof fetch
    render(<NotificationInbox userId={34} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Сессия истекла')
    expect(screen.getByRole('link', { name: 'Войти' })).toHaveAttribute('href', '/login?redirect=%2Fnotifications')
    expect(screen.queryByRole('list')).not.toBeInTheDocument()
  })
})
