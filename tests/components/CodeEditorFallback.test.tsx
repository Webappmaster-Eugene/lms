import { describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen } from '@testing-library/react'

// Чанк Monaco не скачался: плохая сеть или выкат новой версии во время работы.
vi.mock('@/components/trainer/MonacoCodeEditor', () => {
  throw new Error('Не удалось загрузить чанк редактора')
})

const { CodeEditor } = await import('@/components/trainer/CodeEditor')

describe('редактор без Monaco', () => {
  it('остаётся рабочим обычным полем и честно говорит, что подсветки не будет', async () => {
    const onChange = vi.fn()
    const onRun = vi.fn()
    render(<CodeEditor value="function solve() {}" onChange={onChange} language="js" onRun={onRun} />)

    expect(await screen.findByText('Расширенный редактор недоступен. Можно продолжить в обычном редакторе.')).toHaveAttribute('role', 'status')
    const input = screen.getByRole('textbox', { name: 'Код решения' })
    fireEvent.change(input, { target: { value: 'function solve() { return 1 }' } })
    fireEvent.keyDown(input, { key: 'Enter', ctrlKey: true })

    expect(onChange).toHaveBeenCalledWith('function solve() { return 1 }')
    expect(onRun).toHaveBeenCalledOnce()
  })
})
