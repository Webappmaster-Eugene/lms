import { Component, type ReactNode } from 'react'
import { afterEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import type { Course } from '@/payload-types'
import { RichTextEditor, emptyRichText } from '@/components/content-management/RichTextEditor'

/**
 * Панель форматирования текста урока на настоящем Lexical: каждая кнопка
 * должна менять сохраняемый документ, а не только вид в редакторе.
 */

type RichValue = NonNullable<Course['description']>

/** Граница ошибок страницы: без неё упавший редактор уронил бы сам тест, а не только форму. */
class Boundary extends Component<{ children: ReactNode }, { failed: boolean }> {
  state = { failed: false }
  static getDerivedStateFromError() { return { failed: true } }
  render() { return this.state.failed ? <p>Форма упала</p> : this.props.children }
}

const textNode = (text: string) => ({ type: 'text', text, format: 0, detail: 0, mode: 'normal', style: '', version: 1 })
const paragraph = (children: unknown[]) => ({ type: 'paragraph', children, direction: null, format: '', indent: 0, version: 1 })
const doc = (children: unknown[]): RichValue => ({ ...emptyRichText(), root: { ...emptyRichText().root, children } } as RichValue)

async function select(text: string) {
  await act(async () => {
    screen.getByRole('textbox', { name: 'Текст' }).focus()
    const range = document.createRange()
    range.selectNodeContents(screen.getByText(text))
    window.getSelection()?.removeAllRanges()
    window.getSelection()?.addRange(range)
    document.dispatchEvent(new Event('selectionchange'))
  })
}

function setup(value: RichValue) {
  const user = userEvent.setup()
  const changed = vi.fn()
  render(<RichTextEditor id="toolbar" label="Текст" value={value} onChange={changed} />)
  const first = () => (changed.mock.lastCall?.[0] as RichValue).root.children[0] as Record<string, unknown>
  return { user, changed, first }
}

afterEach(() => vi.restoreAllMocks())

describe('панель форматирования текста', () => {
  it('курсив помечает выделенный текст', async () => {
    const { user, first } = setup(doc([paragraph([textNode('Замыкание')])]))
    await select('Замыкание')

    await user.click(screen.getByRole('button', { name: 'Курсив' }))

    await waitFor(() => expect(first()).toMatchObject({ children: [{ text: 'Замыкание', format: 2 }] }))
  })

  it('абзац превращается в заголовок второго уровня и обратно', async () => {
    const { user, first } = setup(doc([paragraph([textNode('Введение')])]))
    await select('Введение')

    await user.click(screen.getByRole('button', { name: 'Заголовок' }))
    await waitFor(() => expect(first()).toMatchObject({ type: 'heading', tag: 'h2', children: [{ text: 'Введение' }] }))
    expect(screen.getByRole('heading', { level: 2, name: 'Введение' })).toBeInTheDocument()

    await select('Введение')
    await user.click(screen.getByRole('button', { name: 'Абзац' }))
    await waitFor(() => expect(first()).toMatchObject({ type: 'paragraph', children: [{ text: 'Введение' }] }))
  })

  it.each([
    ['Список', 'bullet', 'ul'],
    ['Нумерация', 'number', 'ol'],
  ])('кнопка «%s» делает из абзаца список', async (button, listType, tag) => {
    const { user, first } = setup(doc([paragraph([textNode('Установить Node')])]))
    await select('Установить Node')

    await user.click(screen.getByRole('button', { name: button }))

    await waitFor(() => expect(first()).toMatchObject({ type: 'list', listType, tag, children: [{ type: 'listitem', children: [{ text: 'Установить Node' }] }] }))
  })

  it('«Отменить» возвращает предыдущее форматирование, «Повторить» — снова применяет', async () => {
    const { user, first } = setup(doc([paragraph([textNode('npm ci')])]))
    await select('npm ci')
    await user.click(screen.getByRole('button', { name: 'Жирный' }))
    await waitFor(() => expect(first()).toMatchObject({ children: [{ format: 1 }] }))

    await user.click(screen.getByRole('button', { name: 'Отменить' }))
    await waitFor(() => expect(first()).toMatchObject({ children: [{ format: 0 }] }))

    await user.click(screen.getByRole('button', { name: 'Повторить' }))
    await waitFor(() => expect(first()).toMatchObject({ children: [{ format: 1 }] }))
  })

  it('ссылка без протокола не применяется и объясняет, какой адрес нужен', async () => {
    const { user, changed } = setup(doc([paragraph([textNode('Документация')])]))
    await select('Документация')

    await user.click(screen.getByRole('button', { name: 'Ссылка' }))
    await user.type(screen.getByLabelText('Адрес ссылки'), 'nodejs.org')
    await user.click(screen.getByRole('button', { name: 'Применить ссылку' }))

    expect(screen.getByRole('alert')).toHaveTextContent('Укажите ссылку с https:// или http://')
    expect(screen.getByLabelText('Адрес ссылки')).toHaveValue('nodejs.org')
    expect(JSON.stringify(changed.mock.calls)).not.toContain('"link"')
  })

  it('«Убрать ссылку» снимает ссылку с выделенного текста, оставляя сам текст', async () => {
    const link = { type: 'link', fields: { linkType: 'custom', url: 'https://nodejs.org', newTab: false }, children: [textNode('Node.js')], direction: null, format: '', indent: 0, version: 3 }
    const { user, first } = setup(doc([paragraph([link])]))
    expect(screen.getByRole('link', { name: 'Node.js' })).toHaveAttribute('href', 'https://nodejs.org')
    await select('Node.js')

    await user.click(screen.getByRole('button', { name: 'Ссылка' }))
    await user.click(screen.getByRole('button', { name: 'Убрать ссылку' }))

    await waitFor(() => expect(first()).toMatchObject({ type: 'paragraph', children: [{ type: 'text', text: 'Node.js' }] }))
    expect(screen.queryByRole('link', { name: 'Node.js' })).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Адрес ссылки')).not.toBeInTheDocument()
  })

  it('повторное нажатие «Ссылка» прячет поле адреса', async () => {
    const { user } = setup(emptyRichText())

    await user.click(screen.getByRole('button', { name: 'Ссылка' }))
    expect(screen.getByLabelText('Адрес ссылки')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Ссылка' }))

    expect(screen.queryByLabelText('Адрес ссылки')).not.toBeInTheDocument()
  })

  it('во время сохранения панель и сам текст недоступны для правки', async () => {
    render(<RichTextEditor id="locked" label="Текст" value={emptyRichText()} onChange={vi.fn()} disabled />)

    for (const button of screen.getAllByRole('button')) expect(button).toBeDisabled()
    await waitFor(() => expect(screen.getByRole('textbox', { name: 'Текст' })).toHaveAttribute('contenteditable', 'false'))
  })

  it('документ, который Lexical не смог открыть, заменяется предупреждением, а не пустым редактором', async () => {
    const changed = vi.fn()
    render(<RichTextEditor id="broken" label="Текст" value={doc([textNode('Текст без абзаца')])} onChange={changed} />)

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось открыть этот текст для редактирования. Исходное форматирование сохранено.')
    expect(screen.queryByRole('textbox', { name: 'Текст' })).not.toBeInTheDocument()
    expect(changed).not.toHaveBeenCalled()
  })

  // Дефект: canEditRichText (RichTextEditor.tsx:50) проверяет только типы узлов, но не вложенность,
  // а ошибку разбора начального состояния LexicalComposer (строка 156) бросает при отрисовке, мимо onError.
  // Пункт списка без списка роняет всю форму урока до ближайшей границы ошибок вместе с несохранёнными полями.
  it.fails('пункт списка вне списка не роняет форму, а показывает предупреждение — дефект: исключение при отрисовке', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    const listItem = { type: 'listitem', children: [textNode('Шаг')], direction: null, format: '', indent: 0, version: 1, value: 1 }
    render(<Boundary><RichTextEditor id="list" label="Текст" value={doc([listItem])} onChange={vi.fn()} /></Boundary>)

    expect(screen.queryByText(/Форма упала/)).not.toBeInTheDocument()
    expect(await screen.findByRole('alert')).toHaveTextContent('Исходный текст сохранён')
  })

  it('без начального значения открывает пустой документ и не сообщает об изменениях', () => {
    const changed = vi.fn()
    render(<RichTextEditor id="empty" label="Текст" value={null} onChange={changed} />)

    expect(screen.getByRole('textbox', { name: 'Текст' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(changed).not.toHaveBeenCalled()
  })
})
