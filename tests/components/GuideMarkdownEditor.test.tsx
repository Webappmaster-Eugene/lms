import { useState, type ComponentProps } from 'react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const state = vi.hoisted(() => ({ initial: '' }))
vi.mock('@payloadcms/ui', () => ({
  useField: () => {
    const [value, setValue] = useState(state.initial)
    return { value, setValue, showError: false }
  },
  FieldLabel: ({ htmlFor, label }: { htmlFor: string; label: string }) => <label htmlFor={htmlFor}>{label}</label>,
  FieldError: () => null,
  FieldDescription: ({ description }: { description: string }) => <p data-testid="field-description">{description}</p>,
}))
// Настоящий shiki в jsdom грузится секундами; подсветку проверяют тесты содержимого гайда.
vi.mock('@/lib/markdown-highlighter', () => ({
  markdownLanguage: (language: string) => language,
  getMarkdownHighlighter: vi.fn(async () => ({ getLoadedLanguages: () => [], codeToHtml: () => '' })),
}))

const { GuideMarkdownEditor } = await import('@/components/guides/GuideMarkdownEditor')

type EditorProps = Partial<ComponentProps<typeof GuideMarkdownEditor>>

function editor(props: EditorProps = {}) {
  return render(<GuideMarkdownEditor field={{ name: 'markdown', type: 'textarea', label: 'Текст гайда' }} path="markdown" {...props} />)
}

const textbox = () => screen.getByRole<HTMLTextAreaElement>('textbox')
const selected = (input: HTMLTextAreaElement) => input.value.slice(input.selectionStart, input.selectionEnd)

function selectText(input: HTMLTextAreaElement, fragment: string) {
  const start = input.value.indexOf(fragment)
  input.setSelectionRange(start, start + fragment.length)
}

function placeCaret(input: HTMLTextAreaElement, offset = input.value.length) {
  input.setSelectionRange(offset, offset)
}

beforeEach(() => {
  state.initial = ''
  localStorage.clear()
  localStorage.setItem('guide-editor-mode', 'split')
})

afterEach(() => {
  vi.restoreAllMocks()
  vi.unstubAllGlobals()
})

