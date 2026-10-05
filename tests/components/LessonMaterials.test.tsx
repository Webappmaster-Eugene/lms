import { useState } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { $getRoot, createEditor } from '@payloadcms/richtext-lexical/lexical'
import { LinkNode } from '@payloadcms/richtext-lexical/lexical/link'

import type { Course, Lesson } from '@/payload-types'
import { ContentLinkNode } from '@/components/content-management/ContentLinkNode'
import { LessonBlocks } from '@/components/content-management/LessonBlocks'
import { MediaPicker } from '@/components/content-management/MediaPicker'
import { RichTextEditor, emptyRichText, adaptLinkTypes, canEditRichText } from '@/components/content-management/RichTextEditor'

afterEach(() => vi.unstubAllGlobals())

function BlocksForm({ initial, changed }: { initial: NonNullable<Lesson['content']>; changed: (blocks: NonNullable<Lesson['content']>) => void }) {
  const [blocks, setBlocks] = useState(initial)
  return <LessonBlocks value={blocks} onChange={(next) => { setBlocks(next); changed(next) }} />
}

describe('Материалы урока в LMS', () => {
  it('меняет только выбранное поле, сохраняет ID, имена блоков и остальные материалы', async () => {
    const user = userEvent.setup()
    const changed = vi.fn()
    const initial: NonNullable<Lesson['content']> = [
      { id: 'existing-video', blockName: 'Архивный материал', blockType: 'video', title: 'HTTP', videoUrl: 'https://youtu.be/retained', displayMode: 'link', durationMinutes: 37, description: 'Введение' },
      { id: 'existing-link', blockType: 'link', title: 'Документация', url: 'https://nodejs.org', platform: 'other' },
    ]
    render(<BlocksForm initial={initial} changed={changed} />)
    await user.clear(screen.getByLabelText('Название видео *'))
    await user.type(screen.getByLabelText('Название видео *'), 'Протокол HTTP')
    expect(changed.mock.lastCall?.[0]).toEqual([{ ...initial[0], title: 'Протокол HTTP' }, initial[1]])
    await user.click(screen.getByRole('button', { name: 'Опустить материал 1' }))
    expect(changed.mock.lastCall?.[0].map((block: { id: string }) => block.id)).toEqual(['existing-link', 'existing-video'])
    await user.click(screen.getByRole('button', { name: 'Удалить материал 1' }))
    expect(changed.mock.lastCall?.[0]).toHaveLength(2)
    await user.click(screen.getByRole('button', { name: 'Да, удалить материал' }))
    expect(changed.mock.lastCall?.[0]).toEqual([{ ...initial[0], title: 'Протокол HTTP' }])
  })

  it('добавляет все шесть типов материалов с отдельными ID и ожидаемыми полями', async () => {
    const user = userEvent.setup()
    const changed = vi.fn()
    render(<BlocksForm initial={[]} changed={changed} />)
    for (const name of ['Текст', 'Видео', 'Изображение', 'Ссылка', 'Miro-доска', 'Файл']) await user.click(within(screen.getByRole('group', { name: 'Добавить материал' })).getByRole('button', { name }))
    const blocks = changed.mock.lastCall?.[0] as NonNullable<Lesson['content']>
    expect(blocks.map((block) => block.blockType)).toEqual(['text', 'video', 'image', 'link', 'miro', 'file'])
    expect(new Set(blocks.map((block) => block.id)).size).toBe(6)
    expect(screen.getByLabelText('Высота доски, пиксели')).toHaveValue(600)
    expect(screen.getByLabelText('Как показывать видео')).toHaveValue('embed')
  })

  it('не преобразует сложный существующий текст и оставляет остальные поля редактируемыми', async () => {
    const user = userEvent.setup()
    const changed = vi.fn()
    const complex: NonNullable<Course['description']> = { ...emptyRichText(), root: { ...emptyRichText().root, children: [{ type: 'upload', relationTo: 'media', value: 42, version: 3 }] } }
    render(<BlocksForm initial={[{ id: 'text-with-upload', blockType: 'text', content: complex }]} changed={changed} />)
    expect(screen.getByRole('alert')).toHaveTextContent('сложные элементы')
    expect(screen.queryByRole('textbox', { name: 'Текст урока' })).not.toBeInTheDocument()
    await user.type(screen.getByLabelText('Название блока для редактора'), 'Важная схема')
    expect(changed.mock.lastCall?.[0][0].content).toEqual(complex)
  })

  it('открывает форматированный Lexical без изменений и сохраняет внешнюю отмену', async () => {
    const changed = vi.fn()
    const rich = { ...emptyRichText(), root: { ...emptyRichText().root, children: [{ type: 'paragraph', children: [{ type: 'text', text: 'Жирный исходный текст', format: 1, detail: 0, mode: 'normal', style: '', version: 1 }], direction: null, format: '', indent: 0, version: 1 }] } } as NonNullable<Course['description']>
    const { rerender } = render(<RichTextEditor id="test-rich" label="Описание курса" value={rich} onChange={changed} />)
    await waitFor(() => expect(screen.getByText('Жирный исходный текст')).toHaveClass('font-bold'))
    expect(changed).not.toHaveBeenCalled()
    rerender(<RichTextEditor id="test-rich" label="Описание курса" value={emptyRichText()} onChange={changed} />)
    await waitFor(() => expect(screen.queryByText('Жирный исходный текст')).not.toBeInTheDocument())
    expect(changed).not.toHaveBeenCalled()
  })

  it('сохраняет формат Payload-ссылки, её ID, новую вкладку и дополнительные поля', () => {
    const editor = createEditor({ namespace: 'roundtrip', nodes: [ContentLinkNode, { replace: LinkNode, with: (node: LinkNode) => new ContentLinkNode(node.getURL()), withKlass: ContentLinkNode }], onError: (error) => { throw error } })
    const saved = { ...emptyRichText(), root: { ...emptyRichText().root, children: [{ type: 'paragraph', children: [{ type: 'link', id: 'payload-link-id', fields: { linkType: 'custom', url: 'https://nodejs.org', newTab: true, tracking: 'keep' }, children: [{ type: 'text', text: 'Node.js', format: 1, detail: 0, mode: 'normal', style: '', version: 1 }], direction: null, format: '', indent: 0, version: 3 }], direction: null, format: '', indent: 0, version: 1 }] } }
    editor.setEditorState(editor.parseEditorState(JSON.stringify(adaptLinkTypes(saved, 'content-link'))))
    const root = editor.getEditorState().toJSON().root
    expect(root.children[0]).toMatchObject({ children: [{ id: 'payload-link-id', fields: { linkType: 'custom', url: 'https://nodejs.org', newTab: true, tracking: 'keep' }, children: [{ text: 'Node.js', format: 1 }] }] })
    editor.getEditorState().read(() => expect($getRoot().getTextContent()).toBe('Node.js'))
    const value = { root: { ...root, children: root.children.map((child) => ({ ...child })) } }
    const native = adaptLinkTypes(value, 'link')
    expect(canEditRichText(native)).toBe(true)
    expect(native.root.children[0]).toMatchObject({ children: [{ type: 'link', id: 'payload-link-id', fields: { tracking: 'keep' } }] })
  })

  it('применяет форматирование и внешнюю ссылку к выделенному тексту через панель', async () => {
    const user = userEvent.setup()
    const changed = vi.fn()
    const rich = { ...emptyRichText(), root: { ...emptyRichText().root, children: [{ type: 'paragraph', children: [{ type: 'text', text: 'Документация Node.js', format: 0, detail: 0, mode: 'normal', style: '', version: 1 }], direction: null, format: '', indent: 0, version: 1 }] } } as NonNullable<Course['description']>
    render(<RichTextEditor id="toolbar-rich" label="Текст" value={rich} onChange={changed} />)
    const textbox = screen.getByRole('textbox', { name: 'Текст' })
    await act(async () => {
      textbox.focus()
      const range = document.createRange()
      range.selectNodeContents(screen.getByText('Документация Node.js'))
      window.getSelection()?.removeAllRanges()
      window.getSelection()?.addRange(range)
      document.dispatchEvent(new Event('selectionchange'))
    })
    await user.click(screen.getByRole('button', { name: 'Жирный' }))
    await waitFor(() => expect(changed.mock.lastCall?.[0].root.children[0]).toMatchObject({ children: [{ format: 1, text: 'Документация Node.js' }] }))
    await user.click(screen.getByRole('button', { name: 'Ссылка' }))
    await user.type(screen.getByLabelText('Адрес ссылки'), 'https://nodejs.org')
    await user.click(screen.getByRole('button', { name: 'Применить ссылку' }))
    await waitFor(() => expect(changed.mock.lastCall?.[0].root.children[0]).toMatchObject({ children: [{ type: 'link', fields: { linkType: 'custom', url: 'https://nodejs.org' }, children: [{ text: 'Документация Node.js', format: 1 }] }] }))
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })
})

