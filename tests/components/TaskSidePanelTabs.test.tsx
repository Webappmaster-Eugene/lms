import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { ComponentProps } from 'react'

// Подсветка грузится лениво и в отчёт не влияет: код остаётся обычным блоком.
vi.mock('@/lib/markdown-highlighter', () => ({
  markdownLanguage: (language: string) => language,
  getMarkdownHighlighter: () => new Promise(() => {}),
}))

const { TaskSidePanel } = await import('@/components/trainer/TaskSidePanel')

/**
 * Левая колонка задачи. Ученик должен понять, как задача проверяется, увидеть
 * только публичные примеры и получить разбор лишь по запросу — с понятным
 * текстом на каждый отказ.
 */

type PanelProps = ComponentProps<typeof TaskSidePanel>

const base: PanelProps = {
  taskId: 'sum-task',
  descriptionMd: 'Сложите **два** числа.',
  hints: [],
  publicCases: [],
  hiddenCaseCount: 0,
  testCode: '',
  entryName: 'sum',
  languages: ['js'],
  checkMode: 'unit',
}

function renderPanel(overrides: Partial<PanelProps> = {}) {
  return render(<TaskSidePanel {...base} {...overrides} />)
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

const solutionResponse = (overrides: Record<string, unknown> = {}) =>
  Response.json({ solutionCode: 'function sum(a, b) { return a + b }', solutionCodeTs: null, solutionNotes: null, ...overrides })

beforeEach(() => {
  vi.stubGlobal('fetch', vi.fn(async () => solutionResponse()))
})

afterEach(() => vi.unstubAllGlobals())

async function openTab(name: string) {
  await userEvent.click(screen.getByRole('button', { name }))
}

describe('вкладки панели задачи', () => {
  it('активная вкладка помечена для скринридера', async () => {
    renderPanel({ hints: [{ hint: 'Подумайте о сумме' }] })

    expect(screen.getByRole('button', { name: 'Условие' })).toHaveAttribute('aria-pressed', 'true')
    await openTab('Тесты')
    expect(screen.getByRole('button', { name: 'Тесты' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'Условие' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('пустое условие не выглядит как сломанная страница', () => {
    renderPanel({ descriptionMd: '   ' })

    expect(screen.getByText('Условие задачи пока не заполнено.')).toBeInTheDocument()
  })
})

describe('вкладка «Тесты»', () => {
  it('для задачи на функцию показывает только публичные примеры и проверочный код', async () => {
    renderPanel({
      publicCases: [
        { name: 'Положительные', argsCode: '1, 2', expectedCode: '3', compare: 'deep', hidden: false },
        { name: 'Скрытый кейс', argsCode: '99, 1', expectedCode: '100', compare: 'deep', hidden: true },
      ],
      testCode: 'test("ноль", () => expect(sum(0, 0)).toBe(0))',
      hiddenCaseCount: 1,
    })
    await openTab('Тесты')

    expect(screen.getByText('sum(1, 2) → 3')).toBeInTheDocument()
    expect(screen.queryByText(/99, 1/)).not.toBeInTheDocument()
    expect(screen.queryByText('Скрытый кейс')).not.toBeInTheDocument()
    expect(screen.getByRole('heading', { name: 'Что проверяется' })).toBeInTheDocument()
    expect(screen.getByText('test("ноль", () => expect(sum(0, 0)).toBe(0))')).toBeInTheDocument()
    expect(screen.getByText(/Плюс 1 скрыт/)).toBeInTheDocument()
  })

  it('задача на типы объясняет, что решение проверяет компилятор', async () => {
    renderPanel({ checkMode: 'types' })
    await openTab('Тесты')

    expect(screen.getByText(/проверяется компилятором TypeScript/)).toBeInTheDocument()
  })

  it('задача на вывод объясняет разницу «Запустить» и «Отправить»', async () => {
    renderPanel({ checkMode: 'stdout' })
    await openTab('Тесты')

    expect(screen.getByText(/сверяется с эталонным выводом/)).toBeInTheDocument()
  })

  it('программа показывает публичные stdin и stdout, пустую строку называет словами, скрытые — только числом', async () => {
    renderPanel({
      checkMode: 'program',
      languages: ['go'],
      runtimeCases: [
        { name: 'Два числа', hidden: false, input: '2 3', expected: '5' },
        { name: 'Пустой ввод', hidden: false, input: '', expected: '0' },
        { name: 'Секретный', hidden: true, input: 'секретный ввод', expected: 'секретный вывод' },
      ],
      hiddenCaseCount: 1,
    })
    await openTab('Тесты')

    expect(screen.getByText(/читает входные данные из stdin/)).toBeInTheDocument()
    const first = screen.getByRole('heading', { name: 'Два числа' }).closest('li') as HTMLElement
    expect(within(first).getByText('2 3')).toBeInTheDocument()
    expect(within(first).getByText('5')).toBeInTheDocument()
    const empty = screen.getByRole('heading', { name: 'Пустой ввод' }).closest('li') as HTMLElement
    expect(within(empty).getByText('Пустая строка')).toBeInTheDocument()
    expect(screen.queryByText(/секретный/)).not.toBeInTheDocument()
    expect(screen.getByText(/не показываются/)).toBeInTheDocument()
  })

  it('проверки в браузере расписаны по шагам: действие, ожидание, стиль и атрибут', async () => {
    renderPanel({
      checkMode: 'dom',
      languages: ['react'],
      runtimeCases: [{
        name: 'Форма приветствия',
        hidden: false,
        checks: [
          { selector: 'input', action: 'fill', value: 'Аня' },
          { selector: 'input', action: 'press', value: 'Enter' },
          { selector: 'button', action: 'click' },
          { selector: 'h1', text: 'Привет, Аня', count: 1, visible: true },
          { selector: '.toast', visible: false },
          { selector: '.box', css: { color: 'rgb(255, 0, 0)' } },
          { selector: 'a', attribute: { name: 'href', value: '/home' } },
        ],
      }],
    })
    await openTab('Тесты')

    const example = screen.getByRole('heading', { name: 'Форма приветствия' }).closest('li') as HTMLElement
    const steps = within(within(example).getByRole('list')).getAllByRole('listitem')
    expect(steps).toHaveLength(7)
    expect(steps[0]).toHaveTextContent('Элемент: input')
    expect(steps[0]).toHaveTextContent('Действие: ввести "Аня".')
    expect(steps[1]).toHaveTextContent('Действие: нажать клавишу Enter на элементе.')
    expect(steps[2]).toHaveTextContent('Действие: нажать на элемент.')
    expect(steps[3]).toHaveTextContent('Ожидаемый текст: "Привет, Аня".')
    expect(steps[3]).toHaveTextContent('Ожидаемое число элементов: 1.')
    expect(steps[3]).toHaveTextContent('Элемент должен быть видимым.')
    expect(steps[4]).toHaveTextContent('Элемент должен быть невидимым.')
    expect(steps[5]).toHaveTextContent('Ожидаемые CSS-свойства')
    expect(steps[5]).toHaveTextContent('"color": "rgb(255, 0, 0)"')
    expect(steps[6]).toHaveTextContent('Атрибут href: "/home".')
  })

  it('без публичных примеров так и говорит, а не показывает пустой список', async () => {
    renderPanel({ checkMode: 'dom', languages: ['html'], runtimeCases: [] })
    await openTab('Тесты')

    expect(screen.getByText('Публичные примеры для этой задачи пока не добавлены.')).toBeInTheDocument()
  })

  it('два скрытых теста согласованы с числом', async () => {
    renderPanel({ hiddenCaseCount: 2 })
    await openTab('Тесты')

    expect(screen.getByText(/Плюс 2 скрытых теста —/)).toBeInTheDocument()
  })

  it('один скрытый тест программы согласован с числом', async () => {
    renderPanel({ checkMode: 'program', languages: ['python'], runtimeCases: [], hiddenCaseCount: 1 })
    await openTab('Тесты')

    expect(screen.getByText(/Плюс 1 скрытый тест —/)).toBeInTheDocument()
  })
})

describe('вкладка «Разбор»', () => {
  it('пока разбор грузится, это видно, а повторные клики не шлют второй запрос', async () => {
    const answer = deferred<Response>()
    vi.stubGlobal('fetch', vi.fn(() => answer.promise))
    renderPanel()

    await openTab('Разбор')
    expect(screen.getByText('Загружаем разбор…')).toBeInTheDocument()
    await openTab('Разбор')
    await openTab('Разбор')
    expect(fetch).toHaveBeenCalledOnce()
    expect(fetch).toHaveBeenCalledWith('/api/trainer/solution?taskId=sum-task', { credentials: 'include' })

    answer.resolve(solutionResponse())
    expect(await screen.findByText('function sum(a, b) { return a + b }')).toBeInTheDocument()
  })

  it('после отказа «Проверить ещё раз» загружает разбор, когда он стал доступен', async () => {
    vi.mocked(fetch)
      .mockResolvedValueOnce(Response.json({ error: 'Сначала решите задачу' }, { status: 403 }))
      .mockResolvedValueOnce(solutionResponse({ solutionNotes: 'Сложение коммутативно.' }))
    renderPanel()

    await openTab('Разбор')
    expect(await screen.findByText('Сначала решите задачу')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Проверить ещё раз' }))

    expect(await screen.findByText('Сложение коммутативно.')).toBeInTheDocument()
    expect(screen.queryByText('Сначала решите задачу')).not.toBeInTheDocument()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('переключает эталон между JavaScript и TypeScript', async () => {
    vi.mocked(fetch).mockResolvedValue(solutionResponse({ solutionCodeTs: 'function sum(a: number, b: number): number { return a + b }' }))
    renderPanel({ languages: ['js', 'ts'] })
    await openTab('Разбор')

    expect(await screen.findByText('function sum(a, b) { return a + b }')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'JavaScript' })).toHaveAttribute('aria-pressed', 'true')
    await userEvent.click(screen.getByRole('button', { name: 'TypeScript' }))

    expect(screen.getByText('function sum(a: number, b: number): number { return a + b }')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'TypeScript' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('без отдельного эталона на TypeScript показывает JavaScript, а не пустоту', async () => {
    renderPanel({ languages: ['ts', 'js'] })
    await openTab('Разбор')

    expect(await screen.findByText('function sum(a, b) { return a + b }')).toBeInTheDocument()
  })

  it('Go и Python показывают свои эталоны, а отсутствующий назван словами', async () => {
    vi.mocked(fetch).mockResolvedValue(solutionResponse({ solutionCode: null, solutionCodeGo: 'package main\nfunc main() {}', solutionCodePython: null }))
    renderPanel({ languages: ['go', 'python'], checkMode: 'program' })
    await openTab('Разбор')

    const code = await screen.findByText(/package main/)
    expect(code.closest('code')).toHaveClass('language-go')
    await userEvent.click(screen.getByRole('button', { name: 'Python' }))
    expect(screen.getByText('Эталонное решение для этого языка не задано.')).toBeInTheDocument()
  })

  it('эталон Python подписан своим языком', async () => {
    vi.mocked(fetch).mockResolvedValue(solutionResponse({ solutionCode: null, solutionCodePython: 'print(sum(map(int, input().split())))' }))
    renderPanel({ languages: ['python'], checkMode: 'program' })
    await openTab('Разбор')

    expect((await screen.findByText('print(sum(map(int, input().split())))')).closest('code')).toHaveClass('language-python')
  })

  it('frontend-проект показывает эталон по файлам с подписью имени', async () => {
    vi.mocked(fetch).mockResolvedValue(solutionResponse({
      solutionCode: null,
      solutionFiles: { 'App.tsx': 'export default function App() { return <h1>Привет</h1> }', 'styles.css': 'h1 { color: red }', 'main.js': 'render(App)', 'utils.ts': 'export const id = (x: number) => x', 'README': 'Без расширения' },
    }))
    renderPanel({ languages: ['react'], checkMode: 'dom' })
    await openTab('Разбор')

    const app = (await screen.findByRole('heading', { name: 'App.tsx' })).closest('section') as HTMLElement
    expect(within(app).getByText(/<h1>Привет<\/h1>/).closest('code')).toHaveClass('language-tsx')
    const styles = screen.getByRole('heading', { name: 'styles.css' }).closest('section') as HTMLElement
    expect(within(styles).getByText('h1 { color: red }').closest('code')).toHaveClass('language-css')
    expect(screen.getByText('render(App)').closest('code')).toHaveClass('language-javascript')
    expect(screen.getByText('export const id = (x: number) => x').closest('code')).toHaveClass('language-typescript')
    expect(screen.getByRole('heading', { name: 'README' })).toBeInTheDocument()
    expect(screen.getByText('Без расширения')).toBeInTheDocument()
  })

  it('тильды внутри эталона не обрывают блок кода', async () => {
    const tricky = 'const fence = "~~~"\nconst longer = "~~~~~"\nreturn fence + longer'
    vi.mocked(fetch).mockResolvedValue(solutionResponse({ solutionCode: tricky }))
    renderPanel()
    await openTab('Разбор')

    await waitFor(() => expect(document.querySelector('code.language-javascript')).not.toBeNull())
    expect(document.querySelectorAll('pre code')).toHaveLength(1)
    expect(document.querySelector('code.language-javascript')?.textContent).toBe(`${tricky}\n`)
  })
})
