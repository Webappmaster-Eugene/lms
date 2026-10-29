import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'

import { ENTRY_TASKS } from '@/data/bootcamp-entry/tasks'

type EditorProps = {
  theme?: string
  beforeMount?: (api: unknown) => void
  onMount?: (instance: unknown, api: unknown) => void
}

const state = vi.hoisted(() => ({ theme: 'dark', props: null as EditorProps | null }))

vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: state.theme }) }))
vi.mock('@monaco-editor/react', () => ({
  loader: { config: vi.fn() },
  default: (props: EditorProps) => {
    state.props = props
    return <div data-testid="monaco" data-theme={props.theme} />
  },
}))

const { MonacoCodeEditor } = await import('@/components/trainer/MonacoCodeEditor')

/**
 * Подготовка Monaco: тема интерфейса и подсказки типов React. Сам редактор в
 * jsdom не создаётся, поэтому проверяется то, что компонент передаёт движку
 * и что видит ученик, когда вспомогательная загрузка не удалась.
 */

function createMonaco() {
  const addExtraLib = vi.fn()
  const createDefaults = () => ({ setCompilerOptions: vi.fn(), setDiagnosticsOptions: vi.fn(), addExtraLib })
  const typescriptDefaults = createDefaults()
  const javascriptDefaults = createDefaults()
  const defineTheme = vi.fn()
  const api = {
    MarkerSeverity: { Error: 8, Warning: 4 },
    KeyMod: { CtrlCmd: 2048, Shift: 1024 },
    KeyCode: { Enter: 3 },
    editor: { defineTheme, setModelMarkers: vi.fn(), getModels: () => [] },
    languages: { typescript: {
      typescriptDefaults,
      javascriptDefaults,
      ScriptTarget: { ES2022: 9 },
      JsxEmit: { ReactJSX: 4 },
      ModuleResolutionKind: { NodeJs: 2 },
    } },
  }
  return { api, defineTheme, addExtraLib, typescriptDefaults, javascriptDefaults }
}

const instance = {
  createDecorationsCollection: () => ({ set: vi.fn() }),
  addCommand: vi.fn(),
  getModel: () => null,
  revealLineInCenterIfOutsideViewport: vi.fn(),
}

/** Порядок как у настоящего Monaco: beforeMount до создания редактора, затем onMount. */
function startEditor(api: unknown) {
  act(() => {
    state.props?.beforeMount?.(api)
    state.props?.onMount?.(instance, api)
  })
}

function editorProps(language: 'js' | 'ts' | 'react' = 'js') {
  return { value: '', onChange: vi.fn(), onReady: vi.fn(), language, ...(language === 'react' ? { filePath: 'App.tsx', editorLanguage: 'typescript' as const } : {}) }
}

beforeEach(() => {
  state.theme = 'dark'
  state.props = null
})

afterEach(() => vi.unstubAllGlobals())

describe('тема редактора', () => {
  it.each([
    ['light', 'vs'],
    ['dark', 'vs-dark'],
  ])('в теме %s редактор получает зарегистрированную до создания тему на основе %s', (theme, base) => {
    state.theme = theme
    const { api, defineTheme } = createMonaco()
    render(<MonacoCodeEditor {...editorProps()} />)

    startEditor(api)

    const selected = screen.getByTestId('monaco').getAttribute('data-theme')
    expect(defineTheme).toHaveBeenCalledWith(selected, expect.objectContaining({ base, inherit: true }))
  })

  it('смена темы интерфейса переключает редактор на другую зарегистрированную тему', () => {
    const { api, defineTheme } = createMonaco()
    const view = render(<MonacoCodeEditor {...editorProps()} />)
    startEditor(api)
    const dark = screen.getByTestId('monaco').getAttribute('data-theme')

    state.theme = 'light'
    view.rerender(<MonacoCodeEditor {...editorProps()} />)

    const light = screen.getByTestId('monaco').getAttribute('data-theme')
    expect(light).not.toBe(dark)
    expect(defineTheme.mock.calls.map(([name]) => name)).toEqual(expect.arrayContaining([dark, light]))
  })
})

type WorkerDiagnostic = { code: number, messageText: string | { messageText: string } }
type TypeScriptWorkerClass = new (
  ctx: { getMirrorModels: () => { uri: { toString: () => string, path: string }, version: number, getValue: () => string }[] },
  createData: { compilerOptions: unknown, extraLibs: Record<string, never> },
) => {
  getSyntacticDiagnostics: (fileName: string) => Promise<WorkerDiagnostic[]>
  getSemanticDiagnostics: (fileName: string) => Promise<WorkerDiagnostic[]>
}

