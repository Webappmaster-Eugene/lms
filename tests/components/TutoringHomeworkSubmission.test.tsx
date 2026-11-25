import { render, screen } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { describe, expect, it, vi } from 'vitest'

import { HomeworkSubmission } from '@/components/tutoring/HomeworkSubmission'

const first = { iid: 11, title: 'Заказы в PostgreSQL', url: 'https://git.test/student/-/merge_requests/11' }
const second = { iid: 12, title: 'Проверка брони', url: 'https://git.test/student/-/merge_requests/12' }

describe('сдача работы в кабинете ученика', () => {
  it('подставляет единственную подходящую работу, отправляет только по нажатию', async () => {
    const send = vi.fn()
    render(<HomeworkSubmission works={[first]} action={send} />)
    expect(screen.getByRole('link', { name: /Заказы в PostgreSQL/ })).toHaveAttribute('href', first.url)
    expect(send).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Сдать работу' }))
    expect(send).toHaveBeenCalledTimes(1)
    expect(send.mock.calls[0][0].get('submission')).toBe(first.url)
  })

  it('предлагает выбрать при нескольких работах и сохраняет ввод вручную', async () => {
    const send = vi.fn()
    render(<HomeworkSubmission works={[first, second]} action={send} />)
    await userEvent.click(screen.getByRole('button', { name: 'Сдать работу' }))
    expect(send).not.toHaveBeenCalled()
    await userEvent.selectOptions(screen.getByRole('combobox'), second.url)
    await userEvent.click(screen.getByRole('button', { name: 'Сдать работу' }))
    expect(send.mock.calls[0][0].get('submission')).toBe(second.url)
    await userEvent.click(screen.getByText('Указать ссылку вручную'))
    const manual = screen.getByRole('textbox', { name: 'Ссылка на работу' })
    await userEvent.type(manual, first.url)
    await userEvent.click(screen.getByRole('button', { name: 'Сдать по ссылке' }))
    expect(send.mock.calls[1][0].get('submission')).toBe(first.url)
  })

  it('сохраняет прежний MR при доработке даже при появлении другого варианта', async () => {
    const send = vi.fn()
    render(<HomeworkSubmission works={[second]} action={send} previousUrl={first.url} />)
    expect(screen.queryByRole('textbox')).toBeNull()
    await userEvent.click(screen.getByRole('button', { name: 'Сдать исправление' }))
    expect(send.mock.calls[0][0].get('submission')).toBe(first.url)
  })
})