describe('редактор гайда', () => {
  it('исправляет старые символы • в настоящие списки и сразу показывает результат', async () => {
    state.initial = 'Описание.\n• Первый\n• Второй'
    editor()
    const preview = screen.getByLabelText('Предпросмотр гайда')
    expect(within(preview).queryByRole('list')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Преобразовать символы • в Markdown-списки' }))
    expect(screen.getByRole('textbox')).toHaveValue('Описание.\n- Первый\n- Второй')
    expect(within(preview).getAllByRole('listitem')).toHaveLength(2)
  })

  it('кнопка списка убирает символ • и не дублирует его', async () => {
    state.initial = '• Первый\n• Второй'
    editor()
    const input = screen.getByRole<HTMLTextAreaElement>('textbox')
    input.setSelectionRange(0, state.initial.length)
    await userEvent.click(screen.getByRole('button', { name: /^Список$/ }))
    expect(input).toHaveValue('- Первый\n- Второй')
  })

  it('Enter продолжает чек-лист; Enter на пустом пункте выходит из него', () => {
    state.initial = '- [x] Проверить'
    editor()
    const input = screen.getByRole<HTMLTextAreaElement>('textbox')
    input.setSelectionRange(input.value.length, input.value.length)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(input).toHaveValue('- [x] Проверить\n- [ ] ')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(input).toHaveValue('- [x] Проверить\n\n')
  })

  it('вставка списка не меняет старые пункты и сразу размечает вставленные', () => {
    state.initial = '• Старый\n\n'
    editor()
    const input = screen.getByRole<HTMLTextAreaElement>('textbox')
    input.setSelectionRange(input.value.length, input.value.length)
    fireEvent.paste(input, { clipboardData: { getData: () => '• Первый\n• Второй' } })
    expect(input).toHaveValue('• Старый\n\n- Первый\n- Второй')
  })

  it('панель форматирования работает из режима просмотра', async () => {
    state.initial = 'Раздел'
    localStorage.setItem('guide-editor-mode', 'preview')
    editor()
    await userEvent.click(screen.getByRole('button', { name: 'Раздел - пункт оглавления' }))
    expect(screen.getByRole('textbox')).toHaveValue('## Раздел')
    expect(within(screen.getByLabelText('Предпросмотр гайда')).getByRole('heading', { name: 'Раздел', level: 2 })).toBeVisible()
  })
})

describe('вид редактора', () => {
  function stubWideScreen(wide: boolean) {
    vi.stubGlobal('matchMedia', vi.fn((query: string) => ({ matches: wide && query === '(min-width: 1100px)' })))
  }

  it('без сохранённого выбора широкий экран открывает текст и просмотр рядом', () => {
    localStorage.clear()
    stubWideScreen(true)
    editor()
    expect(screen.getByRole('button', { name: 'Рядом' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Предпросмотр гайда')).toBeInTheDocument()
  })

  it('на узком экране без сохранённого выбора открывает только Markdown', () => {
    localStorage.clear()
    stubWideScreen(false)
    editor()
    expect(screen.getByRole('button', { name: 'Markdown' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.queryByLabelText('Предпросмотр гайда')).not.toBeInTheDocument()
  })

  it('запоминает выбранный вид до следующего открытия', async () => {
    const { unmount } = editor()
    await userEvent.click(screen.getByRole('button', { name: 'Просмотр' }))
    expect(screen.getByRole('button', { name: 'Просмотр' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('textbox', { hidden: true })).not.toBeVisible()
    expect(localStorage.getItem('guide-editor-mode')).toBe('preview')
    unmount()

    editor()
    expect(screen.getByRole('button', { name: 'Просмотр' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('недоступное хранилище не мешает выбрать вид: режим берётся по ширине экрана', async () => {
    stubWideScreen(false)
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('denied', 'SecurityError') })
    editor()
    expect(screen.getByRole('button', { name: 'Markdown' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'Рядом' }))
    expect(screen.getByRole('button', { name: 'Рядом' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByLabelText('Предпросмотр гайда')).toBeInTheDocument()
  })

  it('на весь экран блокирует прокрутку страницы, Esc возвращает обычный вид', async () => {
    const user = userEvent.setup()
    editor()
    await user.click(screen.getByRole('button', { name: 'На весь экран' }))
    expect(screen.getByRole('button', { name: 'Свернуть (Esc)' })).toBeInTheDocument()
    expect(document.body.style.overflow).toBe('hidden')

    await user.keyboard('{Escape}')
    expect(screen.getByRole('button', { name: 'На весь экран' })).toBeInTheDocument()
    expect(document.body.style.overflow).toBe('')
  })

  it('кнопка «Свернуть» тоже выходит из полноэкранного режима, другие клавиши его не закрывают', async () => {
    const user = userEvent.setup()
    editor()
    await user.click(screen.getByRole('button', { name: 'На весь экран' }))
    fireEvent.keyDown(document, { key: 'Enter' })
    expect(screen.getByRole('button', { name: 'Свернуть (Esc)' })).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Свернуть (Esc)' }))
    expect(screen.getByRole('button', { name: 'На весь экран' })).toBeInTheDocument()
    expect(document.body.style.overflow).toBe('')
  })

  it('в режиме «Рядом» предпросмотр прокручивается вместе с текстом пропорционально', () => {
    state.initial = 'Текст'
    editor()
    const input = textbox()
    const preview = screen.getByLabelText('Предпросмотр гайда')
    // Размеры даёт браузерная вёрстка, которой в jsdom нет.
    Object.defineProperties(input, { scrollHeight: { value: 1000 }, clientHeight: { value: 200 }, scrollTop: { value: 400, writable: true } })
    Object.defineProperties(preview, { scrollHeight: { value: 2200 }, clientHeight: { value: 200 }, scrollTop: { value: 0, writable: true } })
    fireEvent.scroll(input)
    expect(preview.scrollTop).toBe(1000)
  })
})

describe('панель форматирования', () => {
  it('жирный обрамляет выделенный текст и оставляет его выделенным', async () => {
    state.initial = 'Нажмите Сохранить внизу'
    editor()
    const input = textbox()
    selectText(input, 'Сохранить')
    await userEvent.click(screen.getByRole('button', { name: 'Жирный' }))
    expect(input).toHaveValue('Нажмите **Сохранить** внизу')
    expect(selected(input)).toBe('Сохранить')
  })

  it('без выделения курсив и код вставляют выделенный образец, который сразу можно перепечатать', async () => {
    editor()
    const input = textbox()
    await userEvent.click(screen.getByRole('button', { name: 'Курсив' }))
    expect(input).toHaveValue('*курсив*')
    expect(selected(input)).toBe('курсив')

    placeCaret(input)
    await userEvent.click(screen.getByRole('button', { name: 'Код в строке' }))
    expect(input).toHaveValue('*курсив*`код`')
    expect(selected(input)).toBe('код')
  })

  it('H3, нумерованный список и чек-лист меняют начало каждой выделенной строки', async () => {
    state.initial = 'Итоги\nПервый\nВторой'
    editor()
    const input = textbox()
    placeCaret(input, 2)
    await userEvent.click(screen.getByRole('button', { name: 'Подраздел' }))
    expect(input).toHaveValue('### Итоги\nПервый\nВторой')

    selectText(input, 'Первый\nВторой')
    await userEvent.click(screen.getByRole('button', { name: 'Нумерованный список' }))
    expect(input).toHaveValue('### Итоги\n1. Первый\n2. Второй')

    selectText(input, '1. Первый\n2. Второй')
    await userEvent.click(screen.getByRole('button', { name: 'Чек-лист' }))
    expect(input).toHaveValue('### Итоги\n- [ ] Первый\n- [ ] Второй')
  })

  it('выделение, захватившее перевод строки, не меняет следующую строку', async () => {
    state.initial = 'Первый\nВторой\nТретий'
    editor()
    const input = textbox()
    selectText(input, 'Первый\nВторой\n')
    await userEvent.click(screen.getByRole('button', { name: 'Список' }))
    expect(input).toHaveValue('- Первый\n- Второй\nТретий')
  })

  it('ссылка из выделенного текста выделяет адрес, чтобы вставить URL', async () => {
    state.initial = 'Откройте документацию'
    editor()
    const input = textbox()
    selectText(input, 'документацию')
    await userEvent.click(screen.getByRole('button', { name: 'Ссылка' }))
    expect(input).toHaveValue('Откройте [документацию](https://)')
    expect(selected(input)).toBe('https://')
  })

  it('ссылка без выделения вставляет образец и выделяет текст ссылки', async () => {
    editor()
    const input = textbox()
    await userEvent.click(screen.getByRole('button', { name: 'Ссылка' }))
    expect(input).toHaveValue('[текст ссылки](https://)')
    expect(selected(input)).toBe('текст ссылки')
  })

  it('блок кода отделяется пустыми строками от соседнего текста и выделяет команду', async () => {
    state.initial = 'До\nПосле'
    editor()
    const input = textbox()
    placeCaret(input, 2)
    await userEvent.click(screen.getByRole('button', { name: 'Блок кода' }))
    expect(input).toHaveValue('До\n\n```bash\nкоманда\n```\n\nПосле')
    expect(selected(input)).toBe('команда')
  })

  it('блок кода из выделения оборачивает выделенную команду', async () => {
    state.initial = 'Шаг:\n\nnpm install\n\nдальше'
    editor()
    const input = textbox()
    selectText(input, 'npm install')
    await userEvent.click(screen.getByRole('button', { name: 'Блок кода' }))
    expect(input).toHaveValue('Шаг:\n\n```bash\nnpm install\n```\n\nдальше')
  })

  it('таблица вставляется отдельным абзацем и выделяет первый заголовок колонки', async () => {
    state.initial = 'Тарифы:\n'
    editor()
    const input = textbox()
    placeCaret(input)
    await userEvent.click(screen.getByRole('button', { name: 'Таблица' }))
    expect(input.value).toBe('Тарифы:\n\n| Колонка | Колонка | Колонка |\n| --- | --- | --- |\n| Текст | Текст | Текст |\n| Текст | Текст | Текст |')
    expect(selected(input)).toBe('Колонка')
    expect(within(screen.getByLabelText('Предпросмотр гайда')).getByRole('table')).toBeInTheDocument()
  })

  it('врезка из выделенных строк превращает каждую строку в цитату с маркером типа', async () => {
    state.initial = 'Не храните ключ в репозитории\nДаже в закрытом'
    editor()
    const input = textbox()
    input.setSelectionRange(0, input.value.length)
    await userEvent.selectOptions(screen.getByLabelText('Врезка'), 'warning')
    expect(input).toHaveValue('> [!WARNING]\n> Не храните ключ в репозитории\n> Даже в закрытом')
    expect(selected(input)).toBe('Не храните ключ в репозитории')
    expect(screen.getByLabelText('Врезка')).toHaveValue('')
  })

  it('врезка без выделения вставляет образец текста', async () => {
    editor()
    await userEvent.selectOptions(screen.getByLabelText('Врезка'), 'tip')
    expect(textbox()).toHaveValue('> [!TIP]\n> Текст врезки')
    expect(selected(textbox())).toBe('Текст врезки')
  })

  it('шаблон предлагается только пустому гайду и вставляет структуру разделов', async () => {
    editor()
    await userEvent.click(screen.getByRole('button', { name: 'Вставить шаблон гайда' }))
    expect(textbox().value).toMatch(/^Вступление: для кого этот гайд/)
    expect(textbox().value).toContain('## Шаг 1. Название шага')
    expect(screen.queryByRole('button', { name: 'Вставить шаблон гайда' })).not.toBeInTheDocument()
    expect(screen.getByText(/разделов: 4/)).toBeInTheDocument()
  })

  it('там, где браузер умеет insertText, правка идёт через него — Ctrl+Z её отменит', async () => {
    state.initial = 'текст'
    editor()
    const input = textbox()
    // Как в браузере: insertText меняет поле и посылает input, из которого React берёт значение.
    const execCommand = vi.fn((_command: string, _ui: boolean, inserted: string) => {
      input.setRangeText(inserted, input.selectionStart, input.selectionEnd, 'end')
      input.dispatchEvent(new Event('input', { bubbles: true }))
      return true
    })
    Object.defineProperty(document, 'execCommand', { value: execCommand, configurable: true })
    try {
      selectText(input, 'текст')
      await userEvent.click(screen.getByRole('button', { name: 'Жирный' }))
      expect(execCommand).toHaveBeenCalledWith('insertText', false, '**текст**')
      expect(input).toHaveValue('**текст**')
      expect(selected(input)).toBe('текст')
    } finally {
      Reflect.deleteProperty(document, 'execCommand')
    }
  })
})

describe('клавиатура', () => {
  it('Ctrl+B, Cmd+I и Ctrl+K работают и в русской раскладке', () => {
    state.initial = 'важно'
    editor()
    const input = textbox()
    selectText(input, 'важно')
    fireEvent.keyDown(input, { key: 'и', ctrlKey: true })
    expect(input).toHaveValue('**важно**')

    selectText(input, 'важно')
    fireEvent.keyDown(input, { key: 'I', metaKey: true })
    expect(input).toHaveValue('***важно***')

    placeCaret(input)
    fireEvent.keyDown(input, { key: 'л', ctrlKey: true })
    expect(input).toHaveValue('***важно***[текст ссылки](https://)')
  })

  it('сочетание с Alt и обычные буквы не форматируют текст и не перехватываются', () => {
    state.initial = 'важно'
    editor()
    const input = textbox()
    selectText(input, 'важно')
    expect(fireEvent.keyDown(input, { key: 'b', ctrlKey: true, altKey: true })).toBe(true)
    expect(fireEvent.keyDown(input, { key: 'b' })).toBe(true)
    expect(fireEvent.keyDown(input, { key: 'z', ctrlKey: true })).toBe(true)
    expect(input).toHaveValue('важно')
  })

  it('Shift+Enter и Enter вне списка оставлены браузеру', () => {
    state.initial = '- Пункт'
    editor()
    const input = textbox()
    placeCaret(input)
    expect(fireEvent.keyDown(input, { key: 'Enter', shiftKey: true })).toBe(true)
    expect(input).toHaveValue('- Пункт')

    fireEvent.change(input, { target: { value: 'Абзац' } })
    placeCaret(input)
    expect(fireEvent.keyDown(input, { key: 'Enter' })).toBe(true)
    expect(input).toHaveValue('Абзац')
  })

  it('Enter во время набора через IME не продолжает список', () => {
    state.initial = '1. Пункт'
    editor()
    const input = textbox()
    placeCaret(input)
    expect(fireEvent.keyDown(input, { key: 'Enter', isComposing: true })).toBe(true)
    expect(input).toHaveValue('1. Пункт')
  })

  it('набор текста обновляет предпросмотр и счётчики под полем', async () => {
    editor()
    await userEvent.type(textbox(), '## Установка')
    expect(within(screen.getByLabelText('Предпросмотр гайда')).getByRole('heading', { level: 2, name: 'Установка' })).toBeInTheDocument()
    expect(screen.getByText('≈ 1 мин чтения · разделов: 1 · символов: 12')).toBeInTheDocument()
  })

  it('обычная вставка текста без символов • идёт штатно', () => {
    state.initial = 'Начало'
    editor()
    const input = textbox()
    placeCaret(input)
    expect(fireEvent.paste(input, { clipboardData: { getData: () => ' и продолжение' } })).toBe(true)
    expect(input).toHaveValue('Начало')
  })

  it('символ • внутри открытого блока кода при вставке сохраняется', () => {
    state.initial = '```text\n\n```'
    editor()
    const input = textbox()
    placeCaret(input, '```text\n'.length)
    expect(fireEvent.paste(input, { clipboardData: { getData: () => '• вывод программы' } })).toBe(true)
    expect(input).toHaveValue('```text\n\n```')
  })
})

describe('только чтение', () => {
  it('панель неактивна, клавиши и вставка текст не меняют', () => {
    state.initial = '- Пункт'
    editor({ readOnly: true })
    const input = textbox()
    expect(input).toHaveAttribute('readonly')
    for (const name of ['Раздел - пункт оглавления', 'Жирный', 'Список', 'Ссылка', 'Картинка - загрузить в медиатеку', 'Таблица', 'Блок кода']) {
      expect(screen.getByRole('button', { name })).toBeDisabled()
    }
    expect(screen.getByLabelText('Врезка')).toBeDisabled()

    placeCaret(input)
    expect(fireEvent.keyDown(input, { key: 'Enter' })).toBe(true)
    expect(fireEvent.keyDown(input, { key: 'b', ctrlKey: true })).toBe(true)
    expect(fireEvent.paste(input, { clipboardData: { getData: () => '• Новый' } })).toBe(true)
    expect(input).toHaveValue('- Пункт')
  })

  it('вид и полноэкранный режим доступны и без права правки', async () => {
    editor({ readOnly: true })
    await userEvent.click(screen.getByRole('button', { name: 'Просмотр' }))
    expect(screen.getByRole('button', { name: 'Просмотр' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'На весь экран' })).toBeEnabled()
  })
})

describe('подсказка под полем', () => {
  it('по умолчанию объясняет разделы, врезки и сочетания клавиш', () => {
    editor()
    expect(screen.getByTestId('field-description')).toHaveTextContent('Ctrl+B - жирный, Ctrl+I - курсив, Ctrl+K - ссылка')
  })

  it('описание из настроек поля заменяет стандартное', () => {
    editor({ field: { name: 'markdown', type: 'textarea', label: 'Текст гайда', admin: { description: 'Пишите коротко.' } } })
    expect(screen.getByTestId('field-description')).toHaveTextContent('Пишите коротко.')
  })
})

describe('картинка в гайде', () => {
  type Uploaded = { url: string; method?: string; file: File | null; payload: unknown }
  let uploads: Uploaded[] = []

  function mockMedia(respond: () => Response | Promise<Response>) {
    uploads = []
    vi.stubGlobal('fetch', vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
      const body = init?.body as FormData
      uploads.push({ url: String(url), method: init?.method, file: body.get('file') as File | null, payload: JSON.parse(String(body.get('_payload'))) })
      return respond()
    }))
  }

  const fileInput = (container: HTMLElement) => container.querySelector<HTMLInputElement>('input[type="file"]') as HTMLInputElement
  const image = (name: string, type = 'image/png') => new File(['png'], name, { type })

  it('кнопка открывает выбор файла с картинками подходящих форматов', async () => {
    const { container } = editor()
    const input = fileInput(container)
    const opened = vi.fn()
    input.addEventListener('click', opened)
    await userEvent.click(screen.getByRole('button', { name: 'Картинка - загрузить в медиатеку' }))
    expect(opened).toHaveBeenCalledOnce()
    expect(input).toHaveAttribute('accept', 'image/png,image/jpeg,image/webp,image/gif')
  })

  it('загружает файл в медиатеку и вставляет картинку с адресом без домена и описанием из имени', async () => {
    mockMedia(() => Response.json({ doc: { url: 'https://learn.mentorcareer.ru/api/media/file/step-1.png' } }))
    state.initial = 'Откройте настройки.'
    const { container } = editor()
    const input = textbox()
    placeCaret(input)
    await userEvent.upload(fileInput(container), image('step-1_login.png'))

    await waitFor(() => expect(input).toHaveValue('Откройте настройки.\n\n![step 1 login](/api/media/file/step-1.png)\n\n'))
    expect(uploads).toHaveLength(1)
    expect(uploads[0]).toMatchObject({ url: '/api/media', method: 'POST', payload: { alt: 'step 1 login' } })
    expect(uploads[0].file?.name).toBe('step-1_login.png')
    expect(selected(input)).toBe('step 1 login')
    expect(screen.getByRole('status')).toHaveTextContent('Картинка загружена в медиатеку. Поправьте описание')
  })

  it('пока файл загружается, кнопка показывает загрузку и не даёт выбрать второй', async () => {
    let finish: (response: Response) => void = () => {}
    mockMedia(() => new Promise<Response>((resolve) => { finish = resolve }))
    const { container } = editor()
    await userEvent.upload(fileInput(container), image('схема.png'))
    expect(await screen.findByRole('status')).toHaveTextContent('Загружаем «схема.png»…')
    expect(screen.getByRole('button', { name: 'Картинка - загрузить в медиатеку' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Картинка - загрузить в медиатеку' })).toHaveTextContent('Загрузка…')

    finish(Response.json({ doc: { url: '/api/media/file/shema.png' } }))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Картинка - загрузить в медиатеку' })).toBeEnabled())
    expect(textbox()).toHaveValue('![схема](/api/media/file/shema.png)\n\n')
  })

  it('файл без понятного имени получает описание «Скриншот»', async () => {
    mockMedia(() => Response.json({ doc: { url: '/api/media/file/1.png' } }))
    const { container } = editor()
    await userEvent.upload(fileInput(container), image('__.png'))
    await waitFor(() => expect(textbox()).toHaveValue('![Скриншот](/api/media/file/1.png)\n\n'))
  })

  it('не картинку отклоняет до загрузки и называет допустимые форматы', async () => {
    mockMedia(() => Response.json({}))
    const { container } = editor()
    await userEvent.setup({ applyAccept: false }).upload(fileInput(container), new File(['%PDF'], 'договор.pdf', { type: 'application/pdf' }))
    expect(screen.getByRole('status')).toHaveTextContent('«договор.pdf»: подходят PNG, JPEG, WebP и GIF')
    expect(uploads).toHaveLength(0)
  })

  it('картинку больше 10 МБ отклоняет до загрузки', async () => {
    mockMedia(() => Response.json({}))
    const { container } = editor()
    const big = image('огромная.png')
    Object.defineProperty(big, 'size', { value: 10 * 1024 * 1024 + 1 })
    await userEvent.upload(fileInput(container), big)
    expect(screen.getByRole('status')).toHaveTextContent('«огромная.png» больше 10 МБ - уменьшите картинку')
    expect(uploads).toHaveLength(0)
  })

  it('отказ сервера показывает причину, текст гайда не меняется', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockMedia(() => new Response(null, { status: 413 }))
    state.initial = 'Текст'
    const { container } = editor()
    await userEvent.upload(fileInput(container), image('shot.png'))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Не удалось загрузить «shot.png»: POST /api/media → 413'))
    expect(textbox()).toHaveValue('Текст')
    expect(screen.getByRole('button', { name: 'Картинка - загрузить в медиатеку' })).toBeEnabled()
    expect(console.error).toHaveBeenCalledWith('Не удалось загрузить картинку гайда', expect.any(Error))
  })

  it('ответ без адреса картинки считается ошибкой, а не вставляет пустую ссылку', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockMedia(() => Response.json({ doc: { url: null } }))
    const { container } = editor()
    await userEvent.upload(fileInput(container), image('shot.png'))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Не удалось загрузить «shot.png»: сервер не вернул адрес картинки'))
    expect(textbox()).toHaveValue('')
  })

  it('отказ сети без объекта ошибки описывается как неизвестная ошибка', async () => {
    vi.spyOn(console, 'error').mockImplementation(() => {})
    mockMedia(() => Promise.reject('offline'))
    const { container } = editor()
    await userEvent.upload(fileInput(container), image('shot.png'))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Не удалось загрузить «shot.png»: неизвестная ошибка'))
  })

  it('закрытый без выбора диалог ничего не загружает', () => {
    mockMedia(() => Response.json({}))
    const { container } = editor()
    fireEvent.change(fileInput(container), { target: { files: [] } })
    expect(uploads).toHaveLength(0)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
