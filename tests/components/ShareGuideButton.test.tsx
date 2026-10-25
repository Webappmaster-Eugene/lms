import { afterEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import { ShareGuideButton } from '@/components/guides/ShareGuideButton'

afterEach(() => vi.unstubAllGlobals())

describe('поделиться гайдом', () => {
  it('копирует прямую ссылку без query и якоря, если системная отправка недоступна', async () => {
    const writeText = vi.fn().mockResolvedValue(undefined)
    vi.stubGlobal('navigator', { clipboard: { writeText } })
    window.history.replaceState({}, '', '/guides/harness-maintenance?source=chat#section-2')
    render(<ShareGuideButton title="Гайд" />)
    fireEvent.click(screen.getByRole('button', { name: 'Поделиться' }))
    await waitFor(() => expect(writeText).toHaveBeenCalledWith(`${window.location.origin}/guides/harness-maintenance`))
    expect(await screen.findByRole('status')).toHaveTextContent('Ссылка скопирована')
  })

  it('системная отправка получает название и URL; отмена не показывает ошибку', async () => {
    const share = vi.fn().mockRejectedValue(new DOMException('Cancelled', 'AbortError'))
    vi.stubGlobal('navigator', { share })
    render(<ShareGuideButton title="Обслуживание харнесса" />)
    fireEvent.click(screen.getByRole('button', { name: 'Поделиться' }))
    await waitFor(() => expect(share).toHaveBeenCalledWith({ title: 'Обслуживание харнесса', url: `${window.location.origin}${window.location.pathname}` }))
    expect(screen.getByRole('status')).toBeEmptyDOMElement()
  })

  it('отказ буфера обмена даёт понятный запасной способ', async () => {
    vi.stubGlobal('navigator', { clipboard: { writeText: vi.fn().mockRejectedValue(new Error('Denied')) } })
    render(<ShareGuideButton title="Гайд" />)
    fireEvent.click(screen.getByRole('button', { name: 'Поделиться' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('Скопируйте ссылку из адресной строки'))
  })
})
