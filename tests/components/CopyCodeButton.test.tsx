import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen } from '@testing-library/react'

import { CopyCodeButton } from '@/components/guides/CopyCodeButton'

/** Нажатие и завершение промиса буфера обмена; таймеры поддельные, чтобы проверить возврат подписи. */
async function press() {
  await act(async () => {
    fireEvent.click(screen.getByRole('button'))
  })
}

beforeEach(() => {
  vi.useFakeTimers()
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

describe('кнопка копирования кода гайда', () => {
  it('копирует код и две секунды подтверждает это', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    render(<CopyCodeButton code={'docker compose up -d'} />)
    expect(screen.getByRole('button', { name: 'Копировать' })).toBeInTheDocument()

    await press()
    expect(writeText).toHaveBeenCalledWith('docker compose up -d')
    expect(screen.getByRole('button', { name: 'Скопировано' })).toBeInTheDocument()

    act(() => vi.advanceTimersByTime(1999))
    expect(screen.getByRole('button', { name: 'Скопировано' })).toBeInTheDocument()
    act(() => vi.advanceTimersByTime(1))
    expect(screen.getByRole('button', { name: 'Копировать' })).toBeInTheDocument()
  })

  it('отказ буфера обмена честно сообщает, что код не скопирован, и пишет причину в консоль', async () => {
    const error = new DOMException('Document is not focused', 'NotAllowedError')
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(error) } })
    const log = vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<CopyCodeButton code="ls" />)

    await press()
    expect(screen.getByRole('button', { name: 'Не удалось скопировать' })).toBeInTheDocument()
    expect(log).toHaveBeenCalledWith('Не удалось скопировать код гайда', error)

    act(() => vi.advanceTimersByTime(2000))
    expect(screen.getByRole('button', { name: 'Копировать' })).toBeInTheDocument()
  })

  it('без буфера обмена (страница не по HTTPS) не падает, а сообщает о неудаче', async () => {
    vi.stubGlobal('navigator', {})
    vi.spyOn(console, 'error').mockImplementation(() => {})
    render(<CopyCodeButton code="ls" />)

    await press()
    expect(screen.getByRole('button', { name: 'Не удалось скопировать' })).toBeInTheDocument()
  })

  it('результат объявляется экранному диктору', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockResolvedValue(undefined) } })
    render(<CopyCodeButton code="ls" />)
    await press()
    expect(screen.getByText('Скопировано')).toHaveAttribute('aria-live', 'polite')
  })
})
