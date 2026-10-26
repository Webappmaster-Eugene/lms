import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { navigationRouter, setNavigationURL } from '../helpers/url-navigation'
import type { CodeEditorProps } from '@/components/trainer/CodeEditor'
import type { ClientProgress, ClientTaskSpec } from '@/lib/trainer/api'
import type { TrainerDiagnostic, TrainerRunResult } from '@/lib/trainer/types'

const toast = vi.hoisted(() => vi.fn())
const run = vi.hoisted(() => vi.fn())

vi.mock('next/navigation', async () => (await import('../helpers/url-navigation')).urlNavigationMock())
vi.mock('next/link', async () => (await import('../helpers/component-mocks')).linkMock())
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ toast }) }))
vi.mock('@/components/trainer/useCodeRunner', () => ({ useCodeRunner: () => ({ run, cancel: vi.fn() }) }))
// Monaco в jsdom не работает: редактор заменён полем, а строка фокуса и диагностика
// выведены текстом. Кнопки сочетаний вызывают обработчики в обход readOnly —
// так проверяется защита самой рабочей области, а не только редактора.
vi.mock('@/components/trainer/CodeEditor', () => ({
  CodeEditor: ({ value, onChange, readOnly, errorLine, diagnostics = [], onRun, onSubmit }: CodeEditorProps) => (
    <div>
      <textarea aria-label="Код решения" value={value} readOnly={readOnly} onChange={(event) => onChange(event.target.value)} />
      <output aria-label="Строка в редакторе">{errorLine ?? 'нет'}</output>
      <output aria-label="Подчёркнуто в редакторе">{diagnostics.map((item) => `${item.line}:${item.category}`).join(' ')}</output>
      <button type="button" onClick={onRun}>Сочетание запуска</button>
      <button type="button" onClick={onSubmit}>Сочетание отправки</button>
    </div>
  ),
}))
vi.mock('@/components/trainer/FrontendEditor', () => ({
  FrontendEditor: ({ value, previewUrl }: { value: string; previewUrl?: string }) => (
    <div><textarea aria-label="Файлы проекта" value={value} readOnly />{previewUrl && <output aria-label="Адрес предпросмотра">{previewUrl}</output>}</div>
  ),
}))

const { TrainerWorkspace } = await import('@/components/trainer/TrainerWorkspace')

/**
 * Рабочая область тренажёра: что видит ученик на каждом исходе прогона и что
 * уходит на сервер. Вердикт и баллы даёт только сервер, поэтому отдельно
 * проверяется, что «Отправить» не переносит туда результат браузера.
 */

const task: ClientTaskSpec = {
  id: 'sum-task',
  slug: 'sum',
  topicSlug: 'js-core',
  title: 'Сумма',
  difficulty: 'easy',
  checkMode: 'unit',
  languages: ['js', 'ts'],
  entryName: 'sum',
  setupCode: '',
  testCode: '',
  publicCases: [{ name: 'Пример', argsCode: '1, 2', expectedCode: '3', compare: 'deep', hidden: false }],
  hiddenCaseCount: 1,
  timeLimitMs: 2000,
  starters: { js: 'function sum(a, b) {}', ts: 'function sum(a: number, b: number): number {}' },
  pointsReward: 10,
}

const progress: ClientProgress = { isCompleted: false, attempts: 0, failedAttempts: 0, savedCode: null, savedLanguage: null }

function outcome(overrides: Partial<TrainerRunResult> = {}): TrainerRunResult {
  return { status: 'passed', tests: [], passedCount: 1, totalCount: 1, consoleOutput: [], totalMs: 3, ...overrides }
}

function diagnostic(overrides: Partial<TrainerDiagnostic> = {}): TrainerDiagnostic {
  return { line: 2, column: 5, message: "Type 'string' is not assignable to type 'number'.", code: 2322, category: 'error', inHarness: false, ...overrides }
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  let reject: (reason: unknown) => void = () => {}
  const promise = new Promise<T>((done, fail) => { resolve = done; reject = fail })
  return { promise, resolve, reject }
}

type Route = (init?: RequestInit) => Response | Promise<Response>

