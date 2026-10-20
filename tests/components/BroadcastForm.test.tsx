import { cleanup, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

import { BroadcastActions } from '@/components/broadcasts/BroadcastActions'
import { BroadcastForm } from '@/components/broadcasts/BroadcastForm'

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))

let api: ReturnType<typeof vi.fn>

beforeEach(() => {
  api = vi.fn(async (path: string, init?: RequestInit) => {
    if (path.startsWith('/api/manage/learning-access')) {
      return Response.json({ docs: [{ id: 7, title: 'Мария Иванова (maria@lms.test)' }, { id: 8, title: 'Пётр Петров (petr@lms.test)' }], hasNextPage: false })
    }
    if (path === '/api/manage/broadcasts' && init?.method === 'POST') return Response.json({ doc: { id: 41 } }, { status: 201 })
    if (path.endsWith('/send')) return Response.json({ error: 'Рассылка уже запущена' }, { status: 409 })
    return Response.json({ ok: true })
  })
  vi.stubGlobal('fetch', api)
})

afterEach(() => {
  cleanup()
  vi.unstubAllGlobals()
  vi.clearAllMocks()
})

describe('форма рассылки', () => {
  it('показывает размер аудитории и сохраняет черновик для выбранных учеников', async () => {
    const user = userEvent.setup()
    render(<BroadcastForm allStudents={{ recipients: 120, excluded: 3 }} />)
    expect(screen.getByText('Сейчас получат: 120. Не получат (отписались или без адреса): 3')).toBeInTheDocument()

    await user.type(screen.getByRole('textbox', { name: 'Тема письма' }), 'Новый курс')
    await user.type(screen.getByRole('textbox', { name: 'Текст письма' }), 'Курс уже на платформе')
    await user.click(screen.getByRole('radio', { name: /Выбранные ученики/ }))
    await user.click((await screen.findAllByRole('button', { name: /Добавить/ }))[0] as HTMLElement)
    expect(screen.getByRole('list', { name: 'Выбранные ученики' })).toHaveTextContent('Мария Иванова')

    await user.click(screen.getByRole('button', { name: 'Создать черновик' }))
    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/manage/broadcasts/41'))
    const request = api.mock.calls.find(([path, init]) => path === '/api/manage/broadcasts' && init?.method === 'POST')
    expect(JSON.parse(String(request?.[1]?.body))).toEqual({ subject: 'Новый курс', body: 'Курс уже на платформе', ctaLabel: null, ctaUrl: null, audience: 'selected', recipients: [7] })
  })

  it('не отправляет пустой список выбранных учеников', async () => {
    const user = userEvent.setup()
    render(<BroadcastForm allStudents={{ recipients: 1, excluded: 0 }} />)
    await user.type(screen.getByRole('textbox', { name: 'Тема письма' }), 'Тема')
    await user.type(screen.getByRole('textbox', { name: 'Текст письма' }), 'Текст')
    await user.click(screen.getByRole('radio', { name: /Выбранные ученики/ }))
    await user.click(screen.getByRole('button', { name: 'Создать черновик' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Выберите хотя бы одного ученика')
    expect(api.mock.calls.some(([path]) => path === '/api/manage/broadcasts')).toBe(false)
  })
})

describe('действия с рассылкой', () => {
  it('запуск требует подтверждения и показывает ошибку сервера', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    render(<BroadcastActions id={5} status="draft" estimatedRecipients={12} adminEmail="admin@lms.test" transportReady />)
    await user.click(screen.getByRole('button', { name: 'Запустить рассылку' }))
    expect(api).not.toHaveBeenCalled()
    await user.click(screen.getByRole('button', { name: 'Запустить рассылку' }))
    expect(confirm).toHaveBeenLastCalledWith(expect.stringContaining('Получателей примерно: 12'))
    expect(await screen.findByRole('alert')).toHaveTextContent('Рассылка уже запущена')
  })

  it('без почты на сервере запуск и тест недоступны', () => {
    render(<BroadcastActions id={5} status="draft" estimatedRecipients={12} adminEmail="admin@lms.test" transportReady={false} />)
    expect(screen.getByRole('button', { name: 'Запустить рассылку' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Отправить тест себе' })).toBeDisabled()
  })

  it('во время отправки можно только остановить и отправить тест', () => {
    render(<BroadcastActions id={5} status="sending" estimatedRecipients={12} adminEmail="admin@lms.test" transportReady />)
    expect(screen.getByRole('button', { name: 'Остановить' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Запустить рассылку' })).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Редактировать' })).not.toBeInTheDocument()
  })
})
