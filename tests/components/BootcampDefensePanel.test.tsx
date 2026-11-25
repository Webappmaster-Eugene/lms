import type { ButtonHTMLAttributes } from 'react'
import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, describe, expect, it, vi } from 'vitest'

vi.mock('@payloadcms/ui', () => ({
  Button: ({ children, onClick, disabled }: ButtonHTMLAttributes<HTMLButtonElement>) => <button type="button" onClick={onClick} disabled={disabled}>{children}</button>,
}))
const { DefensePanel } = await import('@/components/bootcamp/DefensePanel')

describe('защита в карточке зачисления', () => {
  afterEach(() => vi.unstubAllGlobals())

  it('наставник сохраняет результат с разбором и сразу видит его в карточке', async () => {
    const url = 'https://review.test/project'
    const fetch = vi.fn().mockResolvedValue(Response.json({ outcome: 'passed', url, recordedAt: '2026-11-25T09:21:00.000Z' }))
    vi.stubGlobal('fetch', fetch)
    render(<DefensePanel enrollment={19} initial={null} />)
    const save = screen.getByRole('button', { name: 'Сохранить результат защиты' })
    expect(save).toBeDisabled()
    await userEvent.selectOptions(screen.getByLabelText('Результат'), 'passed')
    await userEvent.type(screen.getByLabelText('Ссылка на разбор'), url)
    await userEvent.click(save)
    expect(await screen.findByRole('link', { name: 'Открыть разбор' })).toHaveAttribute('href', url)
    expect(fetch.mock.calls[0][0]).toBe('/api/bootcamp/enrollments/19/defense')
    expect(JSON.parse(fetch.mock.calls[0][1].body)).toEqual({ outcome: 'passed', url, revision: '' })
    expect(save).toBeDisabled()
  })

  it('при устаревшей форме сохраняет введенную ссылку и показывает ответ сервера', async () => {
    vi.stubGlobal('fetch', vi.fn().mockResolvedValue(Response.json({ error: 'Обновите карточку защиты' }, { status: 409 })))
    render(<DefensePanel enrollment={19} initial={{ outcome: 'revise', url: 'https://review.test/old', recordedAt: '2026-11-25T09:00:00.000Z' }} />)
    const input = screen.getByLabelText('Ссылка на разбор')
    await userEvent.clear(input)
    await userEvent.type(input, 'https://review.test/new')
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить результат защиты' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Обновите карточку защиты')
    expect(input).toHaveValue('https://review.test/new')
  })
})
