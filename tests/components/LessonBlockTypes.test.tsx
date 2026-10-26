import { useLayoutEffect, useState } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import type { Lesson } from '@/payload-types'
import { emptyRichText } from '@/components/content-management/RichTextEditor'
import { LessonBlocks } from '@/components/content-management/LessonBlocks'

/**
 * Поля каждого вида материала в редакторе урока. Блок уходит в Payload как
 * есть, поэтому важно, какое поле меняет каждый ввод и во что превращается
 * пустое значение.
 */

type Blocks = NonNullable<Lesson['content']>
type TextBlock = Extract<Blocks[number], { blockType: 'text' }>
let latest: Blocks = []

function Harness({ initial, disabled = false }: { initial: Blocks; disabled?: boolean }) {
  const [value, setValue] = useState<Blocks>(initial)
  useLayoutEffect(() => { latest = value }, [value])
  return <LessonBlocks value={value} onChange={setValue} disabled={disabled} />
}

const block = (name: string) => screen.getByRole('article', { name })
const type = (field: HTMLElement, value: string) => fireEvent.change(field, { target: { value } })

beforeEach(() => {
  latest = []
  vi.stubGlobal('fetch', vi.fn(async () => Response.json({ id: 3, filename: 'scheme.png' })))
})
afterEach(() => vi.unstubAllGlobals())

