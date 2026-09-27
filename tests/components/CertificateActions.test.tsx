import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'

import { CertificateActions } from '@/components/certificate/CertificateActions'

/** Сертификат показывают работодателю: его должно быть можно сохранить и переслать. */

describe('действия с сертификатом', () => {
  beforeEach(() => {
    vi.restoreAllMocks()
  })

  it('«Скачать PDF» открывает печать браузера', async () => {
    const print = vi.spyOn(window, 'print').mockImplementation(() => {})
    render(<CertificateActions />)

    await userEvent.click(screen.getByRole('button', { name: 'Скачать PDF' }))

    expect(print).toHaveBeenCalled()
  })

  it('ссылка копируется и это видно', async () => {
    const user = userEvent.setup()
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue()
    render(<CertificateActions />)

    await user.click(screen.getByRole('button', { name: 'Скопировать ссылку' }))

    expect(writeText).toHaveBeenCalledWith(window.location.href)
    expect(await screen.findByRole('button', { name: 'Ссылка скопирована' })).toBeInTheDocument()
  })

  it('сбой копирования объясняется, а не проглатывается', async () => {
    const user = userEvent.setup()
    vi.spyOn(console, 'error').mockImplementation(() => {})
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new Error('denied'))
    render(<CertificateActions />)

    await user.click(screen.getByRole('button', { name: 'Скопировать ссылку' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось скопировать')
  })
})
