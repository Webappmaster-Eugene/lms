import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

vi.mock('next/link', async () => (await import('../helpers/component-mocks')).linkMock())

const { NotesList } = await import('@/components/lesson/NotesList')
import type { NoteEntry } from '@/lib/notes'

const notes: NoteEntry[] = [
  {
    id: '1',
    content: 'useEffect запускается после отрисовки',
    updatedAt: '2026-09-02T10:00:00Z',
    lesson: { title: 'Хуки', slug: 'hooks' },
    course: { id: '5', title: 'React', slug: 'react' },
  },
  {
    id: '2',
    content: 'Дженерики сужают тип',
    updatedAt: '2026-09-01T10:00:00Z',
    lesson: null,
    course: null,
  },
]

describe('мои заметки', () => {
  it('заметка ведёт на свой урок, курс — на страницу курса', () => {
    render(<NotesList notes={notes} />)

    expect(screen.getByRole('link', { name: 'Хуки' })).toHaveAttribute('href', '/lessons/hooks')
    expect(screen.getByRole('link', { name: 'React' })).toHaveAttribute('href', '/courses/react')
  })

  it('заметка к недоступному уроку видна, но без ссылки', () => {
    render(<NotesList notes={notes} />)

    const item = screen.getByText('Дженерики сужают тип').closest('li') as HTMLElement
    expect(within(item).getByText('Урок сейчас недоступен')).toBeInTheDocument()
    expect(within(item).queryByRole('link')).not.toBeInTheDocument()
  })

  it('поиск оставляет подходящие и считает их', async () => {
    render(<NotesList notes={notes} />)

    await userEvent.type(screen.getByRole('searchbox', { name: 'Найти в заметках' }), 'useeffect')

    expect(screen.queryByText('Дженерики сужают тип')).not.toBeInTheDocument()
    expect(screen.getByText('1 заметка')).toBeInTheDocument()
  })

  it('поиск без совпадений говорит об этом', async () => {
    render(<NotesList notes={notes} />)

    await userEvent.type(screen.getByRole('searchbox', { name: 'Найти в заметках' }), 'кобол')

    expect(screen.getByText(/В заметках такого нет/)).toBeInTheDocument()
  })

  it('без заметок подсказывает, где их писать', () => {
    render(<NotesList notes={[]} />)

    expect(screen.getByText(/Заметок пока нет/)).toBeInTheDocument()
    expect(screen.queryByRole('searchbox')).not.toBeInTheDocument()
  })

  it('все заметки скачиваются одним файлом', async () => {
    const createObjectURL = vi.fn((blob: Blob) => {
      void blob
      return 'blob:notes'
    })
    Object.assign(URL, { createObjectURL, revokeObjectURL: vi.fn() })
    const click = vi.spyOn(HTMLAnchorElement.prototype, 'click').mockImplementation(() => {})
    render(<NotesList notes={notes} />)

    await userEvent.click(screen.getByRole('button', { name: /Скачать все/ }))

    expect(click).toHaveBeenCalled()
    const blob = createObjectURL.mock.calls[0][0]
    expect(await blob.text()).toContain('### Хуки\n\nuseEffect запускается после отрисовки')
  })

  it('метка времени ведёт в урок сразу на этот момент видео', () => {
    render(<NotesList notes={[{ ...notes[0], content: 'Смотри [12:34] про эффекты' }]} />)

    expect(screen.getByRole('link', { name: '12:34' })).toHaveAttribute('href', '/lessons/hooks?t=754')
    expect(screen.getByText(/про эффекты/)).toBeInTheDocument()
  })
})
