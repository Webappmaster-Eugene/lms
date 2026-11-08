import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const highlighter = {
  getLoadedLanguages: () => ['typescript'],
  codeToHtml: (code: string) => `<pre class="shiki"><code>подсвечено: ${code}</code></pre>`,
}
vi.mock('@/lib/markdown-highlighter', () => ({
  markdownLanguage: (language: string) => (language === 'ts' ? 'typescript' : language),
  getMarkdownHighlighter: vi.fn(async () => highlighter),
}))
vi.mock('next/link', async () => (await import('../helpers/component-mocks')).linkMock())

const { MessageComposer } = await import('@/components/questions/MessageComposer')
const { MessageContent } = await import('@/components/questions/MessageContent')
const { VIDEO_SEEK_EVENT } = await import('@/lib/video-memory')

const SEND = [{ id: 'send', label: 'Отправить', ariaLabel: 'Отправить вопрос' }]

function setup(props: Partial<Parameters<typeof MessageComposer>[0]> = {}) {
  const onSubmit = vi.fn(async () => true)
  render(<MessageComposer label="Вопрос к уроку" actions={SEND} onSubmit={onSubmit} draftKey="7:lesson:1" {...props} />)
  return { onSubmit, field: () => screen.getByRole('textbox', { name: 'Вопрос к уроку' }) }
}

beforeEach(() => localStorage.clear())
afterEach(() => {
  vi.restoreAllMocks()
  document.body.innerHTML = ''
})

