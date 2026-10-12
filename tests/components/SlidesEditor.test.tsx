import { useLayoutEffect, useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'

import { mediaFileUrl } from '@/lib/slides'
import type { Lesson } from '@/payload-types'

vi.stubGlobal('fetch', vi.fn())
const { SlidesEditor } = await import('@/components/content-management/SlidesEditor')

type Block = Extract<NonNullable<Lesson['content']>[number], { blockType: 'slides' }>
const FOLDER = 'https://disk.yandex.com/d/key/guide'
const file = (name: string) => ({ url: `${FOLDER}/${name}`, fileName: name })
let latest: Block

function Harness({ initial }: { initial: Block }) {
  const [block, setBlock] = useState(initial)
  // Layout-эффект: значение готово к моменту, когда тест видит новую разметку.
  useLayoutEffect(() => { latest = block }, [block])
  // Как в редакторе урока: изменение собирается из данных последней отрисовки, а не из текущего состояния.
  return <SlidesEditor id="deck" block={block} disabled={false} onChange={(patch) => setBlock({ ...block, ...patch })} />
}
const open = (block: Partial<Block> = {}) => render(<Harness initial={{ id: 'b1', blockType: 'slides', title: 'Гайд', folderUrl: FOLDER, items: [], ...block }} />)
const names = () => within(screen.getByRole('list')).getAllByRole('link').map((link) => link.textContent)
const json = (body: unknown, status = 200) => new Response(JSON.stringify(body), { status })

// Со скобками: возвращённую из beforeEach функцию vitest вызвал бы как очистку — то есть сам мок.
beforeEach(() => { vi.mocked(fetch).mockReset() })

describe('редактор презентации', () => {
  it('заполняет список из папки Диска и просит сохранить урок', async () => {
    vi.mocked(fetch).mockResolvedValue(json({ files: [file('1.png'), file('2.png'), file('итог.pdf')] }))
    open()
    fireEvent.click(screen.getByRole('button', { name: 'Заполнить из папки' }))
    await waitFor(() => expect(names()).toEqual(['1.png', '2.png', 'итог.pdf']))
    const [url, init] = vi.mocked(fetch).mock.calls[0]
    expect(url).toBe('/api/manage/slides-folder')
    expect(JSON.parse(String(init?.body))).toEqual({ url: FOLDER })
    expect(screen.getByRole('status')).toHaveTextContent('В папке 3 файла: добавлено 3, убрано 0. Сохраните урок')
    expect(screen.getByText('PDF, листается постранично')).toBeInTheDocument()
  })

  it('обновление из папки сохраняет подписи, убирает исчезнувшие из неё файлы и не трогает добавленные вручную', async () => {
    vi.mocked(fetch).mockResolvedValue(json({ files: [file('1.png'), file('3.png')] }))
    open({ items: [
      { id: 'i2', url: `${FOLDER}/2.png`, fileName: '2.png' },
      { id: 'i1', url: `${FOLDER}/1.png`, fileName: '1.png', caption: 'Начало' },
      { id: 'm1', url: '/api/media/file/scheme.png', fileName: 'scheme.png' },
      { id: 'o1', url: 'https://disk.yandex.com/d/other/extra.png', fileName: 'extra.png' },
      { id: 'o2', url: `${FOLDER}/archive/old.png`, fileName: 'old.png' },
      { id: 's1', url: 'https://disk.yandex.ru/i/AbCdEf123', fileName: 'отдельный.pdf' },
    ] })
    fireEvent.click(screen.getByRole('button', { name: 'Обновить список из папки' }))
    await waitFor(() => expect(names()).toEqual(['1.png', '3.png', 'scheme.png', 'extra.png', 'old.png', 'отдельный.pdf']))
    expect(latest.items?.[0]).toMatchObject({ id: 'i1', caption: 'Начало' })
    expect(screen.getByRole('status')).toHaveTextContent('добавлено 1, убрано 1. Добавленные вручную (4) остались в конце списка')
  })

  it('ошибка Диска показывается рядом с папкой и не стирает уже собранный список', async () => {
    vi.mocked(fetch).mockResolvedValue(json({ error: 'Яндекс Диск не открыл ссылку.' }, 400))
    open({ items: [{ id: 'i1', url: `${FOLDER}/1.png`, fileName: '1.png' }] })
    fireEvent.click(screen.getByRole('button', { name: 'Обновить список из папки' }))
    const alert = await screen.findByRole('alert')
    expect(alert).toHaveTextContent('Яндекс Диск не открыл ссылку.')
    expect(alert.parentElement).toContainElement(screen.getByLabelText('Папка на Яндекс Диске'))
    expect(names()).toEqual(['1.png'])
  })

  it('страница ошибки вместо ответа сервера не выдаётся за обрыв связи', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('<html>Bad Gateway</html>', { status: 502 }))
    open({ items: [{ id: 'i1', url: `${FOLDER}/1.png`, fileName: '1.png' }] })
    fireEvent.click(screen.getByRole('button', { name: 'Обновить список из папки' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Сервер не смог прочитать папку (код 502). Список не изменён')
    expect(names()).toEqual(['1.png'])
  })

  it('без соединения список остаётся прежним', async () => {
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'))
    open({ items: [{ id: 'i1', url: `${FOLDER}/1.png`, fileName: '1.png' }] })
    fireEvent.click(screen.getByRole('button', { name: 'Обновить список из папки' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Нет соединения с сервером. Список не изменён')
    expect(names()).toEqual(['1.png'])
  })

  it('порядок, подпись и удаление файла меняются прямо в списке', () => {
    open({ items: [file('1.png'), file('2.png'), file('3.png')].map((item, index) => ({ id: `i${index}`, ...item })) })
    fireEvent.click(screen.getByRole('button', { name: 'Опустить файл 1' }))
    expect(names()).toEqual(['2.png', '1.png', '3.png'])
    fireEvent.click(screen.getByRole('button', { name: 'Убрать файл 3' }))
    expect(names()).toEqual(['2.png', '1.png'])
    fireEvent.change(screen.getByRole('textbox', { name: 'Подпись файла 2' }), { target: { value: 'Первый шаг' } })
    expect(latest.items).toEqual([
      { id: 'i1', url: `${FOLDER}/2.png`, fileName: '2.png' },
      { id: 'i0', url: `${FOLDER}/1.png`, fileName: '1.png', caption: 'Первый шаг' },
    ])
    expect(screen.getByRole('button', { name: 'Поднять файл 1' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Опустить файл 2' })).toBeDisabled()
  })

  it('по ссылке добавляется только файл Диска или медиатеки, и только один раз', () => {
    open()
    const input = screen.getByRole('textbox', { name: 'Добавить файл по ссылке' })
    const add = screen.getByRole('button', { name: 'Добавить ссылку' })
    expect(add).toBeDisabled()
    fireEvent.change(input, { target: { value: 'https://example.com/slide.png' } })
    fireEvent.click(add)
    expect(screen.getByRole('alert')).toHaveTextContent('Ссылка не подходит')
    fireEvent.change(input, { target: { value: `${FOLDER}/video.mp4` } })
    fireEvent.click(add)
    expect(screen.getByRole('alert')).toHaveTextContent('блоком «Видео»')
    fireEvent.change(input, { target: { value: FOLDER } })
    fireEvent.click(add)
    expect(screen.getByRole('alert')).toHaveTextContent('если это папка, вставьте ссылку в поле «Папка на Яндекс Диске»')
    expect(latest.items).toEqual([])
    fireEvent.change(input, { target: { value: ` ${FOLDER}/deck.pptx ` } })
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(names()).toEqual(['deck.pptx'])
    expect(latest.items?.[0]).toMatchObject({ url: `${FOLDER}/deck.pptx`, fileName: 'deck.pptx' })
    expect(screen.getByText(/сохраните её как PDF/)).toBeInTheDocument()
    expect(input).toHaveValue('')
    fireEvent.change(input, { target: { value: `${FOLDER}/deck.pptx` } })
    fireEvent.click(add)
    expect(screen.getByRole('alert')).toHaveTextContent('Этот файл уже есть в списке')
    expect(names()).toEqual(['deck.pptx'])
  })

  it('загруженные с компьютера файлы встают в конец списка, сбой одного называется по имени', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(json({ doc: { id: 11, filename: 'Снимок экрана (1).png' } }, 201))
      .mockResolvedValueOnce(json({ errors: [{ message: 'too large' }] }, 400))
      .mockResolvedValueOnce(json({ doc: { id: 12, filename: 'guide.pdf' } }, 201))
    open({ folderUrl: '', items: [{ id: 'i1', url: `${FOLDER}/1.png`, fileName: '1.png' }] })
    const picker = screen.getByLabelText('Загрузить картинки или PDF с компьютера')
    fireEvent.change(picker, { target: { files: [new File(['a'], 'Снимок экрана (1).png', { type: 'image/png' }), new File(['b'], 'big.png', { type: 'image/png' }), new File(['c'], 'guide.pdf', { type: 'application/pdf' })] } })
    await waitFor(() => expect(names()).toEqual(['1.png', 'Снимок экрана (1).png', 'guide.pdf']))
    // Скобки в адресе закодированы: по ним индекс файлов урока обрывал бы ссылку.
    expect(latest.items?.[1]).toMatchObject({ url: mediaFileUrl('Снимок экрана (1).png'), fileName: 'Снимок экрана (1).png' })
    expect(latest.items?.[1].url).toMatch(/%281%29\.png$/)
    expect(screen.getByRole('alert')).toHaveTextContent('Загружено файлов: 2. Не загрузилось: 1 (big.png)')
    expect(vi.mocked(fetch).mock.calls.every(([url, init]) => url === '/api/media' && init?.method === 'POST')).toBe(true)
  })

  it('правки, сделанные за время загрузки файла, не откатываются', async () => {
    let finish: ((response: Response) => void) | undefined
    vi.mocked(fetch).mockReturnValue(new Promise<Response>((resolve) => { finish = resolve }))
    open({ folderUrl: '', items: [] })
    fireEvent.change(screen.getByLabelText('Загрузить картинки или PDF с компьютера'), { target: { files: [new File(['a'], 'slide.png', { type: 'image/png' })] } })
    expect(await screen.findByRole('status')).toHaveTextContent('Загружаем файлы: 0 из 1')
    fireEvent.change(screen.getByRole('textbox', { name: 'Название презентации *' }), { target: { value: 'Новое название' } })
    await act(async () => { finish?.(json({ doc: { id: 11, filename: 'slide.png' } }, 201)) })
    await waitFor(() => expect(names()).toEqual(['slide.png']))
    expect(latest.title).toBe('Новое название')
  })

  it('блок удалили во время загрузки: её результат не достаётся другому материалу', async () => {
    let finish: ((response: Response) => void) | undefined
    vi.mocked(fetch).mockReturnValue(new Promise<Response>((resolve) => { finish = resolve }))
    const onChange = vi.fn()
    const view = render(<SlidesEditor id="deck" block={{ id: 'b1', blockType: 'slides', title: 'Гайд', items: [] }} disabled={false} onChange={onChange} />)
    fireEvent.change(screen.getByLabelText('Загрузить картинки или PDF с компьютера'), { target: { files: [new File(['a'], 'slide.png', { type: 'image/png' })] } })
    await waitFor(() => expect(fetch).toHaveBeenCalled())
    view.unmount()
    await act(async () => { finish?.(json({ doc: { id: 11, filename: 'slide.png' } }, 201)) })
    expect(onChange).not.toHaveBeenCalled()
  })

  it('миниатюры включаются по запросу и идут через прокси урока', async () => {
    open({ items: [{ id: 'i1', url: `${FOLDER}/1.png`, fileName: '1.png' }, { id: 'i2', url: `${FOLDER}/guide.pdf`, fileName: 'guide.pdf' }] })
    expect(document.querySelector('img')).toBeNull()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Показывать миниатюры' }))
    await waitFor(() => expect(document.querySelectorAll('img')).toHaveLength(1))
    expect(document.querySelector('img')).toHaveAttribute('src', `/api/learning-assets?${new URLSearchParams({ url: `${FOLDER}/1.png` })}`)
  })
})
