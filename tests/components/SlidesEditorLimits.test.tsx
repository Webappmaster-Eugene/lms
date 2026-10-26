import { useLayoutEffect, useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { SLIDES_LIMIT } from '@/lib/slides'
import type { Lesson } from '@/payload-types'

vi.stubGlobal('fetch', vi.fn())
const { SlidesEditor } = await import('@/components/content-management/SlidesEditor')

/**
 * Края редактора презентации: лимит файлов, сбои сети при загрузке,
 * сломанные миниатюры и поля, которые меняются прямо в блоке.
 */

type Block = Extract<NonNullable<Lesson['content']>[number], { blockType: 'slides' }>
type Item = NonNullable<Block['items']>[number]
const FOLDER = 'https://disk.yandex.com/d/key/guide'
let latest: Block

function Harness({ initial }: { initial: Block }) {
  const [block, setBlock] = useState(initial)
  useLayoutEffect(() => { latest = block }, [block])
  return <SlidesEditor id="deck" block={block} disabled={false} onChange={(patch) => setBlock({ ...block, ...patch })} />
}
const open = (block: Partial<Block> = {}) => render(<Harness initial={{ id: 'b1', blockType: 'slides', title: 'Гайд', folderUrl: FOLDER, items: [], ...block }} />)
const names = () => within(screen.getByRole('list')).getAllByRole('link').map((link) => link.textContent)
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })
const folderFiles = (count: number) => Array.from({ length: count }, (_, index) => ({ url: `${FOLDER}/${index + 1}.png`, fileName: `${index + 1}.png` }))
const manual = (count: number): Item[] => Array.from({ length: count }, (_, index) => ({ id: `m${index}`, url: `/api/media/file/manual-${index}.png`, fileName: `manual-${index}.png` }))
const png = (name: string) => new File(['png'], name, { type: 'image/png' })
// В списке на лимит около полутора тысяч полей и кнопок: поиск по ролям пересчитывал бы их
// на каждом опросе и под нагрузкой не укладывался в таймаут. Здесь элементы ищутся напрямую.
const message = (role: 'alert' | 'status') => waitFor(() => {
  const element = document.querySelector(`[role="${role}"]`)
  if (!element) throw new Error(`Нет сообщения ${role}`)
  return element
})

beforeEach(() => { vi.mocked(fetch).mockReset() })

describe('лимит файлов презентации', () => {
  it('папка, которая вместе с ручными файлами превысит лимит, не меняет список', async () => {
    vi.mocked(fetch).mockResolvedValue(json({ files: folderFiles(SLIDES_LIMIT - 1) }))
    open({ items: manual(2) })

    fireEvent.click(screen.getByRole('button', { name: 'Обновить список из папки' }))

    expect(await screen.findByRole('alert')).toHaveTextContent(`Вместе с добавленными вручную получится ${SLIDES_LIMIT + 1} файл, а в одной презентации их не более ${SLIDES_LIMIT}. Список не изменён.`)
    expect(names()).toEqual(['manual-0.png', 'manual-1.png'])
  })

  it('ровно лимит из папки помещается', async () => {
    vi.mocked(fetch).mockResolvedValue(json({ files: folderFiles(SLIDES_LIMIT) }))
    open()

    fireEvent.click(screen.getByRole('button', { name: 'Заполнить из папки' }))

    expect(await message('status')).toHaveTextContent(`В папке ${SLIDES_LIMIT} файлов: добавлено ${SLIDES_LIMIT}, убрано 0.`)
    expect(latest.items).toHaveLength(SLIDES_LIMIT)
  })

  it('по ссылке нельзя добавить файл сверх лимита', () => {
    open({ items: manual(SLIDES_LIMIT) })

    fireEvent.change(screen.getByPlaceholderText('Ссылка на файл на Яндекс Диске'), { target: { value: `${FOLDER}/extra.png` } })
    fireEvent.click(screen.getByText('Добавить ссылку'))

    expect(document.querySelector('[role="alert"]')).toHaveTextContent(`В одной презентации не более ${SLIDES_LIMIT} файлов.`)
    expect(latest.items).toHaveLength(SLIDES_LIMIT)
  })

  it('с компьютера загружается только то, что помещается в лимит, остальное называется числом', async () => {
    vi.mocked(fetch).mockResolvedValue(json({ doc: { id: 1, filename: 'last.png' } }, 201))
    open({ items: manual(SLIDES_LIMIT - 1) })

    fireEvent.change(document.getElementById('deck-upload') as HTMLInputElement, { target: { files: [png('last.png'), png('a.png'), png('b.png')] } })

    expect(await message('alert')).toHaveTextContent(`Загружено файлов: 1. Не поместилось в лимит ${SLIDES_LIMIT}: 2. Сохраните урок`)
    expect(fetch).toHaveBeenCalledOnce()
    expect(latest.items).toHaveLength(SLIDES_LIMIT)
  })
})

