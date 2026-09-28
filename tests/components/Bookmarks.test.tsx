import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const toast = vi.fn()
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ toast }) }))
vi.mock('next/link', async () => (await import('../helpers/component-mocks')).linkMock())

const { BookmarkButton } = await import('@/components/bookmarks/BookmarkButton')
const { SavedList } = await import('@/components/bookmarks/SavedList')
import type { SavedItem } from '@/lib/bookmarks'

let calls: { url: string; init?: RequestInit }[] = []
function mockApi(ok = true) {
  calls = []
  global.fetch = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    calls.push({ url: String(url), init })
    return ok ? Response.json({ doc: { id: 77 } }) : new Response(null, { status: 500 })
  }) as unknown as typeof fetch
}

beforeEach(() => {
  vi.clearAllMocks()
  mockApi()
})

describe('кнопка «В сохранённое»', () => {
  it('сохраняет урок числовым id и показывает состояние', async () => {
    render(<BookmarkButton target={{ lesson: 5 }} initialId={null} />)

    await userEvent.click(screen.getByRole('button', { name: 'В сохранённое' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'В сохранённом' })).toHaveAttribute('aria-pressed', 'true'))
    expect(calls[0]).toMatchObject({ url: '/api/bookmarks', init: { method: 'POST' } })
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ lesson: 5 })
  })

  it('задача сохраняется так же', async () => {
    render(<BookmarkButton target={{ task: 9 }} initialId={null} />)

    await userEvent.click(screen.getByRole('button', { name: 'В сохранённое' }))

    await waitFor(() => expect(calls).toHaveLength(1))
    expect(JSON.parse(String(calls[0].init?.body))).toEqual({ task: 9 })
  })

  it('повторное нажатие убирает закладку по её id', async () => {
    render(<BookmarkButton target={{ lesson: 5 }} initialId={31} />)

    await userEvent.click(screen.getByRole('button', { name: 'В сохранённом' }))

    await waitFor(() => expect(screen.getByRole('button', { name: 'В сохранённое' })).toHaveAttribute('aria-pressed', 'false'))
    expect(calls[0]).toMatchObject({ url: '/api/bookmarks/31', init: { method: 'DELETE' } })
  })

  it('сбой виден, состояние не меняется', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockApi(false)
    render(<BookmarkButton target={{ lesson: 5 }} initialId={null} />)

    await userEvent.click(screen.getByRole('button', { name: 'В сохранённое' }))

    await waitFor(() => expect(toast).toHaveBeenCalledWith('Не удалось сохранить — попробуйте ещё раз', 'error'))
    expect(screen.getByRole('button', { name: 'В сохранённое' })).toHaveAttribute('aria-pressed', 'false')
  })
})

describe('«Сохранённое»', () => {
  const items: SavedItem[] = [
    { id: '1', kind: 'lesson', title: 'Хуки', href: '/lessons/hooks', context: 'React', savedAt: '2026-09-20T10:00:00Z' },
    { id: '2', kind: 'task', title: 'Сумма', href: '/trainer/functions/sum', context: 'Функции', savedAt: '2026-09-19T10:00:00Z' },
  ]

  it('ссылки ведут на урок и задачу, видно курс и тему', () => {
    render(<SavedList items={items} />)

    expect(screen.getByRole('link', { name: 'Хуки' })).toHaveAttribute('href', '/lessons/hooks')
    expect(screen.getByRole('link', { name: 'Сумма' })).toHaveAttribute('href', '/trainer/functions/sum')
    expect(screen.getByText(/Урок · React/)).toBeInTheDocument()
  })

  it('фильтр «Задачи»', async () => {
    render(<SavedList items={items} />)

    await userEvent.click(screen.getByRole('button', { name: /Задачи/ }))

    expect(screen.queryByRole('link', { name: 'Хуки' })).not.toBeInTheDocument()
    expect(screen.getByText('1 запись')).toBeInTheDocument()
  })

  it('убрать из сохранённого — запись пропадает из списка', async () => {
    render(<SavedList items={items} />)

    await userEvent.click(screen.getByRole('button', { name: 'Убрать «Хуки» из сохранённого' }))

    await waitFor(() => expect(screen.queryByRole('link', { name: 'Хуки' })).not.toBeInTheDocument())
    expect(calls[0]).toMatchObject({ url: '/api/bookmarks/1', init: { method: 'DELETE' } })
  })

  it('пустой список объясняет, как сохранять', () => {
    render(<SavedList items={[]} />)

    expect(screen.getByText(/Нажмите «В сохранённое» на уроке или задаче/)).toBeInTheDocument()
  })
})
