import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'

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
  const defaults = { setCompilerOptions: vi.fn(), setDiagnosticsOptions: vi.fn(), addExtraLib: vi.fn() }
  const defineTheme = vi.fn()
  const api = {
    MarkerSeverity: { Error: 8, Warning: 4 },
    KeyMod: { CtrlCmd: 2048, Shift: 1024 },
    KeyCode: { Enter: 3 },
    editor: { defineTheme, setModelMarkers: vi.fn(), getModels: () => [] },
    languages: { typescript: {
      typescriptDefaults: defaults,
      javascriptDefaults: defaults,
      ScriptTarget: { ES2022: 9 },
      JsxEmit: { ReactJSX: 4 },
      ModuleResolutionKind: { NodeJs: 2 },
    } },
  }
  return { api, defineTheme, addExtraLib: defaults.addExtraLib }
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

function editorProps(language: 'js' | 'react' = 'js') {
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
