import { describe, expect, it } from 'vitest'
import { act, render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { KeyboardShortcuts, SHORTCUTS_OPEN_EVENT } from '@/components/layout/KeyboardShortcuts'

describe('подсказка по горячим клавишам', () => {
  it('не предлагает команды закрытого тренажёра', async () => {
    render(<KeyboardShortcuts trainerEnabled={false} />)
    await userEvent.keyboard('?')
    const dialog = screen.getByRole('dialog', { name: 'Горячие клавиши' })
    expect(dialog).toHaveTextContent('Поиск по курсам и урокам')
    expect(dialog).not.toHaveTextContent('Тренажёр')
    expect(dialog).not.toHaveTextContent('Отправить на проверку')
  })

  it('«?» открывает список, Esc закрывает', async () => {
    const user = userEvent.setup()
    render(<KeyboardShortcuts />)

    await user.keyboard('?')
    const dialog = screen.getByRole('dialog', { name: 'Горячие клавиши' })
    expect(dialog).toHaveTextContent('Предыдущий и следующий урок')
    expect(dialog).toHaveTextContent('Отправить на проверку')
    expect(screen.getByRole('button', { name: 'Закрыть' })).toHaveFocus()

    await user.keyboard('{Escape}')
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })

  it('«?» в поле ввода — просто символ', async () => {
    const user = userEvent.setup()
    render(
      <>
        <textarea aria-label="Вопрос" />
        <KeyboardShortcuts />
      </>,
    )

    await user.type(screen.getByRole('textbox', { name: 'Вопрос' }), 'Почему?')

    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Вопрос' })).toHaveValue('Почему?')
  })

  it('открывается кнопкой из меню и закрывается кликом мимо', async () => {
    const user = userEvent.setup()
    render(<KeyboardShortcuts />)

    act(() => void window.dispatchEvent(new CustomEvent(SHORTCUTS_OPEN_EVENT)))
    expect(screen.getByRole('dialog')).toBeInTheDocument()

    await user.click(screen.getByRole('dialog').parentElement as HTMLElement)
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
  })
})
