import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { ShareButton } from '@/components/ui/ShareButton'

beforeEach(() => {
  window.history.replaceState(null, '', '/lessons/demo?video=clip:abcd&t=373&rate=1.5&password=secret')
  Object.defineProperty(navigator, 'share', { configurable: true, value: undefined })
})
describe('кнопка общей ссылки', () => {
  it('копирует безопасную ссылку на конкретный фрагмент', async () => {
    const user = userEvent.setup()
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    render(<ShareButton />)
    await user.click(screen.getByRole('button', { name: 'Поделиться ссылкой' }))
    expect(write).toHaveBeenCalledWith(`${window.location.origin}/lessons/demo?video=clip%3Aabcd&t=373&rate=1.5`)
    expect(screen.getByRole('status')).toHaveTextContent('Ссылка скопирована')
  })
  it('использует нативное меню отправки на телефоне', async () => {
    const share = vi.fn().mockResolvedValue(undefined)
    Object.defineProperty(navigator, 'share', { configurable: true, value: share })
    render(<ShareButton title="Урок" />)
    await userEvent.click(screen.getByRole('button'))
    expect(share).toHaveBeenCalledWith({ title: 'Урок', url: `${window.location.origin}/lessons/demo?video=clip%3Aabcd&t=373&rate=1.5` })
  })
  it('при недоступном буфере предлагает выделить и скопировать ссылку', async () => {
    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('blocked'))
    render(<ShareButton />)
    await user.click(screen.getByRole('button'))
    expect(screen.getByRole('textbox', { name: 'Ссылка для копирования' })).not.toHaveValue(expect.stringContaining('password'))
    expect(screen.getByRole('status')).toHaveTextContent('Выделите и скопируйте ссылку')
  })
})
