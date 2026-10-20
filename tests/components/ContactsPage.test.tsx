import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('@/lib/site-settings', () => ({ readSiteContacts: async () => ({
  website: 'https://nadtocheev.ru/', telegramChannel: 'https://t.me/captain_galera',
  links: [
    { title: 'Женя вайбкодит', description: 'Задачи с собеседований', url: 'https://t.me/eugene_vibecode' },
    { title: 'Написать Евгению', url: 'https://t.me/eugene_nadtocheev' },
  ],
}) }))

import ContactsPage from '@/app/(frontend)/(lists)/contacts/page'

describe('контакты автора из CMS', () => {
  it('показывает сайт, основной канал и дополнительные контакты с различимыми ссылками', async () => {
    render(await ContactsPage())
    expect(screen.getByRole('link', { name: 'Перейти: Веб-сайт' })).toHaveAttribute('href', 'https://nadtocheev.ru/')
    expect(screen.getByRole('link', { name: 'Подписаться: Telegram-канал' })).toHaveAttribute('href', 'https://t.me/captain_galera')
    const channel = screen.getByRole('link', { name: 'Открыть в Telegram: Женя вайбкодит' })
    expect(channel).toHaveAttribute('href', 'https://t.me/eugene_vibecode')
    expect(channel).toHaveAttribute('rel', 'noopener noreferrer')
    expect(screen.getByRole('link', { name: 'Открыть в Telegram: Написать Евгению' })).toHaveAttribute('href', 'https://t.me/eugene_nadtocheev')
  })

  it('ведёт в чат учеников и открывает почту поддержки на месте', async () => {
    const settings = await import('@/lib/site-settings')
    vi.spyOn(settings, 'readSiteContacts').mockResolvedValueOnce({ telegramGroup: 'https://t.me/+h3m2mocKtJI0Yzcy', email: 'support@mentorcareer.ru' })
    render(await ContactsPage())
    const group = screen.getByRole('link', { name: 'Вступить в группу: Чат учеников в Telegram' })
    expect(group).toHaveAttribute('href', 'https://t.me/+h3m2mocKtJI0Yzcy')
    expect(group).toHaveAttribute('target', '_blank')
    const mail = screen.getByRole('link', { name: 'support@mentorcareer.ru: Почта поддержки' })
    expect(mail).toHaveAttribute('href', 'mailto:support@mentorcareer.ru')
    expect(mail).not.toHaveAttribute('target')
  })
})