/** Сервер отвечает только на перечисленные адреса — лишний запрос сразу роняет тест. */
function serve(routes: Record<string, Route>) {
  const fetchMock = vi.fn(async (url: RequestInfo | URL, init?: RequestInit) => {
    const address = String(url)
    if (routes[address]) return routes[address](init)
    if (address.startsWith('/api/trainer/preview-release/')) return new Response(null, { status: 204 })
    throw new Error(`Неожиданный запрос ${address}`)
  })
  vi.stubGlobal('fetch', fetchMock)
  return fetchMock
}

function sentBody(fetchMock: ReturnType<typeof serve>, url: string): Record<string, unknown> {
  const call = fetchMock.mock.calls.find(([address]) => String(address) === url)
  return JSON.parse(String(call?.[1]?.body))
}

const editor = () => screen.getByRole('textbox', { name: 'Код решения' })

beforeEach(() => {
  setNavigationURL('/trainer/js-core/sum')
  vi.clearAllMocks()
  window.localStorage.clear()
  vi.spyOn(window.history, 'pushState').mockImplementation((_data, _title, url) => { if (url) navigationRouter().push(String(url)) })
  run.mockResolvedValue(outcome())
  serve({})
})

afterEach(() => {
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('серверная граница «Отправить»', () => {
  it('после зелёного локального прогона на сервер уходит только код, а вердикт берётся из ответа сервера', async () => {
    const user = userEvent.setup()
    run.mockResolvedValue(outcome({ tests: [{ name: 'Пример', hidden: false, passed: true, durationMs: 1 }] }))
    const fetchMock = serve({
      '/api/trainer/submit': () => Response.json({
        result: outcome({ status: 'failed', passedCount: 1, totalCount: 3, tests: [{ name: 'Скрытый', hidden: true, passed: false, durationMs: 1 }] }),
        completed: false, awardedPoints: null, attempts: 1,
      }),
    })
    render(<TrainerWorkspace task={task} progress={progress} />)
    fireEvent.change(editor(), { target: { value: 'function sum(a, b) { return a + b }' } })

    await user.click(screen.getByRole('button', { name: 'Запустить' }))
    expect(await screen.findByText('Все тесты пройдены')).toBeInTheDocument()
    expect(screen.getByText(/локальный прогон/)).toBeInTheDocument()
    expect(fetchMock).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Отправить' }))
    expect(await screen.findByText('Часть тестов не пройдена')).toBeInTheDocument()
    expect(sentBody(fetchMock, '/api/trainer/submit')).toEqual({ taskId: 'sum-task', language: 'js', code: 'function sum(a, b) { return a + b }' })
    expect(screen.getByText(/проверено сервером/)).toBeInTheDocument()
    expect(screen.getByText('1 из 3')).toBeInTheDocument()
    expect(screen.queryByText('Решено')).not.toBeInTheDocument()
    expect(toast).not.toHaveBeenCalledWith(expect.anything(), 'success')
    expect(navigationRouter().refresh).not.toHaveBeenCalled()
  })

  it('решение на TypeScript отправляется исходником, а не JavaScript после компиляции', async () => {
    const user = userEvent.setup()
    const source = 'const sum = (a: number, b: number): number => a + b'
    const fetchMock = serve({
      '/api/trainer/compile': () => Response.json({ js: 'const sum = (a, b) => a + b', diagnostics: [] }),
      '/api/trainer/submit': () => Response.json({ result: outcome(), completed: true, awardedPoints: 10, attempts: 1 }),
    })
    setNavigationURL('/trainer/js-core/sum?lang=ts')
    render(<TrainerWorkspace task={task} progress={progress} />)
    fireEvent.change(editor(), { target: { value: source } })

    await user.click(screen.getByRole('button', { name: 'Запустить' }))
    await waitFor(() => expect(run).toHaveBeenCalled())
    await user.click(screen.getByRole('button', { name: 'Отправить' }))

    await screen.findByText('Решено')
    expect(sentBody(fetchMock, '/api/trainer/submit')).toEqual({ taskId: 'sum-task', language: 'ts', code: source })
  })
})

describe('прогон TypeScript', () => {
  beforeEach(() => setNavigationURL('/trainer/js-core/sum?lang=ts'))

  it('компилирует сервер, а песочница исполняет уже JavaScript с публичными тестами', async () => {
    const user = userEvent.setup()
    const fetchMock = serve({ '/api/trainer/compile': () => Response.json({ js: 'function sum(a, b) { return a + b }', diagnostics: [] }) })
    render(<TrainerWorkspace task={task} progress={progress} />)

    await user.click(screen.getByRole('button', { name: 'Запустить' }))

    await screen.findByText('Все тесты пройдены')
    expect(sentBody(fetchMock, '/api/trainer/compile')).toEqual({ taskId: 'sum-task', code: task.starters.ts })
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ language: 'ts', userCode: 'function sum(a, b) { return a + b }', cases: task.publicCases }))
  })

  it('ошибка компиляции показывает место, подчёркивает его в редакторе и не запускает тесты', async () => {
    const user = userEvent.setup()
    serve({ '/api/trainer/compile': () => Response.json({ js: '', diagnostics: [diagnostic()] }) })
    render(<TrainerWorkspace task={task} progress={progress} />)

    await user.click(screen.getByRole('button', { name: 'Запустить' }))

    expect(await screen.findByText('Код не компилируется')).toBeInTheDocument()
    expect(screen.getByText("TS2322: Type 'string' is not assignable to type 'number'.")).toBeInTheDocument()
    expect(screen.getByText('2:5')).toBeInTheDocument()
    expect(screen.getByLabelText('Подчёркнуто в редакторе')).toHaveTextContent('2:error')
    expect(run).not.toHaveBeenCalled()

    await user.click(screen.getByRole('button', { name: 'Строка 2 в решении' }))
    expect(screen.getByLabelText('Строка в редакторе')).toHaveTextContent('2')
  })

  it('ошибка в проверочных типах задачи не отправляет ученика к строке его решения', async () => {
    const user = userEvent.setup()
    serve({ '/api/trainer/compile': () => Response.json({ js: '', diagnostics: [diagnostic({ inHarness: true, line: 40 })] }) })
    render(<TrainerWorkspace task={task} progress={progress} />)

    await user.click(screen.getByRole('button', { name: 'Запустить' }))

    expect(await screen.findByText('Код не компилируется')).toBeInTheDocument()
    expect(screen.getByText('проверка типов')).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Строка \d+ в решении/ })).not.toBeInTheDocument()
  })

  it('предупреждения компилятора подчёркиваются, но прогону не мешают', async () => {
    const user = userEvent.setup()
    serve({ '/api/trainer/compile': () => Response.json({ js: 'function sum() {}', diagnostics: [diagnostic({ category: 'warning', line: 1 })] }) })
    render(<TrainerWorkspace task={task} progress={progress} />)

    await user.click(screen.getByRole('button', { name: 'Запустить' }))

    expect(await screen.findByText('Все тесты пройдены')).toBeInTheDocument()
    expect(run).toHaveBeenCalledOnce()
    expect(screen.getByLabelText('Подчёркнуто в редакторе')).toHaveTextContent('1:warning')
  })

  it('отказ компилятора показан текстом сервера, и кнопки снова доступны', async () => {
    const user = userEvent.setup()
    serve({ '/api/trainer/compile': () => Response.json({ error: 'Слишком много запросов, подождите минуту' }, { status: 429 }) })
    render(<TrainerWorkspace task={task} progress={progress} />)

    await user.click(screen.getByRole('button', { name: 'Запустить' }))

    await waitFor(() => expect(toast).toHaveBeenCalledWith('Слишком много запросов, подождите минуту', 'error'))
    expect(run).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Запустить' })).toBeEnabled()
    expect(screen.getByText('Нажмите «Запустить», чтобы прогнать тесты')).toBeInTheDocument()
  })

  it('отказ компилятора без пояснения заменяется понятным текстом', async () => {
    const user = userEvent.setup()
    serve({ '/api/trainer/compile': () => new Response('Bad Gateway', { status: 502 }) })
    render(<TrainerWorkspace task={task} progress={progress} />)

    await user.click(screen.getByRole('button', { name: 'Запустить' }))

    await waitFor(() => expect(toast).toHaveBeenCalledWith('Не удалось скомпилировать решение', 'error'))
  })
})

