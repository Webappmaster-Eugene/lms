import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const push = vi.fn()
const searchParams = { current: new URLSearchParams() }

vi.mock('next/navigation', () => ({
  useRouter: () => ({ push, replace: push }),
  usePathname: () => '/trainer/tasks',
  useSearchParams: () => searchParams.current,
}))
vi.mock('@monaco-editor/react', async () => (await import('../helpers/component-mocks')).monacoMock())

const { TestResultsPanel } = await import('@/components/trainer/TestResultsPanel')
const { TaskFilters } = await import('@/components/trainer/TaskFilters')
const { CodeEditor } = await import('@/components/trainer/CodeEditor')

import type { TrainerRunResult } from '@/lib/trainer/types'

/**
 * Панели тренажёра: отчёт о прогоне, фильтры каталога и редактор кода.
 *
 * Отчёт — то, по чему ученик понимает, что именно не сошлось, поэтому у
 * каждого исхода прогона своя формулировка, а у провалившегося теста видно
 * ожидание и полученное значение.
 */

function result(overrides: Partial<TrainerRunResult> = {}): TrainerRunResult {
  return {
    status: 'passed',
    tests: [],
    passedCount: 0,
    totalCount: 0,
    consoleOutput: [],
    totalMs: 4,
    ...overrides,
  } as TrainerRunResult
}

describe('отчёт о прогоне', () => {
  it('до запуска ничего не утверждает', () => {
    const { container } = render(<TestResultsPanel result={null} isRunning={false} origin={null} />)

    expect(container.textContent).not.toContain('Все тесты пройдены')
  })

  it('во время прогона сообщает об этом', () => {
    render(<TestResultsPanel result={null} isRunning origin={null} />)

    expect(screen.getByText(/Прого|Выполн/i)).toBeInTheDocument()
  })

  it.each([
    ['passed', 'Все тесты пройдены'],
    ['failed', 'Часть тестов не пройдена'],
    ['compile_error', 'Код не компилируется'],
    ['error', 'Ошибка выполнения'],
    ['timeout', 'Превышен лимит времени'],
  ] as const)('исход %s описан словами', (status, text) => {
    render(
      <TestResultsPanel result={result({ status })} isRunning={false} origin="client" />,
    )

    expect(screen.getByText(new RegExp(text))).toBeInTheDocument()
  })

  it('счётчик показывает, сколько тестов прошло', () => {
    render(
      <TestResultsPanel
        result={result({ status: 'failed', passedCount: 2, totalCount: 3 })}
        isRunning={false}
        origin="client"
      />,
    )

    expect(screen.getByText(/2/)).toBeInTheDocument()
    expect(screen.getByText(/3/)).toBeInTheDocument()
  })

  it('названия тестов видны', () => {
    render(
      <TestResultsPanel
        result={result({
          status: 'failed',
          tests: [
            { name: 'счётчик считает с единицы', passed: true },
            { name: 'счётчики независимы', passed: false, message: 'ожидалось 1, получено 2' },
          ] as TrainerRunResult['tests'],
          passedCount: 1,
          totalCount: 2,
        })}
        isRunning={false}
        origin="client"
      />,
    )

    expect(screen.getByText(/счётчик считает с единицы/)).toBeInTheDocument()
    expect(screen.getByText(/счётчики независимы/)).toBeInTheDocument()
  })

  it('причина падения теста показывается — иначе непонятно, что чинить', () => {
    render(
      <TestResultsPanel
        result={result({
          status: 'failed',
          tests: [
            { name: 'тест', passed: false, message: 'ожидалось 1, получено 2' },
          ] as TrainerRunResult['tests'],
          totalCount: 1,
        })}
        isRunning={false}
        origin="client"
      />,
    )

    expect(screen.getByText(/ожидалось 1, получено 2/)).toBeInTheDocument()
  })

  it('вывод в консоль вынесен на отдельную вкладку', async () => {
    const user = userEvent.setup()
    render(
      <TestResultsPanel
        result={result({ consoleOutput: ['привет из кода'] as TrainerRunResult['consoleOutput'] })}
        isRunning={false}
        origin="client"
      />,
    )

    expect(screen.queryByText(/привет из кода/)).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: /Консоль/ }))

    expect(screen.getByText(/привет из кода/)).toBeInTheDocument()
  })

  it('источник прогона подписан — браузер и сервер судят по-разному', () => {
    const { container } = render(
      <TestResultsPanel result={result()} isRunning={false} origin="server" />,
    )

    expect(container.textContent).toMatch(/сервер/i)
  })
})

