import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'

import { ProfileSettings } from '@/components/profile/ProfileSettings'
import type { ProfileDTO } from '@/lib/profile'

const { refresh, setTheme } = vi.hoisted(() => ({ refresh: vi.fn(), setTheme: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => ({ refresh }) }))
vi.mock('next-themes', () => ({ useTheme: () => ({ theme: 'system', setTheme }) }))

const profile: ProfileDTO = { id: 7, firstName: 'Анна', lastName: 'Смирнова', email: 'anna@example.com', telegram: 'https://t.me/annasm', bio: 'Учусь React', avatar: { id: 9, url: '/api/media/file/avatar.png', alt: null } }
const fetchMock = vi.fn<typeof fetch>()
const revokeUrl = vi.fn()
function response(data: unknown, status = 200) { return new Response(JSON.stringify(data), { status, headers: { 'Content-Type': 'application/json' } }) }
async function openForm() {
  render(<ProfileSettings />)
  await screen.findByRole('form', { name: 'Личные данные' })
}
function edit(label: string, value: string) { fireEvent.change(screen.getByLabelText(label), { target: { value } }) }
function fillPasswords(confirmation = 'Secureword123') {
  edit('Текущий пароль', 'Oldword1234')
  edit('Новый пароль', 'Secureword123')
  edit('Повторите новый пароль', confirmation)
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.stubGlobal('fetch', fetchMock)
  fetchMock.mockReset().mockImplementation(async () => response({ profile }))
  vi.stubGlobal('URL', Object.assign(URL, { createObjectURL: vi.fn(() => 'blob:preview'), revokeObjectURL: revokeUrl }))
})

