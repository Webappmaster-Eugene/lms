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
  it('ссылку в админку или API не отправляет и объясняет почему', async () => {
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    render(<ShareButton getHref={() => '/admin/collections/users/34'} />)
    await userEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('status')).toHaveTextContent('Ссылку на эту страницу отправить нельзя')
    expect(write).not.toHaveBeenCalled()
  })
  // В браузере DOMException наследует Error, в jsdom — нет; поэтому отказ меню имитирует Error с тем же именем.
  const shareError = (name: string) => Object.assign(new Error(name), { name })
  it('закрытое без выбора системное меню ничего не копирует и не пишет', async () => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: vi.fn().mockRejectedValue(shareError('AbortError')) })
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    render(<ShareButton />)
    await userEvent.click(screen.getByRole('button'))
    expect(write).not.toHaveBeenCalled()
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })
  it('если системное меню недоступно, копирует ссылку в буфер', async () => {
    Object.defineProperty(navigator, 'share', { configurable: true, value: vi.fn().mockRejectedValue(shareError('NotAllowedError')) })
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    render(<ShareButton getHref={() => '/courses?q=node'} />)
    await userEvent.click(screen.getByRole('button'))
    expect(write).toHaveBeenCalledWith(`${window.location.origin}/courses?q=node`)
    expect(screen.getByRole('status')).toHaveTextContent('Ссылка скопирована')
  })
  it('без API буфера показывает ссылку, которая выделяется целиком при фокусе', async () => {
    const clipboard = Object.getOwnPropertyDescriptor(navigator, 'clipboard')
    Object.defineProperty(navigator, 'clipboard', { configurable: true, value: undefined })
    try {
      render(<ShareButton getHref={() => '/courses'} label="Поделиться каталогом" />)
      await userEvent.click(screen.getByRole('button', { name: 'Поделиться каталогом' }))
      const field = screen.getByRole<HTMLInputElement>('textbox', { name: 'Ссылка для копирования' })
      expect(field).toHaveValue(`${window.location.origin}/courses`)
      field.focus()
      expect([field.selectionStart, field.selectionEnd]).toEqual([0, field.value.length])
    } finally {
      if (clipboard) Object.defineProperty(navigator, 'clipboard', clipboard)
      else Reflect.deleteProperty(navigator, 'clipboard')
    }
  })
  it('повторное нажатие убирает прошлое сообщение и поле ручного копирования', async () => {
    const write = vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValueOnce(new Error('blocked')).mockResolvedValueOnce()
    render(<ShareButton />)
    await userEvent.click(screen.getByRole('button'))
    expect(screen.getByRole('textbox', { name: 'Ссылка для копирования' })).toBeInTheDocument()
    await userEvent.click(screen.getByRole('button'))
    expect(write).toHaveBeenCalledTimes(2)
    expect(screen.queryByRole('textbox', { name: 'Ссылка для копирования' })).not.toBeInTheDocument()
    expect(screen.getByRole('status')).toHaveTextContent('Ссылка скопирована')
  })
})
