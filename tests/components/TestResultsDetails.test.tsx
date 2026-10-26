import { describe, expect, it, vi } from 'vitest'
import { render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { TestResultsPanel } from '@/components/trainer/TestResultsPanel'
import type { TrainerDiagnostic, TrainerRunResult, TrainerTestOutcome } from '@/lib/trainer/types'

/**
 * Подробности отчёта о прогоне: по ним ученик чинит решение, поэтому упавший
 * тест сразу раскрыт, а номер строки ведёт в редактор.
 */

function result(overrides: Partial<TrainerRunResult> = {}): TrainerRunResult {
  return { status: 'failed', tests: [], passedCount: 0, totalCount: 1, consoleOutput: [], totalMs: 7, ...overrides }
}

const failedTest: TrainerTestOutcome = {
  name: 'складывает отрицательные',
  hidden: false,
  passed: false,
  durationMs: 1,
  input: 'sum(-1, -2)',
  expected: '-3',
  actual: '3',
  message: 'Значения не совпали',
  line: 3,
}

function diagnostic(index: number, overrides: Partial<TrainerDiagnostic> = {}): TrainerDiagnostic {
  return { line: index + 1, column: 2, message: `Ошибка типов ${index + 1}`, code: 2300 + index, category: 'error', inHarness: false, ...overrides }
}

const row = (name: RegExp) => screen.getByRole('button', { name })

describe('упавший тест в отчёте', () => {
  it('раскрыт сразу: видны вызов, ожидание и фактическое значение', () => {
    render(<TestResultsPanel result={result({ tests: [failedTest] })} isRunning={false} origin="client" />)

    expect(screen.getByText('Значения не совпали')).toBeInTheDocument()
    expect(screen.getByText('Вызов').nextElementSibling).toHaveTextContent('sum(-1, -2)')
    expect(screen.getByText('Ожидалось').nextElementSibling).toHaveTextContent('-3')
    expect(screen.getByText('Получено').nextElementSibling).toHaveTextContent('3')
  })

  it('сворачивается и разворачивается по клику на строку теста', async () => {
    const user = userEvent.setup()
    render(<TestResultsPanel result={result({ tests: [failedTest] })} isRunning={false} origin="client" />)

    await user.click(row(/складывает отрицательные/))
    expect(screen.queryByText('Значения не совпали')).not.toBeInTheDocument()
    await user.click(row(/складывает отрицательные/))
    expect(screen.getByText('Значения не совпали')).toBeInTheDocument()
  })

  it('имя исключения стоит перед сообщением — так понятнее, что упало', () => {
    render(<TestResultsPanel result={result({ tests: [{ ...failedTest, errorName: 'TypeError', message: 'a.map is not a function', expected: undefined, actual: undefined }] })} isRunning={false} origin="client" />)

    expect(screen.getByText('TypeError: a.map is not a function')).toBeInTheDocument()
    expect(screen.queryByText('Ожидалось')).not.toBeInTheDocument()
  })

  it('ссылка на строку из теста передаёт номер строки наружу', async () => {
    const onSelectLine = vi.fn()
    render(<TestResultsPanel result={result({ tests: [failedTest] })} isRunning={false} origin="client" onSelectLine={onSelectLine} />)

    await userEvent.click(screen.getByRole('button', { name: 'Строка 3 в решении' }))

    expect(onSelectLine).toHaveBeenCalledWith(3)
  })

  it('пройденный тест не раскрывается и не притворяется кнопкой с подробностями', () => {
    render(<TestResultsPanel result={result({ status: 'passed', passedCount: 1, tests: [{ name: 'простой случай', hidden: false, passed: true, durationMs: 1 }] })} isRunning={false} origin="client" />)

    expect(row(/простой случай/)).toBeDisabled()
    expect(screen.queryByText('Вызов')).not.toBeInTheDocument()
  })

  it('скрытый тест помечен и не раскрывает ни вход, ни ожидание', () => {
    render(<TestResultsPanel result={result({ tests: [{ name: 'граничный случай', hidden: true, passed: false, durationMs: 1, message: 'Неверный ответ' }] })} isRunning={false} origin="server" />)

    expect(within(row(/граничный случай/)).getByText('скрытый')).toBeInTheDocument()
    expect(screen.getByText('Неверный ответ')).toBeInTheDocument()
    expect(screen.queryByText('Вызов')).not.toBeInTheDocument()
    expect(screen.queryByText('Ожидалось')).not.toBeInTheDocument()
  })

  it('кнопка теста объявляет, раскрыт ли он', async () => {
    const user = userEvent.setup()
    render(<TestResultsPanel result={result({ tests: [failedTest] })} isRunning={false} origin="client" />)

    expect(row(/складывает отрицательные/)).toHaveAttribute('aria-expanded', 'true')
    await user.click(row(/складывает отрицательные/))
    expect(row(/складывает отрицательные/)).toHaveAttribute('aria-expanded', 'false')
  })
})

describe('ошибка прогона и диагностика', () => {
  it('ссылка на строку из общей ошибки ведёт к этой строке', async () => {
    const onSelectLine = vi.fn()
    render(<TestResultsPanel result={result({ status: 'error', error: 'ReferenceError: total is not defined', errorLine: 7 })} isRunning={false} origin="client" onSelectLine={onSelectLine} />)

    expect(screen.getByText('ReferenceError: total is not defined')).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Строка 7 в решении' }))

    expect(onSelectLine).toHaveBeenCalledWith(7)
  })

  it('ошибка без строки не предлагает перейти к ней', () => {
    render(<TestResultsPanel result={result({ status: 'timeout', error: 'Решение не уложилось в 2000 мс' })} isRunning={false} origin="server" />)

    expect(screen.getByText('Превышен лимит времени')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Строка/ })).not.toBeInTheDocument()
  })

  it('диагностика TypeScript показывает позицию и код, но не больше десяти строк', () => {
    const diagnostics = Array.from({ length: 12 }, (_, index) => diagnostic(index))
    diagnostics[1] = diagnostic(1, { inHarness: true })
    render(<TestResultsPanel result={result({ status: 'compile_error', totalCount: 0, error: 'Ошибка типов 1', diagnostics })} isRunning={false} origin="client" />)

    expect(screen.getByText('1:2')).toBeInTheDocument()
    expect(screen.getByText('TS2300: Ошибка типов 1')).toBeInTheDocument()
    expect(screen.getByText('проверка типов')).toBeInTheDocument()
    expect(screen.getByText('TS2309: Ошибка типов 10')).toBeInTheDocument()
    expect(screen.queryByText('TS2310: Ошибка типов 11')).not.toBeInTheDocument()
  })

  it('во время нового прогона старый вердикт не показывается', () => {
    render(<TestResultsPanel result={result({ status: 'passed' })} isRunning origin="client" />)

    expect(screen.getByText('Выполняется…')).toBeInTheDocument()
    expect(screen.queryByText('Все тесты пройдены')).not.toBeInTheDocument()
  })
})

