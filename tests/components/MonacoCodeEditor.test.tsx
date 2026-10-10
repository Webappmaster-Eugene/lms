import { act, render } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const monaco = vi.hoisted(() => ({
  mount: null as null | ((instance: unknown, api: unknown) => void),
  markers: vi.fn(),
  decorations: vi.fn(),
  revealLine: vi.fn(),
  options: null as unknown,
  change: null as null | ((value: string) => void),
  commands: [] as (() => void)[],
  getModels: vi.fn(() => [] as { uri: { toString: () => string }; dispose: () => void }[]),
  path: undefined as string | undefined,
  typeDiagnostics: vi.fn<(options: { diagnosticCodesToIgnore: number[] }) => void>(),
  addExtraLib: vi.fn(),
}))

vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'dark' }) }))
vi.mock('@monaco-editor/react', () => ({
  loader: { config: vi.fn() },
  default: ({ onMount, options, onChange, path }: { onMount: (instance: unknown, api: unknown) => void; options: unknown; onChange: (value: string) => void; path?: string }) => {
    monaco.mount = onMount
    monaco.options = options
    monaco.change = onChange
    monaco.path = path
    return <div />
  },
}))

const { MonacoCodeEditor } = await import('@/components/trainer/MonacoCodeEditor')

function finishLoading() {
  act(() => {
    monaco.mount?.({
      createDecorationsCollection: () => ({ set: monaco.decorations }),
      addCommand: (_key: number, callback: () => void) => monaco.commands.push(callback),
      getModel: () => ({ getLineCount: () => 2, getLineMaxColumn: () => 20 }),
      revealLineInCenterIfOutsideViewport: monaco.revealLine,
    }, {
      MarkerSeverity: { Error: 8, Warning: 4 },
      KeyMod: { CtrlCmd: 2048, Shift: 1024 },
      KeyCode: { Enter: 3 },
      editor: { setModelMarkers: monaco.markers, getModels: monaco.getModels },
      languages: { typescript: {
        typescriptDefaults: { setCompilerOptions: vi.fn(), setDiagnosticsOptions: monaco.typeDiagnostics, addExtraLib: monaco.addExtraLib },
        javascriptDefaults: { setCompilerOptions: vi.fn(), setDiagnosticsOptions: monaco.typeDiagnostics, addExtraLib: monaco.addExtraLib },
        ScriptTarget: { ES2022: 9 },
        JsxEmit: { ReactJSX: 4 },
        ModuleResolutionKind: { NodeJs: 2 },
      } },
    })
  })
}

