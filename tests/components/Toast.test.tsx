import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { ToastProvider, useToast } from '@/components/ui/Toast'

/**
 * Всплывающие уведомления — общий примитив: через него сообщают об отказе
 * заметки, комментарии и импорта, поэтому ломается он сразу везде.
 */

function Trigger({ message, type }: { message: string; type?: 'success' | 'error' | 'info' }) {
  const { toast } = useToast()
  return <button onClick={() => toast(message, type)}>показать {message}</button>
}

function renderWithProvider(ui: React.ReactNode) {
  return render(<ToastProvider>{ui}</ToastProvider>)
}

describe('всплывающие уведомления', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
  })

  describe('показ', () => {
    it('сообщение появляется после вызова', async () => {
      const user = userEvent.setup()
      renderWithProvider(<Trigger message="Заметка сохранена" />)

      await user.click(screen.getByRole('button'))

      expect(screen.getByText('Заметка сохранена')).toBeInTheDocument()
    })

    it('до вызова на экране пусто', () => {
      renderWithProvider(<Trigger message="Заметка сохранена" />)

      expect(screen.queryByText('Заметка сохранена')).not.toBeInTheDocument()
    })

    it('несколько уведомлений показываются одновременно, а не затирают друг друга', async () => {
      const user = userEvent.setup()
      renderWithProvider(
        <>
          <Trigger message="Первое" />
          <Trigger message="Второе" />
        </>,
      )

      await user.click(screen.getByRole('button', { name: /Первое/ }))
      await user.click(screen.getByRole('button', { name: /Второе/ }))

      expect(screen.getByText('Первое')).toBeInTheDocument()
      expect(screen.getByText('Второе')).toBeInTheDocument()
    })

    it('одно и то же сообщение дважды даёт два уведомления', async () => {
      const user = userEvent.setup()
      renderWithProvider(<Trigger message="Сохранено" />)

      const trigger = screen.getByRole('button', { name: /показать/ })
      await user.click(trigger)
      await user.click(trigger)

      expect(screen.getAllByText('Сохранено')).toHaveLength(2)
    })
  })

  describe('вид по типу', () => {
    it.each([
      ['success', 'text-success'],
      ['error', 'text-destructive'],
      ['info', 'text-info'],
    ] as const)('тип %s оформляется отдельно', async (type, expectedClass) => {
      const user = userEvent.setup()
      const { container } = renderWithProvider(<Trigger message="Текст" type={type} />)

      await user.click(screen.getByRole('button', { name: /показать/ }))

      expect(container.querySelector(`.${expectedClass}`)).not.toBeNull()
    })

    it('без указания типа уведомление нейтральное', async () => {
      const user = userEvent.setup()
      const { container } = renderWithProvider(<Trigger message="Текст" />)

      await user.click(screen.getByRole('button', { name: /показать/ }))

      expect(container.querySelector('.text-info')).not.toBeNull()
    })
  })

  describe('исчезновение', () => {
    it('само пропадает через четыре секунды', async () => {
      const user = userEvent.setup()
      renderWithProvider(<Trigger message="Сохранено" />)

      await user.click(screen.getByRole('button'))
      expect(screen.getByText('Сохранено')).toBeInTheDocument()

      await act(async () => {
        vi.advanceTimersByTime(4000)
      })

      await waitFor(() => expect(screen.queryByText('Сохранено')).not.toBeInTheDocument())
    })

    it('до истечения срока остаётся на экране', async () => {
      const user = userEvent.setup()
      renderWithProvider(<Trigger message="Сохранено" />)

      await user.click(screen.getByRole('button'))

      await act(async () => {
        vi.advanceTimersByTime(3900)
      })

      expect(screen.getByText('Сохранено')).toBeInTheDocument()
    })

    it('закрывается вручную крестиком', async () => {
      const user = userEvent.setup()
      const { container } = renderWithProvider(<Trigger message="Сохранено" />)

      await user.click(screen.getByRole('button', { name: /показать/ }))
      const close = container.querySelectorAll('button')[1]
      await user.click(close)

      expect(screen.queryByText('Сохранено')).not.toBeInTheDocument()
    })

    it('закрытие одного не убирает остальные', async () => {
      const user = userEvent.setup()
      const { container } = renderWithProvider(
        <>
          <Trigger message="Первое" />
          <Trigger message="Второе" />
        </>,
      )

      await user.click(screen.getByRole('button', { name: /Первое/ }))
      await user.click(screen.getByRole('button', { name: /Второе/ }))

      const closeButtons = Array.from(container.querySelectorAll('button')).slice(2)
      await user.click(closeButtons[0])

      expect(screen.queryByText('Первое')).not.toBeInTheDocument()
      expect(screen.getByText('Второе')).toBeInTheDocument()
    })

    it('таймер каждого уведомления свой', async () => {
      const user = userEvent.setup()
      renderWithProvider(
        <>
          <Trigger message="Раннее" />
          <Trigger message="Позднее" />
        </>,
      )

      await user.click(screen.getByRole('button', { name: /Раннее/ }))
      await act(async () => {
        vi.advanceTimersByTime(2000)
      })
      await user.click(screen.getByRole('button', { name: /Позднее/ }))

      await act(async () => {
        vi.advanceTimersByTime(2100)
      })

      await waitFor(() => expect(screen.queryByText('Раннее')).not.toBeInTheDocument())
      expect(screen.getByText('Позднее')).toBeInTheDocument()
    })
  })

  describe('без провайдера', () => {
    it('вызов не роняет компонент — контекст по умолчанию пустой', async () => {
      const user = userEvent.setup()
      render(<Trigger message="Сохранено" />)

      await user.click(screen.getByRole('button'))

      expect(screen.queryByText('Сохранено')).not.toBeInTheDocument()
    })
  })
})
