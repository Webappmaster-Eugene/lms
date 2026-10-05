import { useState } from 'react'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const editor = vi.hoisted(() => ({
  value: '',
  onReady: null as null | ((instance: unknown) => void),
  setSelection: vi.fn(),
  focus: vi.fn(),
}))

vi.mock('@/components/trainer/MonacoCodeEditor', () => ({
  MonacoCodeEditor: ({ value, onReady }: { value: string; onReady: (instance: unknown) => void }) => {
    editor.value = value
    editor.onReady = onReady
    return <div data-testid="full-editor">{value}</div>
  },
}))

const { CodeEditor } = await import('@/components/trainer/CodeEditor')

function EditableEditor() {
  const [value, setValue] = useState('const answer = 1')
  return <CodeEditor value={value} onChange={setValue} language="js" />
}

describe('редактор при медленной загрузке Monaco', () => {
  beforeEach(() => {
    editor.value = ''
    editor.onReady = null
    vi.clearAllMocks()
  })

  afterEach(() => {
    vi.useRealTimers()
    vi.restoreAllMocks()
  })

  it('даёт редактировать и запускать код с первого рендера, пока Monaco не готов', async () => {
    const onChange = vi.fn()
    const onRun = vi.fn()
    const onSubmit = vi.fn()
    render(<CodeEditor value="function solve() {}" onChange={onChange} language="js" onRun={onRun} onSubmit={onSubmit} />)

    const input = screen.getByRole('textbox', { name: 'Код решения' })
    fireEvent.change(input, { target: { value: 'function solve() { return 42 }' } })
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })
    fireEvent.keyDown(input, { key: 'Enter', metaKey: true, shiftKey: true })

    expect(onChange).toHaveBeenCalledWith('function solve() { return 42 }')
    expect(onRun).toHaveBeenCalledOnce()
    expect(onSubmit).toHaveBeenCalledOnce()
    await waitFor(() => expect(screen.getByTestId('full-editor')).toBeInTheDocument())
    expect(input).toBeVisible()
    expect(screen.getByTestId('full-editor')).not.toBeVisible()
  })

  it('сохраняет набранный код, выделение и фокус при появлении Monaco', async () => {
    render(<EditableEditor />)
    const input = screen.getByRole('textbox', { name: 'Код решения' }) as HTMLTextAreaElement
    fireEvent.change(input, { target: { value: 'const answer = 42' } })
    input.focus()
    input.setSelectionRange(6, 12)
    await waitFor(() => expect(editor.onReady).not.toBeNull())
    expect(editor.value).toBe('const answer = 42')

    act(() => {
      editor.onReady?.({
        getModel: () => ({ getValue: () => editor.value, setValue: vi.fn(), getPositionAt: (offset: number) => ({ lineNumber: 1, column: offset + 1 }) }),
        setSelection: editor.setSelection,
        focus: editor.focus,
      })
    })

    expect(screen.queryByRole('textbox', { name: 'Код решения' })).not.toBeInTheDocument()
    expect(screen.getByTestId('full-editor')).toBeVisible()
    expect(editor.setSelection).toHaveBeenCalledWith({ startLineNumber: 1, startColumn: 7, endLineNumber: 1, endColumn: 13 })
    await waitFor(() => expect(editor.focus).toHaveBeenCalledOnce())
  })

  it('оставляет фокус на кнопке запуска, если пользователь уже вышел из редактора', async () => {
    render(<EditableEditor />)
    await waitFor(() => expect(editor.onReady).not.toBeNull())
    act(() => {
      editor.onReady?.({ getModel: () => null, focus: editor.focus })
    })
    expect(editor.focus).not.toHaveBeenCalled()
  })


  it('переносит последнюю клавишу до расчёта выделения, даже если модель Monaco ещё отстаёт', async () => {
    render(<EditableEditor />)
    const input = screen.getByRole('textbox', { name: 'Код решения' }) as HTMLTextAreaElement
    await waitFor(() => expect(editor.onReady).not.toBeNull())
    input.value = 'последняя клавиша'
    input.setSelectionRange(4, 8)
    const setValue = vi.fn()
    const getPositionAt = vi.fn((offset: number) => ({ lineNumber: 1, column: offset + 1 }))
    act(() => {
      editor.onReady?.({
        getModel: () => ({ getValue: () => 'старый код', setValue, getPositionAt }),
        setSelection: editor.setSelection,
        focus: editor.focus,
      })
    })
    expect(setValue).toHaveBeenCalledWith('последняя клавиша')
    expect(setValue.mock.invocationCallOrder[0]).toBeLessThan(getPositionAt.mock.invocationCallOrder[0])
  })

  it('не забирает фокус у кнопки, нажатой между onReady и следующим кадром', async () => {
    let focusFrame: FrameRequestCallback | null = null
    vi.spyOn(window, 'requestAnimationFrame').mockImplementation((callback) => {
      focusFrame = callback
      return 1
    })
    render(<><EditableEditor /><button type="button">Запустить</button></>)
    screen.getByRole('textbox', { name: 'Код решения' }).focus()
    await waitFor(() => expect(editor.onReady).not.toBeNull())
    act(() => {
      editor.onReady?.({ getModel: () => null, focus: editor.focus })
    })
    screen.getByRole('button', { name: 'Запустить' }).focus()
    act(() => { if (focusFrame) focusFrame(0) })
    expect(editor.focus).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Запустить' })).toHaveFocus()
  })

  it('завершает сообщение загрузки при отказе AMD, но принимает позднюю готовность Monaco', async () => {
    vi.useFakeTimers()
    render(<EditableEditor />)
    await act(async () => { await Promise.resolve() })
    act(() => { vi.advanceTimersByTime(10_000) })
    expect(screen.getByRole('status')).toHaveTextContent('Работает обычный редактор')
    expect(screen.getByRole('textbox', { name: 'Код решения' })).toBeVisible()
    expect(screen.getByTestId('full-editor')).toBeInTheDocument()
    act(() => {
      editor.onReady?.({ getModel: () => null, focus: editor.focus })
    })
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
    expect(screen.getByTestId('full-editor')).toBeVisible()
  })

  it('вставляет два пробела клавишей Tab и запрещает команды в readOnly', async () => {
    const { rerender } = render(<EditableEditor />)
    const input = screen.getByRole('textbox', { name: 'Код решения' }) as HTMLTextAreaElement
    input.setSelectionRange(0, 0)
    fireEvent.keyDown(input, { key: 'Tab' })
    expect(input.value).toBe('  const answer = 1')
    await waitFor(() => expect(input.selectionStart).toBe(2))

    const onRun = vi.fn()
    rerender(<CodeEditor value="read only" onChange={vi.fn()} language="js" readOnly onRun={onRun} />)
    const readonlyInput = screen.getByRole('textbox', { name: 'Код решения' })
    expect(readonlyInput).toHaveAttribute('readonly')
    fireEvent.keyDown(readonlyInput, { key: 'Enter', ctrlKey: true })
    expect(onRun).not.toHaveBeenCalled()
  })
})