describe('диагностика, полученная пока Monaco загружался', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    monaco.commands = []
    monaco.getModels.mockReturnValue([])
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue({ ok: true, json: async () => ({ 'react.d.ts': "declare module 'react' {}" }) }))
  })
  afterEach(() => vi.unstubAllGlobals())

  it('наносит уже имеющиеся ошибки сервера после готовности редактора', () => {
    render(<MonacoCodeEditor value="const answer = 1" onChange={vi.fn()} language="js" onReady={vi.fn()} diagnostics={[
      { line: 1, column: 2, message: 'Ошибка в решении', category: 'error', code: 1001, inHarness: false },
      { line: 1, column: 2, message: 'Внутренняя ошибка', category: 'error', code: 1002, inHarness: true },
    ]} />)
    expect(monaco.markers).not.toHaveBeenCalled()
    finishLoading()
    expect(monaco.markers).toHaveBeenCalledWith(expect.anything(), 'trainer-server', [
      expect.objectContaining({ message: 'Ошибка в решении', severity: 8, startLineNumber: 1 }),
    ])
  })

  it('подсвечивает строку ошибки даже если прогон завершился до загрузки Monaco', () => {
    render(<MonacoCodeEditor value="const answer = 1" onChange={vi.fn()} language="js" onReady={vi.fn()} errorLine={2} />)
    finishLoading()
    expect(monaco.decorations).toHaveBeenCalledWith([
      expect.objectContaining({ range: expect.objectContaining({ startLineNumber: 2 }) }),
    ])
    expect(monaco.revealLine).toHaveBeenCalledWith(2)
  })

  it('не пересоздаёт настройки и подписку на ввод при каждом символе', () => {
    const initialChange = vi.fn()
    const nextChange = vi.fn()
    const onReady = vi.fn()
    const { rerender } = render(<MonacoCodeEditor value="a" onChange={initialChange} language="js" onReady={onReady} />)
    const initialOptions = monaco.options
    const initialHandler = monaco.change
    rerender(<MonacoCodeEditor value="ab" onChange={nextChange} language="js" onReady={onReady} />)
    expect(monaco.options).toBe(initialOptions)
    expect(monaco.change).toBe(initialHandler)
    act(() => monaco.change?.('abc'))
    expect(nextChange).toHaveBeenCalledWith('abc')
    expect(initialChange).not.toHaveBeenCalled()
  })

  it('блокирует горячие клавиши после переключения в режим чтения', () => {
    const onRun = vi.fn()
    const onReady = vi.fn()
    const onChange = vi.fn()
    const { rerender } = render(<MonacoCodeEditor value="a" onChange={onChange} language="js" onReady={onReady} onRun={onRun} />)
    finishLoading()
    act(() => monaco.commands[0]?.())
    expect(onRun).toHaveBeenCalledOnce()
    rerender(<MonacoCodeEditor value="a" onChange={onChange} language="js" onReady={onReady} onRun={onRun} readOnly />)
    act(() => monaco.commands[0]?.())
    expect(onRun).toHaveBeenCalledOnce()
  })

  it('использует расширение JSX и удаляет только модели своего проекта при уходе', () => {
    const { unmount } = render(<MonacoCodeEditor value="<button />" onChange={vi.fn()} language="react" filePath="App.tsx" onReady={vi.fn()} />)
    finishLoading()
    expect(monaco.path).toMatch(/\/App\.tsx$/)
    const disposeCurrent = vi.fn()
    const disposeSibling = vi.fn()
    const disposeOther = vi.fn()
    const prefix = monaco.path?.slice(0, -'App.tsx'.length) ?? ''
    monaco.getModels.mockReturnValue([
      { uri: { toString: () => `${prefix}App.tsx` }, dispose: disposeCurrent },
      { uri: { toString: () => `${prefix}styles.css` }, dispose: disposeSibling },
      { uri: { toString: () => 'inmemory://another-editor/file.ts' }, dispose: disposeOther },
    ])
    unmount()
    expect(disposeCurrent).toHaveBeenCalledOnce()
    expect(disposeSibling).toHaveBeenCalledOnce()
    expect(disposeOther).not.toHaveBeenCalled()
  })

  it('сохраняет диагностику JSX и импортов после подключения настоящих типов React', () => {
    render(<MonacoCodeEditor value="<h1>React</h1>" onChange={vi.fn()} language="react" filePath="App.tsx" onReady={vi.fn()} />)
    finishLoading()
    expect(monaco.typeDiagnostics).toHaveBeenCalledWith(expect.objectContaining({
      noSemanticValidation: false,
      noSyntaxValidation: false,
    }))
    expect(monaco.typeDiagnostics.mock.calls[0]?.[0].diagnosticCodesToIgnore).not.toContain(7026)
    expect(monaco.typeDiagnostics.mock.calls[0]?.[0].diagnosticCodesToIgnore).not.toContain(2875)
    expect(monaco.typeDiagnostics.mock.calls[0]?.[0].diagnosticCodesToIgnore).not.toContain(2307)
  })

  it('загружает настоящие типы React после готовности только для frontend', async () => {
    const onReady = vi.fn()
    const onChange = vi.fn()
    const { rerender } = render(<MonacoCodeEditor value="const answer=1" onChange={onChange} language="js" onReady={onReady} />)
    finishLoading()
    expect(fetch).not.toHaveBeenCalled()
    rerender(<MonacoCodeEditor value="<h1 />" onChange={onChange} language="react" filePath="App.tsx" onReady={onReady} />)
    await act(async () => { await Promise.resolve() })
    expect(fetch).toHaveBeenCalledWith('/monaco/react-types.json')
    expect(monaco.addExtraLib).toHaveBeenCalledWith("declare module 'react' {}", 'inmemory://trainer/node_modules/@types/lms-react/react.d.ts')
    rerender(<MonacoCodeEditor value="<button />" onChange={onChange} language="react" filePath="Button.tsx" onReady={onReady} />)
    expect(fetch).toHaveBeenCalledOnce()
  })
})
