import { useState } from 'react'
import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

const state = vi.hoisted(() => ({ initial: '' }))
vi.mock('@payloadcms/ui', () => ({
  useField: () => {
    const [value, setValue] = useState(state.initial)
    return { value, setValue, showError: false }
  },
  FieldLabel: ({ htmlFor, label }: { htmlFor: string; label: string }) => <label htmlFor={htmlFor}>{label}</label>,
  FieldError: () => null,
  FieldDescription: () => null,
}))

const { GuideMarkdownEditor } = await import('@/components/guides/GuideMarkdownEditor')

function editor() {
  return render(<GuideMarkdownEditor field={{ name: 'markdown', type: 'textarea', label: 'Текст гайда' }} path="markdown" />)
}

beforeEach(() => {
  state.initial = ''
  localStorage.clear()
  localStorage.setItem('guide-editor-mode', 'split')
})

describe('редактор гайда', () => {
  it('исправляет старые символы • в настоящие списки и сразу показывает результат', async () => {
    state.initial = 'Описание.\n• Первый\n• Второй'
    editor()
    const preview = screen.getByLabelText('Предпросмотр гайда')
    expect(within(preview).queryByRole('list')).not.toBeInTheDocument()
    await userEvent.click(screen.getByRole('button', { name: 'Преобразовать символы • в Markdown-списки' }))
    expect(screen.getByRole('textbox')).toHaveValue('Описание.\n- Первый\n- Второй')
    expect(within(preview).getAllByRole('listitem')).toHaveLength(2)
  })

  it('кнопка списка убирает символ • и не дублирует его', async () => {
    state.initial = '• Первый\n• Второй'
    editor()
    const input = screen.getByRole<HTMLTextAreaElement>('textbox')
    input.setSelectionRange(0, state.initial.length)
    await userEvent.click(screen.getByRole('button', { name: /^Список$/ }))
    expect(input).toHaveValue('- Первый\n- Второй')
  })

  it('Enter продолжает чек-лист; Enter на пустом пункте выходит из него', () => {
    state.initial = '- [x] Проверить'
    editor()
    const input = screen.getByRole<HTMLTextAreaElement>('textbox')
    input.setSelectionRange(input.value.length, input.value.length)
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(input).toHaveValue('- [x] Проверить\n- [ ] ')
    fireEvent.keyDown(input, { key: 'Enter' })
    expect(input).toHaveValue('- [x] Проверить\n\n')
  })

  it('вставка списка не меняет старые пункты и сразу размечает вставленные', () => {
    state.initial = '• Старый\n\n'
    editor()
    const input = screen.getByRole<HTMLTextAreaElement>('textbox')
    input.setSelectionRange(input.value.length, input.value.length)
    fireEvent.paste(input, { clipboardData: { getData: () => '• Первый\n• Второй' } })
    expect(input).toHaveValue('• Старый\n\n- Первый\n- Второй')
  })

  it('панель форматирования работает из режима просмотра', async () => {
    state.initial = 'Раздел'
    localStorage.setItem('guide-editor-mode', 'preview')
    editor()
    await userEvent.click(screen.getByRole('button', { name: 'Раздел — пункт оглавления' }))
    expect(screen.getByRole('textbox')).toHaveValue('## Раздел')
    expect(within(screen.getByLabelText('Предпросмотр гайда')).getByRole('heading', { name: 'Раздел', level: 2 })).toBeVisible()
  })
})