describe('Выбор и загрузка файлов', () => {
  it('выбирает материал из следующей страницы и применяет серверный поиск', async () => {
    const user = userEvent.setup()
    const changed = vi.fn()
    const fetchMock = vi.fn(async (input: string) => {
      const url = new URL(input, 'http://localhost')
      const next = url.searchParams.get('page') === '2'
      return { ok: true, json: async () => ({ docs: [{ id: next ? 24 : 12, filename: next ? 'later.pdf' : 'first.pdf' }], totalPages: 5, totalDocs: 58 }) }
    })
    vi.stubGlobal('fetch', fetchMock)
    render(<MediaPicker id="files" label="Материал" value={null} onChange={changed} />)
    await user.click(screen.getByRole('button', { name: 'Выбрать или загрузить' }))
    await screen.findByRole('button', { name: /first.pdf/ })
    await user.click(screen.getByRole('button', { name: 'Следующие файлы' }))
    await screen.findByRole('button', { name: /later.pdf/ })
    await user.type(screen.getByLabelText('Поиск по имени файла'), 'инструкция')
    await user.click(screen.getByRole('button', { name: 'Найти' }))
    await waitFor(() => expect(fetchMock.mock.lastCall?.[0]).toContain('where%5Bfilename%5D%5Bcontains%5D='))
    expect(new URL(fetchMock.mock.lastCall?.[0] ?? '', 'http://localhost').searchParams.get('page')).toBe('1')
    await user.click(await screen.findByRole('button', { name: /first.pdf/ }))
    expect(changed).toHaveBeenCalledWith(12)
  })

  it('сообщает о сетевой ошибке и позволяет повторить запрос без потери связи', async () => {
    const user = userEvent.setup()
    const changed = vi.fn()
    const fetchMock = vi.fn().mockRejectedValueOnce(new Error('offline')).mockResolvedValue({ ok: true, json: async () => ({ docs: [], totalPages: 1, totalDocs: 0 }) })
    vi.stubGlobal('fetch', fetchMock)
    render(<MediaPicker id="failed" label="Файлы" value={null} onChange={changed} />)
    await user.click(screen.getByRole('button', { name: 'Выбрать или загрузить' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить файлы')
    await user.click(screen.getByRole('button', { name: 'Повторить загрузку' }))
    await screen.findByText('Файлы не найдены. Измените поиск или загрузите материал.')
    expect(changed).not.toHaveBeenCalled()
  })

  it('загружает файл multipart с credentials и выбирает новый media ID', async () => {
    const user = userEvent.setup()
    const changed = vi.fn()
    const fetchMock = vi.fn(async (_input: string, init?: RequestInit) => ({ ok: true, json: async () => init?.method === 'POST' ? { doc: { id: 99, filename: 'diagram.png', mimeType: 'image/png' } } : { docs: [], totalPages: 1, totalDocs: 0 } }))
    vi.stubGlobal('fetch', fetchMock)
    render(<MediaPicker id="image" label="Картинка" imageOnly value={null} onChange={changed} />)
    await user.click(screen.getByRole('button', { name: 'Выбрать или загрузить' }))
    await screen.findByText('Файлы не найдены. Измените поиск или загрузите материал.')
    await user.type(screen.getByLabelText('Описание файла для доступности'), 'Схема HTTP')
    await user.upload(screen.getByLabelText('Загрузить новый рисунок'), new File(['png'], 'diagram.png', { type: 'image/png' }))
    await waitFor(() => expect(changed).toHaveBeenCalledWith(99))
    const init = fetchMock.mock.calls.find((call) => call[1]?.method === 'POST')?.[1]
    expect(init?.credentials).toBe('include')
    expect(init?.body).toBeInstanceOf(FormData)
    expect((init?.body as FormData).get('_payload')).toBe(JSON.stringify({ alt: 'Схема HTTP' }))
    expect(screen.queryByLabelText('Загрузить новый рисунок')).not.toBeInTheDocument()
  })

  it('показывает отказ загрузки, сохраняя выбранный файл', async () => {
    vi.stubGlobal('fetch', vi.fn(async (input: string, init?: RequestInit) => ({ ok: init?.method !== 'POST', json: async () => input.includes('/7?') ? { id: 7, filename: 'saved.pdf' } : { docs: [], totalPages: 1, totalDocs: 0 } })))
    const changed = vi.fn()
    render(<MediaPicker id="upload-failed" label="Материал" value={7} onChange={changed} />)
    await screen.findByText('saved.pdf')
    await userEvent.click(screen.getByRole('button', { name: 'Заменить файл' }))
    await act(async () => { fireEvent.change(screen.getByLabelText('Загрузить новый файл'), { target: { files: [new File(['data'], 'new.pdf', { type: 'application/pdf' })] } }) })
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить файл')
    expect(changed).not.toHaveBeenCalled()
    expect(screen.getByText('saved.pdf')).toBeInTheDocument()
  })
})