// Модуль воркера без деклараций типов: спецификатор в переменной, чтобы tsc его не разрешал.
// Грузится при сборе тестов: компилятор весит 9 МБ, и внутри теста загрузка съела бы таймаут.
const TS_WORKER_MODULE = 'monaco-editor/esm/vs/language/typescript/tsWorker.js'
const { TypeScriptWorker } = await import(/* @vite-ignore */ TS_WORKER_MODULE) as { TypeScriptWorker: TypeScriptWorkerClass }

type CapturedDefaults = { setCompilerOptions: ReturnType<typeof vi.fn>, setDiagnosticsOptions: ReturnType<typeof vi.fn> }

/**
 * Прогоняет код через настоящий воркер TypeScript из Monaco с теми настройками,
 * что компонент передал движку. Модель без пути, как у редактора задачи: Monaco
 * называет её inmemory://model/<номер>, без расширения файла.
 */
async function editorDiagnostics(defaults: CapturedDefaults, code: string): Promise<string[]> {
  const [compilerOptions] = defaults.setCompilerOptions.mock.lastCall ?? []
  const [diagnosticsOptions] = defaults.setDiagnosticsOptions.mock.lastCall ?? []
  const ignored = new Set<number>(diagnosticsOptions?.diagnosticCodesToIgnore ?? [])
  const fileName = 'inmemory://model/1'
  const model = { uri: { toString: () => fileName, path: '/1' }, version: 1, getValue: () => code }
  const worker = new TypeScriptWorker({ getMirrorModels: () => [model] }, { compilerOptions, extraLibs: {} })
  const diagnostics = [...await worker.getSyntacticDiagnostics(fileName), ...await worker.getSemanticDiagnostics(fileName)]
  return diagnostics
    .filter((diagnostic) => !ignored.has(diagnostic.code))
    .map((diagnostic) => `${diagnostic.code}: ${typeof diagnostic.messageText === 'string' ? diagnostic.messageText : diagnostic.messageText.messageText}`)
}

describe('подсветка ошибок в коде', () => {
  it.each(ENTRY_TASKS.map((task) => [task.title, task.solutionCode]))('эталон входного задания «%s» в JS-редакторе не подчёркнут', async (_title, solution) => {
    const { api, javascriptDefaults } = createMonaco()
    render(<MonacoCodeEditor {...editorProps('js')} />)
    startEditor(api)

    expect(await editorDiagnostics(javascriptDefaults, solution)).toEqual([])
  })

  it('в TS-редакторе строгая проверка остаётся: параметр без типа подчёркнут', async () => {
    const { api, typescriptDefaults } = createMonaco()
    render(<MonacoCodeEditor {...editorProps('ts')} />)
    startEditor(api)

    expect(await editorDiagnostics(typescriptDefaults, 'function double(value) {\n  return value * 2\n}\n'))
      .toEqual([expect.stringMatching(/^7006: Parameter 'value' implicitly has an 'any' type/)])
  })
})

describe('подсказки типов React', () => {
  it('недоступный файл подсказок не мешает работе — ученик видит, что код можно запускать', async () => {
    vi.stubGlobal('fetch', vi.fn(async () => new Response('нет файла', { status: 404 })))
    const { api, addExtraLib } = createMonaco()
    render(<MonacoCodeEditor {...editorProps('react')} />)

    startEditor(api)

    expect(await screen.findByRole('status')).toHaveTextContent('Подсказки типов React недоступны. Код можно запускать.')
    expect(addExtraLib).not.toHaveBeenCalled()
  })

  it.each([
    ['список вместо словаря', ['react.d.ts']],
    ['не строка в содержимом', { 'react.d.ts': 42 }],
  ])('испорченный файл подсказок (%s) не подключается частично', async (_case, body) => {
    vi.stubGlobal('fetch', vi.fn(async () => Response.json(body)))
    const { api, addExtraLib } = createMonaco()
    render(<MonacoCodeEditor {...editorProps('react')} />)

    startEditor(api)

    expect(await screen.findByRole('status')).toHaveTextContent('Подсказки типов React недоступны')
    expect(addExtraLib).not.toHaveBeenCalled()
  })

  it('неудачная загрузка не запоминается: следующий редактор пробует снова и подключает типы', async () => {
    vi.stubGlobal('fetch', vi.fn()
      .mockResolvedValueOnce(new Response('сбой', { status: 503 }))
      .mockResolvedValueOnce(Response.json({ 'react.d.ts': "declare module 'react' {}" })))
    const { api, addExtraLib } = createMonaco()
    const first = render(<MonacoCodeEditor {...editorProps('react')} />)
    startEditor(api)
    await screen.findByRole('status')
    first.unmount()

    render(<MonacoCodeEditor {...editorProps('react')} />)
    startEditor(api)

    await waitFor(() => expect(addExtraLib).toHaveBeenCalledWith("declare module 'react' {}", expect.stringContaining('react.d.ts')))
    expect(fetch).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
})
