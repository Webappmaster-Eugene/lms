import { beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { createElement, type FunctionComponent } from 'react'
import { navigationURL, navigationRouter, setNavigationURL } from '../helpers/url-navigation'
import userEvent from '@testing-library/user-event'

const toast = vi.fn()
const refresh = vi.fn()

vi.mock('next/navigation', async () => { const mock = (await import('../helpers/url-navigation')).urlNavigationMock(); return { ...mock, useRouter: () => ({ ...mock.useRouter(), refresh }) } })
vi.mock('@/components/ui/Toast', () => ({ useToast: () => ({ toast }) }))
vi.mock('@monaco-editor/react', async () => (await import('../helpers/component-mocks')).monacoMock())
vi.mock('@/components/trainer/FrontendEditor', () => ({
  FrontendEditor: ({ value, onChange, previewHtml, previewUrl, readOnly }: { value: string; onChange: (code: string) => void; previewHtml?: string; previewUrl?: string; readOnly?: boolean }) => (
    <div>
      <textarea aria-label="Файлы проекта" value={value} onChange={(event) => onChange(event.target.value)} readOnly={readOnly} />
      {previewHtml && <output aria-label="HTML предпросмотра">{previewHtml}</output>}
      {previewUrl && <output aria-label="Адрес предпросмотра">{previewUrl}</output>}
    </div>
  ),
}))
vi.mock('react-markdown', async () => (await import('../helpers/component-mocks')).markdownMock())
vi.mock('remark-gfm', () => ({ default: () => {} }))
vi.mock('next/link', async () => (await import('../helpers/component-mocks')).linkMock())
vi.mock('rehype-raw', () => ({ default: () => {} }))

const run = vi.fn()
vi.mock('@/components/trainer/useCodeRunner', () => ({
  useCodeRunner: () => ({ run, cancel: vi.fn() }),
}))

const { TrainerWorkspace } = await import('@/components/trainer/TrainerWorkspace')
const { monacoCommands, MONACO_KEYS } = await import('../helpers/component-mocks')
const { TaskSidePanel } = await import('@/components/trainer/TaskSidePanel')

import type { ClientProgress, ClientTaskSpec } from '@/lib/trainer/api'

/**
 * Рабочее место тренажёра.
 *
 * Прогон в браузере — только для показа; баллы начисляются исключительно по
 * вердикту сервера, поэтому «Запустить» и «Отправить» ведут себя по-разному
 * и путать их нельзя.
 */

const task: ClientTaskSpec = {
  id: 'task-1',
  slug: 'create-counter',
  topicSlug: 'js-core',
  title: 'Счётчик на замыкании',
  difficulty: 'easy',
  checkMode: 'unit',
  languages: ['js', 'ts'],
  entryName: 'createCounter',
  setupCode: '',
  testCode: 'test("кейс", function () {})',
  publicCases: [],
  hiddenCaseCount: 2,
  timeLimitMs: 5000,
  starters: { js: 'function createCounter() {}', ts: 'function createCounter(): void {}' },
  pointsReward: 10,
} as ClientTaskSpec

const progress: ClientProgress = {
  isCompleted: false,
  attempts: 0,
  failedAttempts: 0,
  savedCode: null,
  savedLanguage: null,
}

const passed = {
  status: 'passed' as const,
  tests: [],
  passedCount: 1,
  totalCount: 1,
  consoleOutput: [],
  totalMs: 3,
}

describe('рабочее место тренажёра', () => {
  it('добавляет свои тесты только в локальный запуск, сохраняя серверную проверку', async () => {
    const user = userEvent.setup()
    render(<TrainerWorkspace task={task} progress={progress} />)
    await user.click(screen.getByText('Свои тесты'))
    await user.click(screen.getByRole('button', { name: 'Добавить свой тест' }))
    await user.type(screen.getByLabelText('Аргументы теста 1'), '10')
    await user.clear(screen.getByLabelText('Ожидаемый результат теста 1'))
    await user.type(screen.getByLabelText('Ожидаемый результат теста 1'), '11')
    await user.click(screen.getByRole('button', { name: 'Запустить' }))
    await waitFor(() => expect(run).toHaveBeenCalled())
    expect(run.mock.calls.at(-1)?.[0].cases).toEqual([
      { name: 'Свой тест 1', argsCode: '10', expectedCode: '11', compare: 'deep', hidden: false },
    ])
    await user.click(screen.getByRole('button', { name: 'Отправить' }))
    await waitFor(() => expect(global.fetch).toHaveBeenCalled())
    const body = JSON.parse((vi.mocked(global.fetch).mock.calls.at(-1)?.[1] as RequestInit).body as string)
    expect(Object.keys(body).sort()).toEqual(['code', 'language', 'taskId'])
    await user.click(screen.getByRole('button', { name: 'Удалить свой тест 1' }))
    await user.click(screen.getByRole('button', { name: 'Запустить' }))
    await waitFor(() => expect(run.mock.calls.at(-1)?.[0].cases).toEqual([]))
  })

  beforeEach(() => {
    setNavigationURL('/trainer/tasks/sum')
    vi.clearAllMocks()
    vi.spyOn(window.history, 'pushState').mockImplementation((_data, _title, url) => { if (url) navigationRouter().push(String(url)) })
    window.localStorage.clear()
    monacoCommands.clear()
    run.mockResolvedValue(passed)
    global.fetch = vi.fn(async () =>
      Response.json({ result: passed, solved: true, awardedPoints: 10 }),
    ) as unknown as typeof fetch
  })

  describe('стартовое состояние', () => {
    it('в редактор подставляется заготовка задачи', async () => {
      render(<TrainerWorkspace task={task} progress={progress} />)

      expect(await screen.findByTestId('monaco')).toHaveValue('function createCounter() {}')
    })

    it('сохранённое решение важнее заготовки', async () => {
      render(
        <TrainerWorkspace
          task={task}
          progress={{ ...progress, savedCode: 'моё решение', savedLanguage: 'js' }}
        />,
      )

      expect(await screen.findByTestId('monaco')).toHaveValue('моё решение')
    })

    it('решённая задача помечена', () => {
      render(<TrainerWorkspace task={task} progress={{ ...progress, isCompleted: true }} />)

      expect(screen.getByText(/Решено/i)).toBeInTheDocument()
    })
  })

  describe('смена языка', () => {
    it('явный lang из ссылки важнее прежнего языка, а решение не попадает в URL', async () => {
      setNavigationURL('/trainer/tasks/sum?lang=ts&keep=ok')
      render(<TrainerWorkspace task={task} progress={{ ...progress, savedCode: 'private js solution', savedLanguage: 'js' }} />)
      expect(await screen.findByTestId('monaco')).toHaveValue(task.starters.ts)
      await userEvent.click(screen.getByRole('button', { name: 'JavaScript' }))
      expect(navigationURL()).toBe('/trainer/tasks/sum?lang=js&keep=ok')
      expect(await screen.findByTestId('monaco')).toHaveValue('private js solution')
      expect(navigationURL()).not.toContain('solution')
    })
    it('предлагаются только языки задачи', () => {
      render(<TrainerWorkspace task={task} progress={progress} />)

      expect(screen.getByRole('button', { name: 'JavaScript' })).toBeInTheDocument()
      expect(screen.getByRole('button', { name: 'TypeScript' })).toBeInTheDocument()
    })

    it('переключение подставляет заготовку другого языка', async () => {
      const user = userEvent.setup()
      render(<TrainerWorkspace task={task} progress={progress} />)

      await user.click(screen.getByRole('button', { name: 'TypeScript' }))

      expect(await screen.findByTestId('monaco')).toHaveValue('function createCounter(): void {}')
    })

    it('быстрое переключение сохраняет новый и пустой черновики обоих языков', async () => {
      const user = userEvent.setup()
      render(<TrainerWorkspace task={task} progress={progress} />)
      const editor = await screen.findByTestId('monaco')
      fireEvent.change(editor, { target: { value: 'новый JS' } })
      await user.click(screen.getByRole('button', { name: 'TypeScript' }))
      fireEvent.change(editor, { target: { value: 'новый TS' } })
      await user.click(screen.getByRole('button', { name: 'JavaScript' }))
      expect(editor).toHaveValue('новый JS')
      fireEvent.change(editor, { target: { value: '' } })
      await user.click(screen.getByRole('button', { name: 'TypeScript' }))
      expect(editor).toHaveValue('новый TS')
      await user.click(screen.getByRole('button', { name: 'JavaScript' }))
      expect(editor).toHaveValue('')
    })

    it('очистка редактора сохраняет пустой черновик и после перезагрузки', async () => {
      window.localStorage.setItem('lms.trainer.draft.task-1.js', 'старый код')
      const view = render(<TrainerWorkspace task={task} progress={progress} />)
      const editor = await screen.findByTestId('monaco')
      expect(editor).toHaveValue('старый код')
      fireEvent.change(editor, { target: { value: '' } })
      await waitFor(() => expect(window.localStorage.getItem('lms.trainer.draft.task-1.js')).toBe(''))
      view.unmount()
      render(<TrainerWorkspace task={task} progress={progress} />)
      expect(await screen.findByTestId('monaco')).toHaveValue('')
    })
  })

  describe('локальный прогон', () => {
    it('«Запустить» гоняет код в браузере, не трогая сервер', async () => {
      const user = userEvent.setup()
      render(<TrainerWorkspace task={task} progress={progress} />)

      await user.click(screen.getByRole('button', { name: /Запустить/ }))

      await waitFor(() => expect(run).toHaveBeenCalled())
      expect(global.fetch).not.toHaveBeenCalled()
    })

    it('результат прогона показывается', async () => {
      const user = userEvent.setup()
      render(<TrainerWorkspace task={task} progress={progress} />)

      await user.click(screen.getByRole('button', { name: /Запустить/ }))

      expect(await screen.findByText(/Все тесты пройдены/)).toBeInTheDocument()
    })
  })

  describe('отправка на проверку', () => {
    it('уходит на сервер с кодом и id задачи', async () => {
      const user = userEvent.setup()
      render(<TrainerWorkspace task={task} progress={progress} />)

      await user.click(screen.getByRole('button', { name: /Отправить/ }))

      await waitFor(() => expect(global.fetch).toHaveBeenCalled())
      const [, init] = vi.mocked(global.fetch).mock.calls[0] as [string, RequestInit]
      const body = JSON.parse(String(init.body)) as Record<string, unknown>
      expect(body.taskId).toBe('task-1')
      expect(body.code).toBeTruthy()
    })

    it('зачёт подтверждается уведомлением с баллами', async () => {
      const user = userEvent.setup()
      render(<TrainerWorkspace task={task} progress={progress} />)

      await user.click(screen.getByRole('button', { name: /Отправить/ }))

      await waitFor(() => expect(toast).toHaveBeenCalled())
      expect(String(toast.mock.calls[0][0])).toMatch(/10|зачт|решен/i)
    })

    it('отказ сервера виден ученику', async () => {
      global.fetch = vi.fn(async () => new Response('сбой', { status: 500 })) as unknown as typeof fetch
      const user = userEvent.setup()
      render(<TrainerWorkspace task={task} progress={progress} />)

      await user.click(screen.getByRole('button', { name: /Отправить/ }))

      await waitFor(() => expect(toast).toHaveBeenCalled())
    })
  })

  describe('после решения', () => {
    const nextTask = { href: '/trainer/js-core/debounce', title: 'Debounce' }

    it('ведёт в следующую нерешённую задачу', async () => {
      const user = userEvent.setup()
      render(<TrainerWorkspace task={task} progress={progress} nextTask={nextTask} topicHref="/trainer" />)
      expect(screen.queryByRole('link', { name: /Debounce/ })).not.toBeInTheDocument()

      await user.click(screen.getByRole('button', { name: /Отправить/ }))

      expect(await screen.findByRole('link', { name: /Debounce/ })).toHaveAttribute('href', nextTask.href)
    })

    it('когда в теме всё решено — возврат к темам', () => {
      render(<TrainerWorkspace task={task} progress={{ ...progress, isCompleted: true }} topicHref="/trainer" />)

      expect(screen.getByText('Все задачи темы решены.')).toBeInTheDocument()
      expect(screen.getByRole('link', { name: 'К темам тренажёра' })).toHaveAttribute('href', '/trainer')
    })

    it('непройденная проверка переход не показывает', async () => {
      global.fetch = vi.fn(async () =>
        Response.json({ result: { ...passed, status: 'failed', passedCount: 0 }, attempts: 1 }),
      ) as unknown as typeof fetch
      const user = userEvent.setup()
      render(<TrainerWorkspace task={task} progress={progress} nextTask={nextTask} />)

      await user.click(screen.getByRole('button', { name: /Отправить/ }))

      await waitFor(() => expect(global.fetch).toHaveBeenCalled())
      expect(screen.queryByRole('link', { name: /Debounce/ })).not.toBeInTheDocument()
    })
  })

  describe('горячие клавиши', () => {
    it('Ctrl+Enter запускает в браузере, Ctrl+Shift+Enter отправляет на сервер', async () => {
      render(<TrainerWorkspace task={task} progress={progress} />)

      await waitFor(() => expect(monacoCommands.has(MONACO_KEYS.CtrlCmd | MONACO_KEYS.Enter)).toBe(true))
      monacoCommands.get(MONACO_KEYS.CtrlCmd | MONACO_KEYS.Enter)?.()
      await waitFor(() => expect(run).toHaveBeenCalled())
      expect(global.fetch).not.toHaveBeenCalled()

      await waitFor(() => screen.getByRole('button', { name: /Запустить/ }))
      monacoCommands.get(MONACO_KEYS.CtrlCmd | MONACO_KEYS.Shift | MONACO_KEYS.Enter)?.()
      await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/trainer/submit', expect.anything()))
    })
  })

  describe('сброс', () => {
    it('возвращает заготовку задачи', async () => {
      const user = userEvent.setup()
      render(
        <TrainerWorkspace
          task={task}
          progress={{ ...progress, savedCode: 'моё решение', savedLanguage: 'js' }}
        />,
      )

      await user.click(screen.getByRole('button', { name: /Сбросить/ }))

      expect(await screen.findByTestId('monaco')).toHaveValue('function createCounter() {}')
    })
  })

  describe('Go и frontend', () => {
    const goTask: ClientTaskSpec = { ...task, id: '42', languages: ['go'], checkMode: 'program', entryName: '', testCode: '',
      starters: { go: 'package main\nfunc main() {}' }, runtimeCases: [{ name: 'Публичный', hidden: false, input: '2 3', expected: '5' }] }
    const reactCode = JSON.stringify({ 'App.tsx': 'export default () => <h1>Hello</h1>' })
    const nextCode = JSON.stringify({ 'app/page.tsx': 'export default () => <h1>Hello</h1>' })
    const frontendTask: ClientTaskSpec = { ...task, id: '43', languages: ['react'], checkMode: 'dom', entryName: '', testCode: '',
      starters: { react: reactCode }, runtimeCases: [{ name: 'Заголовок', hidden: false, checks: [{ selector: 'h1', text: 'Hello' }] }] }

    it('запускает Go с собственным stdin на сервере; отправляет только решение без своих или публичных тестов', async () => {
      const user = userEvent.setup()
      const goSolution = 'package main\nimport "fmt"\nfunc main() { var a, b int; fmt.Scan(&a, &b); fmt.Println(a + b) }'
      global.fetch = vi.fn(async () => Response.json({ result: passed, completed: true, attempts: 1, awardedPoints: 10 })) as unknown as typeof fetch
      render(<TrainerWorkspace task={goTask} progress={progress} />)
      const editor = await screen.findByTestId('monaco')
      fireEvent.change(editor, { target: { value: goSolution } })
      await user.click(screen.getByText('Свои проверки Go (0)'))
      await user.click(screen.getByRole('button', { name: 'Добавить проверку Go' }))
      await user.type(screen.getByLabelText('Ввод Go 1'), '10 11')
      await user.type(screen.getByLabelText('Ожидаемый вывод Go 1'), '21')
      await user.click(screen.getByRole('button', { name: 'Запустить' }))
      await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/trainer/run', expect.anything()))
      const runCall = vi.mocked(global.fetch).mock.calls.find(([url]) => url === '/api/trainer/run')
      const runBody = JSON.parse(String(runCall?.[1]?.body))
      expect(runBody).toEqual({ taskId: '42', language: 'go', code: goSolution, customCases: [{ name: 'Своя проверка 1', input: '10 11', expected: '21', hidden: false }] })
      expect(run).not.toHaveBeenCalled()
      expect(refresh).not.toHaveBeenCalled()
      expect(screen.queryByText('Решено')).not.toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Отправить' }))
      await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/trainer/submit', expect.anything()))
      const submitCall = vi.mocked(global.fetch).mock.calls.find(([url]) => url === '/api/trainer/submit')
      expect(JSON.parse(String(submitCall?.[1]?.body))).toEqual({ taskId: '42', language: 'go', code: goSolution })
      expect(await screen.findByText('Решено')).toBeInTheDocument()
    })

    it('получает React-предпросмотр через runtime и просит обновить его после изменения файлов', async () => {
      const user = userEvent.setup()
      global.fetch = vi.fn(async () => Response.json({ result: passed, preview: { html: '<h1>Hello</h1>' } })) as unknown as typeof fetch
      render(<TrainerWorkspace task={frontendTask} progress={progress} />)
      expect(await screen.findByLabelText('Файлы проекта')).toHaveValue(reactCode)
      await user.click(screen.getByRole('button', { name: 'Запустить' }))
      expect(await screen.findByLabelText('HTML предпросмотра')).toHaveTextContent('<h1>Hello</h1>')
      expect(global.fetch).toHaveBeenCalledWith('/api/trainer/run', expect.objectContaining({ body: JSON.stringify({ taskId: '43', language: 'react', code: reactCode }) }))
      expect(run).not.toHaveBeenCalled()
      expect(refresh).not.toHaveBeenCalled()
      const updated = JSON.stringify({ 'App.tsx': 'export default () => <h1>Updated</h1>' })
      fireEvent.change(screen.getByLabelText('Файлы проекта'), { target: { value: updated } })
      expect(screen.getByText('Код изменён. Нажмите «Запустить», чтобы обновить предпросмотр.')).toBeInTheDocument()
      await user.click(screen.getByRole('button', { name: 'Запустить' }))
      await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(2))
      expect(JSON.parse(String(vi.mocked(global.fetch).mock.calls[1][1]?.body))).toMatchObject({ code: updated, language: 'react' })
      expect(vi.mocked(global.fetch).mock.calls.every(([url]) => url === '/api/trainer/run')).toBe(true)
    })

    it('освобождает Next.js-сессии до повторного запуска и перед серверной отправкой', async () => {
      const user = userEvent.setup()
      const nextTask: ClientTaskSpec = { ...frontendTask, id: '44', languages: ['next'], starters: { next: nextCode } }
      let sequence = 0
      let finishRelease = () => {}
      const firstRelease = new Promise<Response>((resolve) => { finishRelease = () => resolve(new Response(null, { status: 204 })) })
      global.fetch = vi.fn(async (url: RequestInfo | URL) => {
        if (String(url).endsWith(`/preview-release/${'1'.padStart(48, 'a')}`)) return firstRelease
        if (String(url).includes('/preview-release/')) return new Response(null, { status: 204 })
        if (url === '/api/trainer/run') {
          const leaseToken = (++sequence).toString().padStart(48, 'a')
          return Response.json({ result: passed, preview: { leaseToken, previewPath: `/api/trainer/preview/${leaseToken}/` } })
        }
        return Response.json({ result: passed, completed: true, attempts: 1, awardedPoints: 10 })
      }) as typeof fetch
      const view = render(<TrainerWorkspace task={nextTask} progress={progress} />)
      await screen.findByLabelText('Файлы проекта')
      for (let index = 0; index < 3; index++) {
        await user.click(screen.getByRole('button', { name: 'Запустить' }))
        if (index === 1) {
          expect(vi.mocked(global.fetch).mock.calls.filter(([url]) => url === '/api/trainer/run')).toHaveLength(1)
          await act(async () => { finishRelease() })
        }
        await waitFor(() => expect(screen.getByLabelText('Адрес предпросмотра')).toHaveTextContent((index + 1).toString().padStart(48, 'a')))
      }
      await user.click(screen.getByRole('button', { name: 'Отправить' }))
      await waitFor(() => expect(global.fetch).toHaveBeenCalledWith('/api/trainer/submit', expect.anything()))
      const calls = vi.mocked(global.fetch).mock.calls
      const runIndexes = calls.map(([url], index) => url === '/api/trainer/run' ? index : -1).filter((index) => index >= 0)
      for (let index = 1; index < runIndexes.length; index++) {
        const releaseIndex = calls.findIndex(([url]) => url === `/api/trainer/preview-release/${index.toString().padStart(48, 'a')}`)
        expect(releaseIndex).toBeGreaterThan(runIndexes[index - 1])
        expect(releaseIndex).toBeLessThan(runIndexes[index])
      }
      const lastRelease = calls.findIndex(([url]) => url === `/api/trainer/preview-release/${'3'.padStart(48, 'a')}`)
      expect(lastRelease).toBeGreaterThan(runIndexes[2])
      expect(lastRelease).toBeLessThan(calls.findIndex(([url]) => url === '/api/trainer/submit'))
      const submitCall = calls.find(([url]) => url === '/api/trainer/submit')
      expect(JSON.parse(String(submitCall?.[1]?.body))).toEqual({ taskId: '44', language: 'next', code: nextCode })
      expect(run).not.toHaveBeenCalled()
      expect(screen.queryByLabelText('Адрес предпросмотра')).not.toBeInTheDocument()
      view.unmount()
    })

    it('хранит отдельные черновики React/Next и не переносит код, зачёт и попытки в другую задачу', async () => {
      const user = userEvent.setup()
      const bilingual: ClientTaskSpec = { ...frontendTask, languages: ['react', 'next'], starters: { react: reactCode, next: nextCode } }
      const privateReact = JSON.stringify({ 'App.tsx': '// private React draft\nexport default () => null' })
      const privateNext = JSON.stringify({ 'app/page.tsx': '// private Next draft\nexport default () => null' })
      const view = render(<TrainerWorkspace task={bilingual} progress={{ ...progress, isCompleted: true, attempts: 3 }} />)
      await screen.findByLabelText('Файлы проекта')
      fireEvent.change(screen.getByLabelText('Файлы проекта'), { target: { value: privateReact } })
      await user.click(screen.getByRole('button', { name: 'Next.js' }))
      expect(screen.getByLabelText('Файлы проекта')).toHaveValue(nextCode)
      fireEvent.change(screen.getByLabelText('Файлы проекта'), { target: { value: privateNext } })
      await user.click(screen.getByRole('button', { name: 'React' }))
      expect(screen.getByLabelText('Файлы проекта')).toHaveValue(privateReact)
      const other: ClientTaskSpec = { ...bilingual, id: '45', starters: { react: '{"App.tsx":"new task"}', next: nextCode } }
      view.rerender(<TrainerWorkspace task={other} progress={progress} />)
      expect(await screen.findByLabelText('Файлы проекта')).toHaveValue('{"App.tsx":"new task"}')
      expect(screen.queryByText('Решено')).not.toBeInTheDocument()
      expect(screen.queryByText('Попыток: 3')).not.toBeInTheDocument()
      expect(window.localStorage.getItem('lms.trainer.draft.43.react')).toBe(privateReact)
      expect(window.localStorage.getItem('lms.trainer.draft.43.next')).toBe(privateNext)
      expect(navigationURL()).not.toContain('private')
    })
  })
})