describe('фильтры каталога задач', () => {
  const values = { q: '', language: '', difficulty: '', tag: '', company: '', topic: '', status: '' }
  const topics = [
    { slug: 'js-core', title: 'Основы JavaScript' },
    { slug: 'react', title: 'React' },
  ]

  beforeEach(() => {
    vi.clearAllMocks()
    searchParams.current = new URLSearchParams()
  })

  it('показывает, сколько задач найдено', () => {
    render(<TaskFilters values={values} topics={topics} total={135} />)

    expect(screen.getByText(/135/)).toBeInTheDocument()
  })

  it('темы из каталога попадают в выбор', () => {
    render(<TaskFilters values={values} topics={topics} total={10} />)

    expect(screen.getByRole('option', { name: 'Основы JavaScript' })).toBeInTheDocument()
  })

  it('выбранное значение отражается в поле', () => {
    render(
      <TaskFilters values={{ ...values, topic: 'react' }} topics={topics} total={10} />,
    )

    const topicSelect = screen.getAllByRole('combobox').find((el) =>
      Array.from(el.querySelectorAll('option')).some((o) => o.value === 'react'),
    )
    expect(topicSelect).toHaveValue('react')
  })

  it('смена фильтра уводит на новый адрес — подборка должна быть ссылкой', async () => {
    const user = userEvent.setup()
    render(<TaskFilters values={values} topics={topics} total={10} />)

    const topicSelect = screen
      .getAllByRole('combobox')
      .find((el) => Array.from(el.querySelectorAll('option')).some((o) => o.value === 'react'))
    expect(topicSelect, 'нет выбора темы').toBeDefined()
    await user.selectOptions(topicSelect as HTMLElement, 'react')

    expect(push).toHaveBeenCalled()
    expect(String(push.mock.calls[0][0])).toContain('topic=react')
  })

  it('статусы решения предлагаются все три', () => {
    render(<TaskFilters values={values} topics={topics} total={10} />)

    for (const label of ['Все', 'Не решённые', 'Решённые']) {
      expect(screen.getByRole('button', { name: label })).toBeInTheDocument()
    }
  })

  it('выбранный статус помечен для скринридера', () => {
    render(<TaskFilters values={{ ...values, status: 'solved' }} topics={topics} total={10} />)

    expect(screen.getByRole('button', { name: 'Решённые' })).toHaveAttribute(
      'aria-pressed',
      'true',
    )
  })

  it('переключение статуса меняет адрес', async () => {
    const user = userEvent.setup()
    render(<TaskFilters values={values} topics={topics} total={10} />)

    await user.click(screen.getByRole('button', { name: 'Решённые' }))

    expect(String(push.mock.calls[0][0])).toContain('status=solved')
  })
})

describe('редактор кода', () => {
  it('показывает текущий код', () => {
    render(
      <CodeEditor value="function solve() {}" onChange={vi.fn()} language="js" />,
    )

    expect(screen.getByTestId('monaco')).toHaveValue('function solve() {}')
  })

  it('правка уходит наружу', async () => {
    const onChange = vi.fn()
    const user = userEvent.setup()
    render(<CodeEditor value="" onChange={onChange} language="js" />)

    await user.type(screen.getByTestId('monaco'), 'x')

    expect(onChange).toHaveBeenCalled()
  })

  it.each([
    ['js', 'javascript'],
    ['ts', 'typescript'],
  ] as const)('язык %s включает свою подсветку', (language, monacoLanguage) => {
    render(<CodeEditor value="" onChange={vi.fn()} language={language} />)

    expect(screen.getByTestId('monaco')).toHaveAttribute('data-language', monacoLanguage)
  })
})