describe('поля материалов урока', () => {
  it('пустой урок подсказывает, с чего начать, и предлагает все виды материалов, кроме импортируемого текста', () => {
    render(<Harness initial={[]} />)

    expect(screen.getByText('В уроке пока нет материалов. Начните с текста, видео, презентации или файла.')).toBeInTheDocument()
    const add = within(screen.getByRole('group', { name: 'Добавить материал' })).getAllByRole('button').map((button) => button.textContent)
    expect(add).toEqual(['Текст', 'Видео', 'Изображение', 'Ссылка', 'Miro-доска', 'Файл', 'Презентация'])
  })

  it('видео: режим показа, длительность и описание; пустая длительность сохраняется как null', () => {
    render(<Harness initial={[{ id: 'v1', blockType: 'video', title: 'HTTP', videoUrl: 'https://youtu.be/x', displayMode: 'embed', durationMinutes: 12 }]} />)
    const video = block('1. Видео')

    fireEvent.change(within(video).getByLabelText('Как показывать видео'), { target: { value: 'link' } })
    type(within(video).getByLabelText('Ссылка на видео *'), 'https://youtu.be/y')
    type(within(video).getByLabelText('Описание'), 'Протокол и методы')
    type(within(video).getByLabelText('Длительность видео, минуты'), '')
    expect(latest[0]).toMatchObject({ displayMode: 'link', videoUrl: 'https://youtu.be/y', description: 'Протокол и методы', durationMinutes: null })

    type(within(video).getByLabelText('Длительность видео, минуты'), '37')
    expect(latest[0]).toMatchObject({ durationMinutes: 37 })
    expect(within(video).getByLabelText('Ссылка на видео *')).toBeRequired()
  })

  it('ссылка: платформа и описание', () => {
    render(<Harness initial={[{ id: 'l1', blockType: 'link', title: 'Канал', url: 'https://t.me/x', platform: null }]} />)
    const link = block('1. Ссылка')

    expect(within(link).getByLabelText('Платформа')).toHaveValue('other')
    fireEvent.change(within(link).getByLabelText('Платформа'), { target: { value: 'telegram' } })
    type(within(link).getByLabelText('Описание'), 'Анонсы потоков')

    expect(latest[0]).toMatchObject({ platform: 'telegram', description: 'Анонсы потоков', title: 'Канал' })
  })

  it('Miro: подсказывает, где взять ссылку, ограничивает высоту и сохраняет пустую высоту как null', () => {
    render(<Harness initial={[{ id: 'm1', blockType: 'miro', title: 'Схема', embedUrl: '', height: 600 }]} />)
    const miro = block('1. Miro-доска')

    expect(within(miro).getByText(/«Поделиться» → «Встроить»/)).toBeInTheDocument()
    const height = within(miro).getByLabelText('Высота доски, пиксели')
    expect(height).toHaveAttribute('min', '300')
    expect(height).toHaveAttribute('max', '1200')
    type(within(miro).getByLabelText('Название доски *'), 'Архитектура')
    type(within(miro).getByLabelText('Ссылка для встраивания Miro *'), 'https://miro.com/app/live-embed/abc=/')
    type(height, '')
    expect(latest[0]).toMatchObject({ title: 'Архитектура', embedUrl: 'https://miro.com/app/live-embed/abc=/', height: null })

    type(height, '900')
    expect(latest[0]).toMatchObject({ height: 900 })
  })

  it('файл: название, описание и отвязка файла без удаления материала', async () => {
    const user = userEvent.setup()
    render(<Harness initial={[{ id: 'f1', blockType: 'file', title: 'Шпаргалка', file: 3 }]} />)
    const file = block('1. Файл')

    type(within(file).getByLabelText('Название файла *'), 'Шпаргалка по Git')
    type(within(file).getByLabelText('Описание'), 'PDF, 2 страницы')
    expect(await within(file).findByText('scheme.png')).toBeInTheDocument()
    await user.click(within(file).getByRole('button', { name: 'Убрать файл' }))

    expect(latest).toEqual([{ id: 'f1', blockType: 'file', title: 'Шпаргалка по Git', description: 'PDF, 2 страницы', file: 0 }])
    expect(within(file).getByText('Файл не выбран')).toBeInTheDocument()
  })

  it('изображение: подпись и описание для доступности, загруженный файл узнаётся по id', async () => {
    const user = userEvent.setup()
    render(<Harness initial={[{ id: 'i1', blockType: 'image', image: { id: 3, url: '/api/media/file/scheme.png', updatedAt: '', createdAt: '' } }]} />)
    const image = block('1. Изображение')

    expect(await within(image).findByText('scheme.png')).toBeInTheDocument()
    expect(vi.mocked(fetch).mock.calls[0][0]).toBe('/api/media/3?depth=0')
    type(within(image).getByLabelText('Подпись под изображением'), 'Схема запроса')
    type(within(image).getByLabelText('Описание изображения для доступности'), 'Клиент отправляет GET на сервер')
    await user.click(within(image).getByRole('button', { name: 'Убрать файл' }))

    expect(latest[0]).toMatchObject({ caption: 'Схема запроса', altText: 'Клиент отправляет GET на сервер', image: 0 })
  })

  it('выбранный файл не загрузился — связь остаётся, а редактор объясняет проблему', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'))
    render(<Harness initial={[{ id: 'f1', blockType: 'file', title: 'Шпаргалка', file: 3 }]} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось получить выбранный файл. Его связь сохранена')
    expect(screen.getByText('Выбран файл №3')).toBeInTheDocument()
    expect(latest[0]).toMatchObject({ file: 3 })
  })

  it('текст из репозитория показывает источник и не даёт править содержимое', () => {
    render(<Harness initial={[{ id: 'md1', blockType: 'markdown', markdown: '# Введение', source: 'lessons/intro.md' }]} />)
    const markdown = block('1. Текст из репозитория')

    expect(within(markdown).getByText(/приходит импортом \(lessons\/intro\.md\)/)).toBeInTheDocument()
    expect(within(markdown).queryByRole('textbox', { name: /Текст/ })).not.toBeInTheDocument()
    type(within(markdown).getByLabelText('Название блока для редактора'), 'Введение из Git')
    expect(latest[0]).toEqual({ id: 'md1', blockType: 'markdown', markdown: '# Введение', source: 'lessons/intro.md', blockName: 'Введение из Git' })
  })

  it('текст из репозитория без источника не выводит пустые скобки', () => {
    render(<Harness initial={[{ id: 'md1', blockType: 'markdown', markdown: '# Введение' }]} />)

    expect(screen.getByText(/приходит импортом\. Здесь его можно/)).toBeInTheDocument()
  })

  it('форматирование в тексте урока попадает в сам блок', async () => {
    const user = userEvent.setup()
    const content = { ...emptyRichText(), root: { ...emptyRichText().root, children: [{ type: 'paragraph', children: [{ type: 'text', text: 'Важно', format: 0, detail: 0, mode: 'normal', style: '', version: 1 }], direction: null, format: '', indent: 0, version: 1 }] } } as TextBlock['content']
    render(<Harness initial={[{ id: 't1', blockType: 'text', content }]} />)

    await act(async () => {
      screen.getByRole('textbox', { name: 'Текст урока' }).focus()
      const range = document.createRange()
      range.selectNodeContents(screen.getByText('Важно'))
      window.getSelection()?.removeAllRanges()
      window.getSelection()?.addRange(range)
      document.dispatchEvent(new Event('selectionchange'))
    })
    await user.click(screen.getByRole('button', { name: 'Жирный' }))

    await waitFor(() => expect(latest[0]).toMatchObject({ content: { root: { children: [{ children: [{ text: 'Важно', format: 1 }] }] } } }))
  })

  it('«Оставить материал» закрывает подтверждение без удаления', async () => {
    const user = userEvent.setup()
    render(<Harness initial={[{ id: 'l1', blockType: 'link', title: 'Канал', url: 'https://t.me/x' }]} />)

    await user.click(screen.getByRole('button', { name: 'Удалить материал 1' }))
    expect(screen.getByText('Удалить этот материал из урока?')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Оставить материал' }))

    expect(screen.queryByText('Удалить этот материал из урока?')).not.toBeInTheDocument()
    expect(latest).toHaveLength(1)
  })

  it('крайние материалы нельзя сдвинуть за край списка', () => {
    render(<Harness initial={[
      { id: 'a', blockType: 'link', title: 'A', url: 'https://a.example' },
      { id: 'b', blockType: 'link', title: 'B', url: 'https://b.example' },
    ]} />)

    expect(screen.getByRole('button', { name: 'Поднять материал 1' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Опустить материал 2' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Опустить материал 1' })).toBeEnabled()
  })

  it('во время сохранения материалы нельзя переставить, удалить, добавить или изменить', () => {
    render(<Harness disabled initial={[{ id: 'v1', blockType: 'video', title: 'HTTP', videoUrl: 'https://youtu.be/x', displayMode: 'embed' }]} />)

    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled()
    expect(screen.getByLabelText('Название видео *')).toBeDisabled()
    expect(screen.getByLabelText('Как показывать видео')).toBeDisabled()
  })
})