describe('режимы проверки задачи', () => {
  it('задача на типы засчитывается в браузере по отсутствию ошибок, ничего не исполняя', async () => {
    const user = userEvent.setup()
    serve({ '/api/trainer/compile': () => Response.json({ js: '', diagnostics: [] }) })
    render(<TrainerWorkspace task={{ ...task, checkMode: 'types', languages: ['ts'] }} progress={progress} />)

    await user.click(screen.getByRole('button', { name: 'Запустить' }))

    expect(await screen.findByText('Все тесты пройдены')).toBeInTheDocument()
    expect(screen.getByText('1. Типы соответствуют условию')).toBeInTheDocument()
    expect(run).not.toHaveBeenCalled()
  })

  it('задача на вывод исполняется локально без эталона — сверяет только сервер', async () => {
    const user = userEvent.setup()
    run.mockResolvedValue(outcome({ consoleOutput: ['15'] }))
    render(<TrainerWorkspace task={{ ...task, checkMode: 'stdout', languages: ['js'], publicCases: [] }} progress={progress} />)

    await user.click(screen.getByRole('button', { name: 'Запустить' }))

    await waitFor(() => expect(run).toHaveBeenCalled())
    expect(run.mock.calls[0][0]).toMatchObject({ cases: [], expectedOutput: undefined })
    await user.click(screen.getByRole('button', { name: 'Консоль (1)' }))
    expect(screen.getByText('15')).toBeInTheDocument()
  })
})