describe('загрузка и поля презентации', () => {
  it('обрыв сети при загрузке называет файл и не трогает список', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'))
    open({ folderUrl: '', items: manual(1) })

    fireEvent.change(screen.getByLabelText('Загрузить картинки или PDF с компьютера'), { target: { files: [png('slide.png')] } })

    expect(await screen.findByRole('alert')).toHaveTextContent('Загружено файлов: 0. Не загрузилось: 1 (slide.png) — проверьте формат (картинка или PDF), размер и соединение.')
    expect(screen.getByRole('alert')).not.toHaveTextContent('Сохраните урок')
    expect(names()).toEqual(['manual-0.png'])
  })

  it('пока читается папка, список и поля заблокированы, а кнопка говорит, что происходит', async () => {
    let finish: ((response: Response) => void) | undefined
    vi.mocked(fetch).mockReturnValue(new Promise<Response>((resolve) => { finish = resolve }))
    open({ items: manual(2) })

    fireEvent.click(screen.getByRole('button', { name: 'Обновить список из папки' }))

    expect(await screen.findByRole('button', { name: 'Читаем папку…' })).toBeDisabled()
    expect(screen.getByLabelText('Папка на Яндекс Диске')).toBeDisabled()
    expect(screen.getByRole('textbox', { name: 'Подпись файла 1' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Убрать файл 1' })).toBeDisabled()
    await act(async () => { finish?.(json({ files: [] })) })
    expect(screen.getByRole('button', { name: 'Обновить список из папки' })).toBeEnabled()
  })

  it('описание и ссылка на папку меняются прямо в блоке', () => {
    open({ folderUrl: '' })

    fireEvent.change(screen.getByRole('textbox', { name: 'Описание' }), { target: { value: 'Семь слайдов о найме' } })
    fireEvent.change(screen.getByLabelText('Папка на Яндекс Диске'), { target: { value: FOLDER } })

    expect(latest).toMatchObject({ description: 'Семь слайдов о найме', folderUrl: FOLDER })
  })

  it('файл можно поднять выше', () => {
    open({ items: manual(3) })

    fireEvent.click(screen.getByRole('button', { name: 'Поднять файл 3' }))

    expect(names()).toEqual(['manual-0.png', 'manual-2.png', 'manual-1.png'])
  })

  it('PDF и файл без расширения подписаны по тому, как их увидит ученик', () => {
    open({ items: [
      { id: 'p', url: `${FOLDER}/guide.pdf`, fileName: 'guide.pdf' },
      { id: 's', url: 'https://disk.yandex.ru/i/AbCdEf123', fileName: '' },
    ] })

    expect(screen.getByText('PDF, листается постранично')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Файл по ссылке Диска' })).toHaveAttribute('target', '_blank')
    expect(screen.getByText('файл для скачивания')).toBeInTheDocument()
  })

  it('сломанная миниатюра подписывается «не загрузился», а исправная остаётся картинкой', async () => {
    open({ items: [{ id: 'a', url: `${FOLDER}/1.png`, fileName: '1.png' }, { id: 'b', url: `${FOLDER}/2.png`, fileName: '2.png' }] })
    fireEvent.click(screen.getByRole('checkbox', { name: 'Показывать миниатюры' }))
    await waitFor(() => expect(document.querySelectorAll('img')).toHaveLength(2))
    const [broken, fine] = Array.from(document.querySelectorAll('img'))

    fireEvent.error(broken)
    fireEvent.load(fine)

    expect(screen.getByText('не загрузился')).toBeInTheDocument()
    expect(document.querySelectorAll('img')).toHaveLength(1)
    expect(document.querySelector('img')).toBe(fine)
  })
})