describe('вкладки отчёта', () => {
  it('без вывода консоль так и говорит, а вкладка тестов возвращает список', async () => {
    const user = userEvent.setup()
    render(<TestResultsPanel result={result({ tests: [failedTest] })} isRunning={false} origin="client" />)

    await user.click(screen.getByRole('button', { name: 'Консоль' }))
    expect(screen.getByText('Вывода не было')).toBeInTheDocument()
    expect(screen.queryByText(/складывает отрицательные/)).not.toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Тесты (1)' }))
    expect(screen.getByText(/складывает отрицательные/)).toBeInTheDocument()
  })

  it('выбранная вкладка отчёта объявлена скринридеру', async () => {
    const user = userEvent.setup()
    // Роль кнопки или вкладки — на выбор исправления, проверяется только объявленное состояние.
    const tab = (label: string) => screen.getByText(label).closest('button') as HTMLButtonElement
    const isActive = (element: HTMLElement) => element.getAttribute('aria-pressed') === 'true' || element.getAttribute('aria-selected') === 'true'
    render(<TestResultsPanel result={result({ tests: [failedTest], consoleOutput: ['отладка'] })} isRunning={false} origin="client" />)

    expect(isActive(tab('Тесты (1)'))).toBe(true)
    await user.click(tab('Консоль (1)'))
    expect(isActive(tab('Консоль (1)'))).toBe(true)
    expect(isActive(tab('Тесты (1)'))).toBe(false)
  })
})
