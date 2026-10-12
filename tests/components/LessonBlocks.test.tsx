import { useLayoutEffect, useState } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'

import type { Lesson } from '@/payload-types'

vi.mock('@/components/content-management/RichTextEditor', () => ({ emptyRichText: () => ({ root: { children: [] } }), RichTextEditor: () => <div>Редактор текста</div> }))
vi.mock('@/components/content-management/MediaPicker', () => ({ MediaPicker: () => <div>Выбор файла</div> }))

const { LessonBlocks } = await import('@/components/content-management/LessonBlocks')

type Blocks = NonNullable<Lesson['content']>
let latest: Blocks = []

function Harness({ initial = [] }: { initial?: Blocks }) {
  const [value, setValue] = useState<Blocks>(initial)
  useLayoutEffect(() => { latest = value }, [value])
  return <LessonBlocks value={value} onChange={setValue} />
}

describe('материалы урока в редакторе', () => {
  it('презентация добавляется кнопкой и редактируется как остальные материалы', () => {
    render(<Harness />)
    const add = screen.getByRole('group', { name: 'Добавить материал' })
    fireEvent.click(within(add).getByRole('button', { name: 'Презентация' }))
    const block = screen.getByRole('article', { name: '1. Презентация' })
    expect(within(block).getByText('Файлов пока нет. Заполните список из папки, добавьте ссылку или загрузите файлы.')).toBeInTheDocument()
    fireEvent.change(within(block).getByRole('textbox', { name: 'Название презентации *' }), { target: { value: 'Легенда' } })
    fireEvent.change(within(block).getByRole('textbox', { name: 'Добавить файл по ссылке' }), { target: { value: 'https://disk.yandex.ru/d/key/guide/1.png' } })
    fireEvent.click(within(block).getByRole('button', { name: 'Добавить ссылку' }))
    expect(latest).toHaveLength(1)
    expect(latest[0]).toMatchObject({ blockType: 'slides', title: 'Легенда', items: [{ url: 'https://disk.yandex.ru/d/key/guide/1.png', fileName: '1.png' }] })
    expect(typeof latest[0].id).toBe('string')
  })

  it('презентацию можно переставить и удалить с подтверждением', () => {
    render(<Harness initial={[
      { id: 'v1', blockType: 'video', title: 'Введение', videoUrl: 'https://example.com/v', displayMode: 'link' },
      { id: 's1', blockType: 'slides', title: 'Легенда', items: [{ id: 'i1', url: '/api/media/file/1.png', fileName: '1.png' }] },
    ]} />)
    fireEvent.click(screen.getByRole('button', { name: 'Поднять материал 2' }))
    expect(latest.map((block) => block.blockType)).toEqual(['slides', 'video'])
    fireEvent.click(screen.getByRole('button', { name: 'Удалить материал 1' }))
    expect(latest).toHaveLength(2)
    fireEvent.click(screen.getByRole('button', { name: 'Да, удалить материал' }))
    expect(latest.map((block) => block.blockType)).toEqual(['video'])
  })
})
