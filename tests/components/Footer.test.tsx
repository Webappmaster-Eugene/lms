import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/link', async () => (await import('../helpers/component-mocks')).linkMock())

const findGlobal = vi.fn()
vi.mock('@/lib/payload', () => ({ getPayload: async () => ({ findGlobal }) }))

const { Footer } = await import('@/components/layout/Footer')

const CONTACTS = {
  telegramChannel: 'https://t.me/eugene_nadtocheev',
  telegramGroup: 'https://t.me/mentorcareer_chat',
  website: 'https://promo.mentorcareer.ru',
  email: 'support@mentorcareer.ru',
}

/** Подвал виден на каждой странице платформы, включая неавторизованные ошибки. */

describe('подвал платформы', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    findGlobal.mockResolvedValue({ contacts: CONTACTS })
  })

  it('ведёт на сайт автора с указанием авторства', async () => {
    render(await Footer())

    const link = screen.getByRole('link', { name: 'Евгений Надточеев' })
    expect(link).toHaveAttribute('href', 'https://nadtocheev.ru')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
  })

  it('повторяет навигацию по разделам', async () => {
    render(await Footer())

    expect(screen.getByRole('link', { name: 'Курсы' })).toHaveAttribute('href', '/courses')
    expect(screen.getByRole('link', { name: 'Тренажёр' })).toHaveAttribute('href', '/trainer')
    expect(screen.getByRole('link', { name: 'Сертификаты' })).toHaveAttribute(
      'href',
      '/certificates',
    )
  })

  it('берёт контакты из CMS, а не из вёрстки', async () => {
    render(await Footer())

    expect(screen.getByRole('link', { name: 'Telegram-канал' })).toHaveAttribute(
      'href',
      CONTACTS.telegramChannel,
    )
    expect(screen.getByRole('link', { name: CONTACTS.email })).toHaveAttribute(
      'href',
      `mailto:${CONTACTS.email}`,
    )
  })

  it('внешние ссылки открываются в новой вкладке, почта — нет', async () => {
    render(await Footer())

    expect(screen.getByRole('link', { name: 'Telegram-канал' })).toHaveAttribute(
      'target',
      '_blank',
    )
    expect(screen.getByRole('link', { name: CONTACTS.email })).not.toHaveAttribute('target')
  })

  it('без контактов в CMS остаётся авторство и навигация', async () => {
    findGlobal.mockResolvedValue({})
    render(await Footer())

    expect(screen.getByRole('link', { name: 'Евгений Надточеев' })).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Курсы' })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Telegram-канал' })).not.toBeInTheDocument()
  })

  it('недоступная CMS не роняет страницу, а пишет причину в лог', async () => {
    const error = vi.spyOn(console, 'error').mockImplementation(() => {})
    findGlobal.mockRejectedValue(new Error('нет соединения с БД'))

    render(await Footer())

    expect(screen.getByRole('link', { name: 'Евгений Надточеев' })).toBeInTheDocument()
    expect(error).toHaveBeenCalledWith(
      expect.stringContaining('site-settings'),
      expect.any(Error),
    )
    error.mockRestore()
  })

  it('навигация разделена на два блока с разными подписями', async () => {
    render(await Footer())

    expect(screen.getByRole('navigation', { name: 'Разделы платформы' })).toBeInTheDocument()
    expect(
      screen.getByRole('navigation', { name: 'Контакты и внешние ссылки' }),
    ).toBeInTheDocument()
  })
})