describe('Настройки профиля', () => {
  it('загружает приватный профиль, показывает контакты и ссылки на настройки', async () => {
    await openForm()
    expect(screen.getByLabelText('Имя')).toHaveValue('Анна')
    expect(screen.getByLabelText('Telegram')).toHaveValue('https://t.me/annasm')
    expect(screen.getByAltText('Ваш аватар')).toHaveAttribute('src', '/api/media/file/avatar.png')
    expect(screen.getByRole('link', { name: 'Настроить уведомления' })).toHaveAttribute('href', '/settings/notifications')
    expect(screen.getByRole('link', { name: 'Установить приложение' })).toHaveAttribute('href', '/settings/app')
    expect(fetchMock).toHaveBeenCalledWith('/api/profile', expect.objectContaining({ cache: 'no-store', signal: expect.any(AbortSignal) }))
  })

  it('при ошибке загрузки не показывает пустую форму и позволяет повторить', async () => {
    fetchMock.mockResolvedValueOnce(response({ error: 'Нет соединения' }, 503))
    render(<ProfileSettings />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Нет соединения')
    expect(screen.queryByLabelText('Имя')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Повторить загрузку' }))
    expect(await screen.findByLabelText('Имя')).toHaveValue('Анна')
  })

  it('сохраняет только редактируемые поля, нормализует Telegram и обновляет шапку без ухода со страницы', async () => {
    await openForm()
    edit('Имя', 'Мария')
    edit('Telegram', '@mariasm')
    fetchMock.mockResolvedValueOnce(response({ profile: { ...profile, firstName: 'Мария', telegram: 'https://t.me/mariasm' } }))
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить профиль' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Профиль сохранён.')
    const options = fetchMock.mock.calls[1]?.[1]
    expect(JSON.parse(String(options?.body))).toEqual({ firstName: 'Мария', lastName: 'Смирнова', email: 'anna@example.com', telegram: 'https://t.me/mariasm', bio: 'Учусь React' })
    expect(refresh).toHaveBeenCalledTimes(1)
    edit('Имя', 'Анна')
    expect(screen.queryByText('Профиль сохранён.')).not.toBeInTheDocument()
  })

  it('смена e-mail требует текущий пароль и сохраняет новый адрес для входа', async () => {
    await openForm()
    edit('E-mail для входа', 'new@example.com')
    expect(screen.getByLabelText('Текущий пароль для смены e-mail')).toBeRequired()
    edit('Текущий пароль для смены e-mail', 'Oldword1234')
    fetchMock.mockResolvedValueOnce(response({ profile: { ...profile, email: 'new@example.com' } }))
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить профиль' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Для следующего входа используйте новый e-mail')
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({ currentPassword: 'Oldword1234', email: 'new@example.com' })
    expect(screen.queryByLabelText('Текущий пароль для смены e-mail')).not.toBeInTheDocument()
  })

  it('оставляет введённые поля при отказе сервера и позволяет повторить', async () => {
    await openForm()
    edit('Имя', 'Мария')
    fetchMock.mockResolvedValueOnce(response({ error: 'E-mail уже занят' }, 409))
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить профиль' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('E-mail уже занят')
    expect(screen.getByLabelText('Имя')).toHaveValue('Мария')
    expect(screen.getByRole('button', { name: 'Сохранить профиль' })).toBeEnabled()
    expect(refresh).not.toHaveBeenCalled()
  })

  it('не отправляет небезопасную ссылку Telegram', async () => {
    await openForm()
    edit('Telegram', 'javascript:alert(1)')
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить профиль' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Укажите Telegram в формате')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('удаление аватара передаёт явный null', async () => {
    await openForm()
    fireEvent.click(screen.getByRole('button', { name: 'Удалить аватар' }))
    expect(screen.queryByAltText('Ваш аватар')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить профиль' }))
    await screen.findByRole('status')
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toMatchObject({ avatar: null })
  })

  it('загружает выбранный файл один раз и повторяет только сохранение после ошибки', async () => {
    await openForm()
    const image = new File(['png'], 'photo.png', { type: 'image/png' })
    fireEvent.change(screen.getByLabelText('Изменить аватар'), { target: { files: [image] } })
    expect(screen.getByAltText('Ваш аватар')).toHaveAttribute('src', 'blob:preview')
    fetchMock.mockResolvedValueOnce(response({ doc: { id: 12 } })).mockResolvedValueOnce(response({ error: 'Попробуйте позже' }, 503))
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить профиль' }))
    await screen.findByRole('alert')
    const upload = fetchMock.mock.calls[1]?.[1]?.body
    expect(upload).toBeInstanceOf(FormData)
    expect((upload as FormData).get('file')).toBe(image)
    expect((upload as FormData).get('_payload')).toBe(JSON.stringify({ alt: 'Аватар пользователя' }))
    fetchMock.mockResolvedValueOnce(response({ profile: { ...profile, avatar: { id: 12, url: '/api/media/file/photo.png', alt: null } } }))
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить профиль' }))
    await screen.findByRole('status')
    expect(fetchMock.mock.calls.filter(([url]) => url === '/api/media')).toHaveLength(1)
    expect(JSON.parse(String(fetchMock.mock.calls[3]?.[1]?.body))).toMatchObject({ avatar: 12 })
    expect(revokeUrl).toHaveBeenCalledWith('blob:preview')
  })

  it.each([
    new File(['<svg/>'], 'photo.svg', { type: 'image/svg+xml' }),
    new File([new Uint8Array(2 * 1024 * 1024 + 1)], 'photo.png', { type: 'image/png' }),
  ])('после невалидного выбора сбрасывает предыдущий файл и не загружает его (%s)', async (invalid) => {
    await openForm()
    fireEvent.change(screen.getByLabelText('Изменить аватар'), { target: { files: [new File(['png'], 'old.png', { type: 'image/png' })] } })
    fireEvent.change(screen.getByLabelText('Изменить аватар'), { target: { files: [invalid] } })
    expect(screen.getByRole('alert')).toHaveTextContent('до 2 МБ')
    expect(screen.queryByText('Выбран файл: old.png')).not.toBeInTheDocument()
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить профиль' }))
    await screen.findByRole('status')
    expect(fetchMock.mock.calls.some(([url]) => url === '/api/media')).toBe(false)
    expect(revokeUrl).toHaveBeenCalledWith('blob:preview')
  })

  it('не отправляет несовпадающее подтверждение пароля', async () => {
    await openForm()
    fillPasswords('Different123')
    fireEvent.click(screen.getByRole('button', { name: 'Изменить пароль' }))
    expect(screen.getByRole('alert')).toHaveTextContent('не совпадают')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })

  it('показывает пароль по доступной кнопке и очищает пароли после успешной смены', async () => {
    await openForm()
    fillPasswords()
    fireEvent.click(screen.getByRole('button', { name: 'Показать: новый пароль' }))
    expect(screen.getByLabelText('Новый пароль')).toHaveAttribute('type', 'text')
    fetchMock.mockResolvedValueOnce(response({ ok: true }))
    fireEvent.click(screen.getByRole('button', { name: 'Изменить пароль' }))
    expect(await screen.findByRole('status')).toHaveTextContent('Пароль изменён')
    expect(fetchMock.mock.calls[1]?.[0]).toBe('/api/profile/password')
    expect(JSON.parse(String(fetchMock.mock.calls[1]?.[1]?.body))).toEqual({ currentPassword: 'Oldword1234', newPassword: 'Secureword123' })
    expect(screen.getByLabelText('Текущий пароль')).toHaveValue('')
    expect(screen.getByLabelText('Новый пароль')).toHaveValue('')
  })

  it('при ошибке смены пароля оставляет форму и не сообщает об успехе', async () => {
    await openForm()
    fillPasswords()
    fetchMock.mockResolvedValueOnce(response({ error: 'Неверный текущий пароль' }, 403))
    fireEvent.click(screen.getByRole('button', { name: 'Изменить пароль' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Неверный текущий пароль')
    expect(screen.getByLabelText('Новый пароль')).toHaveValue('Secureword123')
    expect(refresh).not.toHaveBeenCalled()
  })

  it('блокирует двойную отправку и смену пароля во время сохранения профиля', async () => {
    await openForm()
    let resolve: ((value: Response) => void) | undefined
    fetchMock.mockImplementationOnce(() => new Promise<Response>((done) => { resolve = done }))
    fireEvent.submit(screen.getByRole('form', { name: 'Личные данные' }))
    fireEvent.submit(screen.getByRole('form', { name: 'Личные данные' }))
    fireEvent.submit(screen.getByRole('form', { name: 'Смена пароля' }))
    expect(fetchMock).toHaveBeenCalledTimes(2)
    expect(screen.getByLabelText('Имя')).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Изменить пароль' })).toBeDisabled()
    resolve?.(response({ profile }))
    await waitFor(() => expect(screen.getByLabelText('Имя')).toBeEnabled())
  })

  it('не сообщает об изменении пароля при пустом успешном HTTP-ответе', async () => {
    await openForm()
    fillPasswords()
    fetchMock.mockResolvedValueOnce(response({}))
    fireEvent.click(screen.getByRole('button', { name: 'Изменить пароль' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось изменить пароль')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('объясняет сетевую ошибку по-русски и сохраняет введённые данные', async () => {
    await openForm()
    edit('О себе', 'Новый текст')
    fetchMock.mockRejectedValueOnce(new TypeError('Failed to fetch'))
    fireEvent.click(screen.getByRole('button', { name: 'Сохранить профиль' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Проверьте интернет')
    expect(screen.getByLabelText('О себе')).toHaveValue('Новый текст')
  })

  it('выбор темы применяется сразу в текущем браузере', async () => {
    await openForm()
    fireEvent.change(screen.getByLabelText('Тема оформления'), { target: { value: 'dark' } })
    expect(setTheme).toHaveBeenCalledWith('dark')
    expect(fetchMock).toHaveBeenCalledTimes(1)
  })
})
