import { act, render } from '@testing-library/react'
import { beforeEach, describe, expect, it, vi } from 'vitest'

const monaco = vi.hoisted(() => ({
  mount: null as null | ((instance: unknown, api: unknown) => void),
  markers: vi.fn(),
  decorations: vi.fn(),
  revealLine: vi.fn(),
}))

vi.mock('next-themes', () => ({ useTheme: () => ({ resolvedTheme: 'dark' }) }))
vi.mock('@monaco-editor/react', () => ({
  loader: { config: vi.fn() },
  default: ({ onMount }: { onMount: (instance: unknown, api: unknown) => void }) => {
    monaco.mount = onMount
    return <div />
  },
}))

const { MonacoCodeEditor } = await import('@/components/trainer/MonacoCodeEditor')

function finishLoading() {
  act(() => {
    monaco.mount?.({
      createDecorationsCollection: () => ({ set: monaco.decorations }),
      addCommand: vi.fn(),
      getModel: () => ({ getLineCount: () => 2, getLineMaxColumn: () => 20 }),
      revealLineInCenterIfOutsideViewport: monaco.revealLine,
    }, {
      MarkerSeverity: { Error: 8, Warning: 4 },
      KeyMod: { CtrlCmd: 2048, Shift: 1024 },
      KeyCode: { Enter: 3 },
      editor: { setModelMarkers: monaco.markers },
    })
  })
}

describe('диагностика, полученная пока Monaco загружался', () => {
  beforeEach(() => vi.clearAllMocks())

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
})