describe('боковая панель задачи', () => {
  const panelProps = {
    taskId: 'task-1',
    descriptionMd: 'Реализуйте функцию createCounter',
    hints: [{ id: 'h1', hint: 'Вспомните про замыкание' }],
    publicCases: [],
    hiddenCaseCount: 2,
    testCode: 'test("кейс", function () {})',
    entryName: 'createCounter',
    languages: ['js'] as const,
    checkMode: 'unit',
  }

  /** Панель ждёт полный набор пропсов, тестам достаточно перечисленных. */
  const renderPanel = (overrides: Record<string, unknown> = {}) =>
    render(
      createElement(TaskSidePanel as FunctionComponent<Record<string, unknown>>, {
        ...panelProps,
        ...overrides,
      }),
    )

  beforeEach(() => {
    vi.clearAllMocks()
    global.fetch = vi.fn(async () => Response.json({ solutionCode: 'эталон' })) as unknown as typeof fetch
  })

  it('по умолчанию открыто условие', () => {
    renderPanel()

    expect(screen.getByTestId('markdown')).toHaveTextContent('Реализуйте функцию createCounter')
  })

  it('вкладка тестов показывает проверки', async () => {
    const user = userEvent.setup()
    renderPanel()

    await user.click(screen.getByRole('button', { name: /Тесты/ }))

    expect(screen.queryByTestId('markdown')).not.toBeInTheDocument()
  })

  it('скрытые тесты названы числом — ученик должен знать, что проверок больше', async () => {
    const user = userEvent.setup()
    renderPanel()

    await user.click(screen.getByRole('button', { name: /Тесты/ }))

    expect(screen.getByText(/2/)).toBeInTheDocument()
  })

  it('вкладка подсказок появляется, только когда они есть', () => {
    renderPanel({ hints: [] })

    expect(screen.queryByRole('button', { name: /Подсказки/ })).not.toBeInTheDocument()
  })

  describe('разбор решения', () => {
    it('запрашивается только при открытии вкладки — иначе спойлер приедет со страницей', async () => {
      const user = userEvent.setup()
      renderPanel()

      expect(global.fetch).not.toHaveBeenCalled()
      await user.click(screen.getByRole('button', { name: /Разбор/ }))

      await waitFor(() => expect(global.fetch).toHaveBeenCalled())
      expect(String(vi.mocked(global.fetch).mock.calls[0][0])).toContain('taskId=task-1')
    })

    it('повторное открытие вкладки не делает второй запрос', async () => {
      const user = userEvent.setup()
      renderPanel()

      await user.click(screen.getByRole('button', { name: /Разбор/ }))
      await waitFor(() => expect(global.fetch).toHaveBeenCalledTimes(1))
      await user.click(screen.getByRole('button', { name: /Условие/ }))
      await user.click(screen.getByRole('button', { name: /Разбор/ }))

      expect(global.fetch).toHaveBeenCalledTimes(1)
    })

    it('отказ сервера объясняется словами', async () => {
      global.fetch = vi.fn(async () =>
        Response.json({ error: 'Сначала решите задачу' }, { status: 403 }),
      ) as unknown as typeof fetch
      const user = userEvent.setup()
      renderPanel()

      await user.click(screen.getByRole('button', { name: /Разбор/ }))

      expect(await screen.findByText('Сначала решите задачу')).toBeInTheDocument()
    })

    it('отказ без пояснения подменяется понятным текстом', async () => {
      global.fetch = vi.fn(async () => Response.json({}, { status: 403 })) as unknown as typeof fetch
      const user = userEvent.setup()
      renderPanel()

      await user.click(screen.getByRole('button', { name: /Разбор/ }))

      expect(await screen.findByText('Разбор пока недоступен')).toBeInTheDocument()
    })

    it('сетевой сбой тоже виден ученику', async () => {
      global.fetch = vi.fn(async () => {
        throw new Error('сеть недоступна')
      }) as unknown as typeof fetch
      const user = userEvent.setup()
      renderPanel()

      await user.click(screen.getByRole('button', { name: /Разбор/ }))

      expect(await screen.findByText('Не удалось загрузить разбор')).toBeInTheDocument()
    })
  })

  it('подсказки открываются с вкладки', async () => {
    const user = userEvent.setup()
    renderPanel()

    await user.click(screen.getByRole('button', { name: /Подсказки/ }))

    expect(screen.getByText(/Подсказки \(0\/1\)/)).toBeInTheDocument()
  })
})
