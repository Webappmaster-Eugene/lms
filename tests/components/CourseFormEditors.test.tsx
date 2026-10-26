import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import type { Course, Roadmap } from '@/payload-types'

const navigation = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => navigation }))
vi.mock('next/link', async () => (await import('../helpers/component-mocks')).linkMock())

const { CourseForm } = await import('@/components/content-management/CourseForm')

/** Обложка и описание курса приходят из настоящих редакторов и должны попасть в тот же запрос, что и остальные поля. */

const timestamp = '2026-10-04T10:00:00.000Z'
const roadmap: Roadmap = { id: 1, title: 'Backend Node.js', slug: 'backend-nodejs', isPublished: true, updatedAt: timestamp, createdAt: timestamp }
const description = { root: { type: 'root', children: [{ type: 'paragraph', children: [{ type: 'text', text: 'Сервер на Node', format: 0, detail: 0, mode: 'normal', style: '', version: 1 }], direction: null, format: '', indent: 0, version: 1 }], direction: null, format: '', indent: 0, version: 1 } } as NonNullable<Course['description']>
const course: Course = { id: 5, title: 'Node.js', slug: 'nodejs', roadmap: 1, isPublished: false, description, updatedAt: timestamp, createdAt: timestamp }

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => {
    if (init?.method === 'PATCH') return Response.json({ doc: course })
    if (input.startsWith('/api/media/41?')) return Response.json({ id: 41, filename: 'cover.png', mimeType: 'image/png' })
    return Response.json({ docs: [{ id: 41, filename: 'cover.png', mimeType: 'image/png' }], totalPages: 1, totalDocs: 1 })
  }))
})

describe('редакторы внутри формы курса', () => {
  it('выбранная обложка и форматирование описания уходят в сохранение курса', async () => {
    const user = userEvent.setup()
    render(<CourseForm course={course} roadmaps={[roadmap]} nodes={[]} courses={[]} />)

    await user.click(screen.getByRole('button', { name: 'Выбрать или загрузить' }))
    await user.click(await screen.findByRole('button', { name: /cover\.png/ }))
    expect(screen.getByText('cover.png')).toBeInTheDocument()
    const media = vi.mocked(fetch).mock.calls.find(([url]) => String(url).startsWith('/api/media?'))
    expect(new URL(String(media?.[0]), 'http://localhost').searchParams.get('where[mimeType][contains]')).toBe('image/')

    await act(async () => {
      screen.getByRole('textbox', { name: 'Описание курса' }).focus()
      const range = document.createRange()
      range.selectNodeContents(screen.getByText('Сервер на Node'))
      window.getSelection()?.removeAllRanges()
      window.getSelection()?.addRange(range)
      document.dispatchEvent(new Event('selectionchange'))
    })
    await user.click(screen.getByRole('button', { name: 'Жирный' }))
    await waitFor(() => expect(screen.getByText('Есть несохранённые изменения')).toBeInTheDocument())
    await user.click(screen.getByRole('button', { name: 'Сохранить черновик' }))

    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('/manage/courses/5'))
    const patch = vi.mocked(fetch).mock.calls.find(([, init]) => init?.method === 'PATCH')
    const body = JSON.parse(String(patch?.[1]?.body)) as { coverImage: number; description: typeof description }
    expect(body.coverImage).toBe(41)
    expect(body.description.root.children[0]).toMatchObject({ type: 'paragraph', children: [{ text: 'Сервер на Node', format: 1 }] })
  })
})