describe('исход локального прогона', () => {
  it('упавший тест показывает вызов, ожидание, факт и ведёт к строке решения', async () => {
    const user = userEvent.setup()
    run.mockResolvedValue(outcome({
      status: 'failed', passedCount: 0, totalCount: 1,
      tests: [{ name: 'складывает', hidden: false, passed: false, durationMs: 1, input: 'sum(2, 2)', expected: '4', actual: '-4', line: 3, message: 'Значения не совпали' }],
    }))
    render(<TrainerWorkspace task={task} progress={progress} />)

    await user.click(screen.getByRole('button', { name: 'Запустить' }))

    expect(await screen.findByText('Часть тестов не пройдена')).toBeInTheDocument()
    expect(screen.getByText('sum(2, 2)')).toBeInTheDocument()
    expect(screen.getByText('-4')).toBeInTheDocument()
    expect(screen.getByLabelText('Строка в редакторе')).toHaveTextContent('нет')
    await user.click(screen.getByRole('button', { name: 'Строка 3 в решении' }))
    expect(screen.getByLabelText('Строка в редакторе')).toHaveTextContent('3')
  })

  it('ошибка выполнения сама подсвечивает строку в редакторе', async () => {
    const user = userEvent.setup()
    run.mockResolvedValue(outcome({ status: 'error', passedCount: 0, error: 'TypeError: a.map is not a function', errorLine: 4 }))
    render(<TrainerWorkspace task={task} progress={progress} />)

    await user.click(screen.getByRole('button', { name: 'Запустить' }))

    expect(await screen.findByText('Ошибка выполнения')).toBeInTheDocument()
    expect(screen.getByText('TypeError: a.map is not a function')).toBeInTheDocument()
    expect(screen.getByLabelText('Строка в редакторе')).toHaveTextContent('4')
  })

  it('зависшее решение названо превышением лимита времени', async () => {
    const user = userEvent.setup()
    run.mockResolvedValue(outcome({ status: 'timeout', passedCount: 0, error: 'Решение не уложилось в 2000 мс' }))
    render(<TrainerWorkspace task={task} progress={progress} />)

    await user.click(screen.getByRole('button', { name: 'Запустить' }))

    expect(await screen.findByText('Превышен лимит времени')).toBeInTheDocument()
    expect(screen.getByText('Решение не уложилось в 2000 мс')).toBeInTheDocument()
  })

  it('сбой песочницы не оставляет вечную загрузку', async () => {
    const user = userEvent.setup()
    run.mockRejectedValue(new Error('Песочница не ответила'))
    render(<TrainerWorkspace task={task} progress={progress} />)

    await user.click(screen.getByRole('button', { name: 'Запустить' }))

    expect(await screen.findByText('Песочница не ответила')).toBeInTheDocument()
    expect(screen.getByText('Ошибка выполнения')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Запустить' })).toBeEnabled()
  })
})

describe('блокировка во время запроса', () => {
  it('пока идёт прогон, второй прогон, отправка, сброс и смена языка недоступны', async () => {
    const user = userEvent.setup()
    const pending = deferred<TrainerRunResult>()
    run.mockReturnValue(pending.promise)
    render(<TrainerWorkspace task={task} progress={progress} />)

    await user.click(screen.getByRole('button', { name: 'Запустить' }))

    expect(screen.getByRole('button', { name: 'Выполняется…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Отправить' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Сбросить' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'TypeScript' })).toBeDisabled()
    expect(editor()).toHaveAttribute('readonly')
    await user.click(screen.getByRole('button', { name: 'Сочетание запуска' }))
    await user.click(screen.getByRole('button', { name: 'Сочетание отправки' }))
    expect(run).toHaveBeenCalledOnce()
    expect(fetch).not.toHaveBeenCalled()

    await act(async () => pending.resolve(outcome()))
    expect(screen.getByRole('button', { name: 'Запустить' })).toBeEnabled()
    expect(editor()).not.toHaveAttribute('readonly')
  })

  it('пока сервер проверяет, повторное нажатие и сочетания клавиш не шлют второй запрос', async () => {
    const user = userEvent.setup()
    const answer = deferred<Response>()
    const fetchMock = serve({ '/api/trainer/submit': () => answer.promise })
    render(<TrainerWorkspace task={task} progress={progress} />)

    await user.click(screen.getByRole('button', { name: 'Отправить' }))

    expect(screen.getByRole('button', { name: 'Проверяем…' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Запустить' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Проверяем…' }))
    await user.click(screen.getByRole('button', { name: 'Сочетание отправки' }))
    await user.click(screen.getByRole('button', { name: 'Сочетание запуска' }))
    expect(fetchMock).toHaveBeenCalledOnce()
    expect(run).not.toHaveBeenCalled()

    await act(async () => answer.resolve(Response.json({ result: outcome(), completed: true, awardedPoints: 10, attempts: 1 })))
    expect(await screen.findByRole('button', { name: 'Отправить' })).toBeEnabled()
  })

  it('пустое решение нельзя ни запустить, ни отправить — даже сочетанием клавиш', async () => {
    const user = userEvent.setup()
    render(<TrainerWorkspace task={task} progress={progress} />)

    fireEvent.change(editor(), { target: { value: '   \n' } })

    expect(screen.getByRole('button', { name: 'Запустить' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Отправить' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Сочетание запуска' }))
    await user.click(screen.getByRole('button', { name: 'Сочетание отправки' }))
    expect(run).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalled()
  })
})

describe('ответ сервера на отправку', () => {
  it('отказ сервера виден и в уведомлении, и в отчёте, а зачёт не появляется', async () => {
    const user = userEvent.setup()
    serve({ '/api/trainer/submit': () => Response.json({ error: 'Слишком много отправок, подождите минуту' }, { status: 429 }) })
    render(<TrainerWorkspace task={task} progress={progress} />)

    await user.click(screen.getByRole('button', { name: 'Отправить' }))

    expect(await screen.findByText('Слишком много отправок, подождите минуту')).toBeInTheDocument()
    expect(toast).toHaveBeenCalledWith('Слишком много отправок, подождите минуту', 'error')
    expect(screen.queryByText('Решено')).not.toBeInTheDocument()
    expect(navigationRouter().refresh).not.toHaveBeenCalled()
  })

  it('отказ без пояснения заменяется понятным текстом', async () => {
    const user = userEvent.setup()
    serve({ '/api/trainer/submit': () => new Response('<html>Bad Gateway</html>', { status: 502 }) })
    render(<TrainerWorkspace task={task} progress={progress} />)

    await user.click(screen.getByRole('button', { name: 'Отправить' }))

    expect(await screen.findByText('Не удалось отправить решение')).toBeInTheDocument()
    expect(toast).toHaveBeenCalledWith('Не удалось отправить решение', 'error')
  })

  // Браузер описывает обрыв сети по-английски: «Failed to fetch», в Safari — «Load failed».
  it('обрыв сети при отправке объяснён по-русски', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('fetch', vi.fn(async () => { throw new TypeError('Failed to fetch') }))
    render(<TrainerWorkspace task={task} progress={progress} />)

    await user.click(screen.getByRole('button', { name: 'Отправить' }))

    await waitFor(() => expect(toast).toHaveBeenCalled())
    const [message] = toast.mock.calls[0] as [string, string]
    expect(message).toMatch(/[а-яё]/i)
    expect(document.body).not.toHaveTextContent('Failed to fetch')
  })

  it('повторное решение не обещает баллы второй раз и обновляет счётчик попыток', async () => {
    const user = userEvent.setup()
    serve({ '/api/trainer/submit': () => Response.json({ result: outcome(), completed: true, awardedPoints: null, attempts: 4 }) })
    render(<TrainerWorkspace task={task} progress={{ ...progress, isCompleted: true, attempts: 3 }} />)
    expect(screen.getByText('Попыток: 3')).toBeInTheDocument()

    await user.click(screen.getByRole('button', { name: 'Отправить' }))

    await waitFor(() => expect(toast).toHaveBeenCalledWith('Задача решена — баллы уже начислены ранее', 'success'))
    expect(screen.getByText('Попыток: 4')).toBeInTheDocument()
    expect(navigationRouter().refresh).toHaveBeenCalledOnce()
  })

  it('первое решение без начисления баллов не пишет «+0 XP»', async () => {
    const user = userEvent.setup()
    serve({ '/api/trainer/submit': () => Response.json({ result: outcome(), completed: true, awardedPoints: 0, attempts: 1 }) })
    render(<TrainerWorkspace task={task} progress={progress} />)

    await user.click(screen.getByRole('button', { name: 'Отправить' }))

    await waitFor(() => expect(toast).toHaveBeenCalledWith('Задача решена!', 'success'))
    expect(screen.getByText('Решено')).toBeInTheDocument()
  })

  it('серверная ошибка с номером строки переводит редактор к ней и подчёркивает диагностику', async () => {
    const user = userEvent.setup()
    serve({
      '/api/trainer/submit': () => Response.json({
        result: outcome({ status: 'compile_error', passedCount: 0, error: 'Не компилируется', errorLine: 5, diagnostics: [diagnostic({ line: 5 })] }),
        completed: false, awardedPoints: null, attempts: 2,
      }),
    })
    render(<TrainerWorkspace task={task} progress={progress} />)

    await user.click(screen.getByRole('button', { name: 'Отправить' }))

    expect(await screen.findByText('Код не компилируется')).toBeInTheDocument()
    expect(screen.getByLabelText('Строка в редакторе')).toHaveTextContent('5')
    expect(screen.getByLabelText('Подчёркнуто в редакторе')).toHaveTextContent('5:error')
  })
})

describe('язык, задача и черновик', () => {
  it('язык из ссылки, которого нет у задачи, игнорируется — открывается сохранённый', () => {
    setNavigationURL('/trainer/js-core/sum?lang=go')
    render(<TrainerWorkspace task={task} progress={{ ...progress, savedCode: 'const ts = 1', savedLanguage: 'ts' }} />)

    expect(screen.getByRole('button', { name: 'TypeScript' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'JavaScript' })).toHaveAttribute('aria-pressed', 'false')
    expect(editor()).toHaveValue('const ts = 1')
  })

  it('повторный выбор текущего языка не трогает адрес и код', async () => {
    const user = userEvent.setup()
    setNavigationURL('/trainer/js-core/sum?lang=ts')
    render(<TrainerWorkspace task={task} progress={progress} />)
    fireEvent.change(editor(), { target: { value: 'const draft: number = 1' } })

    await user.click(screen.getByRole('button', { name: 'TypeScript' }))

    expect(window.history.pushState).not.toHaveBeenCalled()
    expect(editor()).toHaveValue('const draft: number = 1')
  })

  it('сохранённый язык, который задача больше не поддерживает, заменяется первым доступным', () => {
    render(<TrainerWorkspace task={task} progress={{ ...progress, savedCode: 'print(1)', savedLanguage: 'python' }} />)

    expect(screen.getByRole('group', { name: 'Язык решения' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'JavaScript' })).toHaveAttribute('aria-pressed', 'true')
    expect(editor()).toHaveValue(task.starters.js)
  })

  it('черновик из браузера важнее решения, сохранённого на сервере', () => {
    window.localStorage.setItem('lms.trainer.draft.sum-task.js', 'черновик с прошлого визита')
    render(<TrainerWorkspace task={task} progress={{ ...progress, savedCode: 'старое решение', savedLanguage: 'js' }} />)

    expect(editor()).toHaveValue('черновик с прошлого визита')
  })

  it('недоступное хранилище браузера не ломает работу: открывается серверное решение, язык переключается', async () => {
    const user = userEvent.setup()
    vi.spyOn(Storage.prototype, 'getItem').mockImplementation(() => { throw new DOMException('Доступ запрещён', 'SecurityError') })
    vi.spyOn(Storage.prototype, 'setItem').mockImplementation(() => { throw new DOMException('Хранилище переполнено', 'QuotaExceededError') })
    render(<TrainerWorkspace task={task} progress={{ ...progress, savedCode: 'серверное решение', savedLanguage: 'js' }} />)

    expect(editor()).toHaveValue('серверное решение')
    fireEvent.change(editor(), { target: { value: 'правка без хранилища' } })
    await act(async () => { await new Promise((resolve) => setTimeout(resolve, 450)) })
    await user.click(screen.getByRole('button', { name: 'TypeScript' }))

    expect(editor()).toHaveValue(task.starters.ts)
    expect(screen.getByRole('button', { name: 'Запустить' })).toBeEnabled()
  })

  it('другая задача открывается без результата прошлого прогона', async () => {
    const user = userEvent.setup()
    const view = render(<TrainerWorkspace task={task} progress={progress} />)
    await user.click(screen.getByRole('button', { name: 'Запустить' }))
    expect(await screen.findByText('Все тесты пройдены')).toBeInTheDocument()

    view.rerender(<TrainerWorkspace task={{ ...task, id: 'other-task', starters: { js: 'function other() {}' } }} progress={progress} />)

    expect(screen.queryByText('Все тесты пройдены')).not.toBeInTheDocument()
    expect(screen.getByText('Нажмите «Запустить», чтобы прогнать тесты')).toBeInTheDocument()
    expect(editor()).toHaveValue('function other() {}')
  })

  it('ссылка «Поделиться» несёт выбранный язык, но не код и не посторонние параметры', async () => {
    const user = userEvent.setup()
    setNavigationURL('/trainer/js-core/sum?lang=ts&session=secret')
    render(<TrainerWorkspace task={task} progress={progress} />)
    fireEvent.change(editor(), { target: { value: 'const private_solution = 1' } })

    await user.click(screen.getByRole('button', { name: 'Поделиться ссылкой' }))

    expect(await screen.findByText('Ссылка скопирована')).toBeInTheDocument()
    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/trainer/js-core/sum?lang=ts`)
  })
})

describe('скрытые тесты', () => {
  it('один скрытый тест назван в единственном числе', () => {
    render(<TrainerWorkspace task={task} progress={progress} />)

    expect(screen.getByText('Ещё 1 скрытый тест прогонится при отправке')).toBeInTheDocument()
  })

  it('пять скрытых тестов согласованы с числом', () => {
    render(<TrainerWorkspace task={{ ...task, hiddenCaseCount: 5 }} progress={progress} />)

    expect(screen.getByText(/^Ещё 5 скрытых тестов /)).toBeInTheDocument()
  })
})

describe('Go и предпросмотр frontend', () => {
  const goTask: ClientTaskSpec = { ...task, id: 'go-task', languages: ['go'], checkMode: 'program', entryName: '', starters: { go: 'package main\nfunc main() {}' }, runtimeCases: [] }
  const nextTask: ClientTaskSpec = { ...task, id: 'next-task', languages: ['next'], checkMode: 'dom', entryName: '', starters: { next: '{"app/page.tsx":"export default () => null"}' }, runtimeCases: [] }
  const lease = 'a'.repeat(48)

  it('уход со страницы освобождает сессию предпросмотра даже при закрытии вкладки', async () => {
    const user = userEvent.setup()
    const fetchMock = serve({ '/api/trainer/run': () => Response.json({ result: outcome(), preview: { leaseToken: lease, previewPath: `/api/trainer/preview/${lease}/` } }) })
    render(<TrainerWorkspace task={nextTask} progress={progress} />)
    await screen.findByLabelText('Файлы проекта')
    await user.click(screen.getByRole('button', { name: 'Запустить' }))
    await screen.findByLabelText('Адрес предпросмотра')

    fireEvent(window, new Event('pagehide'))

    expect(fetchMock).toHaveBeenCalledWith(`/api/trainer/preview-release/${lease}`, { method: 'POST', keepalive: true, credentials: 'omit' })
  })

  it('если прежний предпросмотр не закрылся, новый запуск и отправка не начинаются', async () => {
    const user = userEvent.setup()
    const fetchMock = serve({
      '/api/trainer/run': () => Response.json({ result: outcome(), preview: { leaseToken: lease, previewPath: `/api/trainer/preview/${lease}/` } }),
      [`/api/trainer/preview-release/${lease}`]: () => new Response(null, { status: 503 }),
    })
    render(<TrainerWorkspace task={nextTask} progress={progress} />)
    await screen.findByLabelText('Файлы проекта')
    await user.click(screen.getByRole('button', { name: 'Запустить' }))
    await screen.findByLabelText('Адрес предпросмотра')

    await user.click(screen.getByRole('button', { name: 'Запустить' }))
    expect(await screen.findByText('Не удалось закрыть предыдущий предпросмотр. Повторите запуск.')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Отправить' }))
    expect(await screen.findByText('Не удалось закрыть предыдущий предпросмотр. Повторите отправку.')).toBeInTheDocument()

    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/trainer/run')).toHaveLength(1)
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/trainer/submit')).toBe(false)
    expect(navigationRouter().refresh).not.toHaveBeenCalled()
  })

  it('ответ, пришедший после ухода со страницы, не оставляет сессию предпросмотра висеть', async () => {
    const user = userEvent.setup()
    const answer = deferred<Response>()
    const fetchMock = serve({ '/api/trainer/run': () => answer.promise })
    const view = render(<TrainerWorkspace task={nextTask} progress={progress} />)
    await screen.findByLabelText('Файлы проекта')
    await user.click(screen.getByRole('button', { name: 'Запустить' }))

    view.unmount()
    await act(async () => answer.resolve(Response.json({ result: outcome(), preview: { leaseToken: lease, previewPath: `/api/trainer/preview/${lease}/` } })))

    await waitFor(() => expect(fetchMock).toHaveBeenCalledWith(`/api/trainer/preview-release/${lease}`, expect.objectContaining({ method: 'POST', keepalive: true })))
  })

  it('отказ среды выполнения Go показан текстом сервера', async () => {
    const user = userEvent.setup()
    serve({ '/api/trainer/run': () => Response.json({ error: 'Среда выполнения Go перегружена' }, { status: 503 }) })
    render(<TrainerWorkspace task={goTask} progress={progress} />)

    await user.click(screen.getByRole('button', { name: 'Запустить' }))

    expect(await screen.findByText('Среда выполнения Go перегружена')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Запустить' })).toBeEnabled()
  })

  // Прокси перед приложением отвечает на 502/504 не JSON: фразу интерфейса не должна подменять ошибка парсера.
  it('сбой прокси при запуске Go объяснён по-русски', async () => {
    const user = userEvent.setup()
    serve({ '/api/trainer/run': () => new Response('Gateway Timeout', { status: 504 }) })
    render(<TrainerWorkspace task={goTask} progress={progress} />)

    await user.click(screen.getByRole('button', { name: 'Запустить' }))

    expect(await screen.findByText('Ошибка выполнения')).toBeInTheDocument()
    expect(screen.getByText('Не удалось запустить решение')).toBeInTheDocument()
  })
})
