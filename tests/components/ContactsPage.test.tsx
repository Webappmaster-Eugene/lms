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
})