/** Поле переписки ученика и ментора: отправка, код, время видео, просмотр, черновик. */
describe('поле сообщения', () => {
  it('Ctrl+Enter отправляет обрезанный текст, Enter переносит строку', async () => {
    const user = userEvent.setup()
    const { onSubmit, field } = setup()

    await user.type(field(), '  Первая{Enter}вторая  ')
    expect(onSubmit).not.toHaveBeenCalled()
    await user.keyboard('{Control>}{Enter}{/Control}')

    await waitFor(() => expect(onSubmit).toHaveBeenCalledWith('Первая\nвторая', 'send'))
    await waitFor(() => expect(field()).toHaveValue(''))
  })

  it('черновик переживает перерисовку страницы и стирается после отправки', async () => {
    const user = userEvent.setup()
    const first = setup()
    await user.type(first.field(), 'Недописанный вопрос')
    document.body.innerHTML = ''

    const second = setup()
    expect(second.field()).toHaveValue('Недописанный вопрос')
    await user.click(screen.getByRole('button', { name: 'Отправить вопрос' }))
    await waitFor(() => expect(second.field()).toHaveValue(''))
    expect(localStorage.getItem('lms:message-drafts')).toBe('{}')
  })

  it('отказ отправки оставляет текст и черновик', async () => {
    const user = userEvent.setup()
    const { onSubmit, field } = setup()
    onSubmit.mockResolvedValueOnce(false)

    await user.type(field(), 'Важный вопрос')
    await user.click(screen.getByRole('button', { name: 'Отправить вопрос' }))

    await waitFor(() => expect(onSubmit).toHaveBeenCalled())
    expect(field()).toHaveValue('Важный вопрос')
    expect(localStorage.getItem('lms:message-drafts')).toContain('Важный вопрос')
  })

  it('«Код» оборачивает выделенную строку и вставляет пустой блок без выделения', () => {
    const { field } = setup()
    const area = () => field() as HTMLTextAreaElement
    // Выделение задаётся напрямую: имитация ввода под нагрузкой двигает курсор асинхронно.
    fireEvent.change(area(), { target: { value: 'вызов fetch падает' } })
    area().setSelectionRange(6, 11)
    fireEvent.click(screen.getByRole('button', { name: 'Код' }))
    expect(area()).toHaveValue('вызов `fetch` падает')

    area().setSelectionRange(20, 20)
    fireEvent.click(screen.getByRole('button', { name: 'Код' }))
    expect(area()).toHaveValue('вызов `fetch` падает\n```\n\n```\n')
  })

  it('«Время видео» есть только при видео на странице и вставляет текущий момент', () => {
    setup({ videoTime: true })
    expect(screen.queryByRole('button', { name: 'Время видео' })).not.toBeInTheDocument()
    document.body.innerHTML = ''

    const video = document.createElement('video')
    Object.defineProperty(video, 'currentTime', { value: 754.4 })
    document.body.append(video)
    const { field } = setup({ videoTime: true, draftKey: undefined })
    fireEvent.change(field(), { target: { value: 'Не понял' } })
    ;(field() as HTMLTextAreaElement).setSelectionRange(8, 8)
    fireEvent.click(screen.getByRole('button', { name: 'Время видео' }))

    expect(field()).toHaveValue('Не понял[12:34] ')
  })

  it('«Просмотр» показывает разметку, «Писать» возвращает поле с текстом', async () => {
    const user = userEvent.setup()
    const { field } = setup()

    await user.type(field(), 'Это **важно**')
    await user.click(screen.getByRole('button', { name: 'Просмотр' }))
    expect(screen.getByRole('region', { name: 'Просмотр сообщения' }).querySelector('strong')).toHaveTextContent('важно')
    expect(screen.queryByRole('textbox')).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Писать' }))
    expect(field()).toHaveValue('Это **важно**')
  })

  it('подсказка о хорошем вопросе свёрнута и раскрывается', async () => {
    const user = userEvent.setup()
    setup({ guide: true })
    const toggle = screen.getByRole('button', { name: /Как спросить/ })

    expect(toggle).toHaveAttribute('aria-expanded', 'false')
    await user.click(toggle)
    expect(toggle).toHaveAttribute('aria-expanded', 'true')
    expect(screen.getByText(/Ошибку вставьте целиком/)).toBeInTheDocument()
  })

  it('до гидратации поле и отправка закрыты', () => {
    setup({ disabled: true })

    expect(screen.getByRole('textbox', { name: 'Вопрос к уроку' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Отправить вопрос' })).toBeDisabled()
  })

  it('счётчик знаков появляется у предела', () => {
    const { field } = setup()
    expect(screen.queryByText(/\/5000/)).not.toBeInTheDocument()

    fireEvent.change(field(), { target: { value: 'а'.repeat(4100) } })
    expect(screen.getByText('4100/5000')).toBeInTheDocument()
  })

  it('Escape отменяет правку, если отмена предусмотрена', async () => {
    const user = userEvent.setup()
    const onCancel = vi.fn()
    const { field } = setup({ onCancel, initialValue: 'Было', draftKey: undefined })

    expect(field()).toHaveValue('Было')
    await user.type(field(), '{Escape}')
    expect(onCancel).toHaveBeenCalled()
  })
})

/** Текст сообщения пишет ученик: Markdown без исполнения HTML, код подсвечен, время видео кликабельно. */
describe('текст сообщения', () => {
  it('не исполняет HTML ученика и не грузит чужие картинки', () => {
    const { container } = render(<MessageContent content={'<img src="x" onerror="alert(1)">\n\n<script>alert(2)</script>\n\n![трекер](https://evil.example/p.png)'} />)

    expect(container.querySelector('img')).toBeNull()
    expect(container.querySelector('script')).toBeNull()
    expect(container).toHaveTextContent('<img src="x" onerror="alert(1)">')
    expect(screen.getByRole('link', { name: 'трекер' })).toHaveAttribute('rel', 'noopener noreferrer nofollow ugc')
  })

  it('ссылка открывается в новой вкладке без передачи веса, javascript: вырезается', () => {
    render(<MessageContent content={'[док](https://nodejs.org/docs) и [клик](javascript:alert(1))'} />)

    const docs = screen.getByRole('link', { name: 'док' })
    expect(docs).toHaveAttribute('target', '_blank')
    expect(docs).toHaveAttribute('rel', 'noopener noreferrer nofollow ugc')
    expect(screen.getByText('клик').getAttribute('href') ?? '').not.toContain('javascript')
  })

  it('блок кода подсвечен и копируется, переносы строк текста сохранены', async () => {
    const { container } = render(<MessageContent content={'Первая строка\nвторая\n\n```ts\nconst x = 1\n```'} />)

    await waitFor(() => expect(container.querySelector('.shiki')).toHaveTextContent('подсвечено: const x = 1'))
    expect(screen.getByRole('button', { name: 'Копировать код' })).toBeInTheDocument()
    expect(container.querySelector('p')?.textContent).toBe('Первая строка\nвторая')
  })

  it('заголовок не превращается в крупный заголовок страницы', () => {
    render(<MessageContent content={'# Ошибка'} />)

    expect(screen.queryByRole('heading')).not.toBeInTheDocument()
    expect(screen.getByText('Ошибка')).toHaveClass('font-semibold')
  })

  it('на странице урока таймкод перематывает видео', async () => {
    const seek = vi.fn()
    window.addEventListener(VIDEO_SEEK_EVENT, seek)
    render(<MessageContent content={'Непонятно на [12:34], а `10:30` - это код'} timestamps={{ kind: 'seek' }} />)

    await userEvent.click(screen.getByRole('button', { name: 'Перейти к 12:34 в видео' }))
    expect((seek.mock.calls[0][0] as CustomEvent).detail).toEqual({ seconds: 754 })
    expect(screen.getAllByRole('button')).toHaveLength(1)
    window.removeEventListener(VIDEO_SEEK_EVENT, seek)
  })

  it('в списке вопросов таймкод ведёт на урок с этой секундой, без урока - просто текст', () => {
    const { unmount } = render(<MessageContent content="Смотрю 1:05" timestamps={{ kind: 'link', lessonSlug: 'hooks' }} />)
    expect(screen.getByRole('link', { name: '1:05' })).toHaveAttribute('href', '/lessons/hooks?t=65')
    unmount()

    render(<MessageContent content="Смотрю 1:05" />)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(screen.getByText('Смотрю 1:05')).toBeInTheDocument()
  })
})
