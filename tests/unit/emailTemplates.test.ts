import { afterEach, describe, expect, it, vi } from 'vitest'

import {
  achievementUnlockedEmail,
  courseCompletedEmail,
  inviteEmail,
  passwordSetupUrl,
  resetPasswordEmail,
  roadmapCompletedEmail,
} from '@/payload/emails/templates'

/**
 * Письма ученикам. Текстовая часть обязательна: без неё спам-фильтры Mail.ru
 * и Gmail заметно штрафуют письмо.
 */

const ALL_TEMPLATES = [
  ['приглашение', () => inviteEmail('Алексей', 'a@m.ru', 'tok')],
  ['сброс пароля', () => resetPasswordEmail('Алексей', 'tok')],
  ['курс завершён', () => courseCompletedEmail('Алексей', 'Глубокий React', 50)],
  ['роадмап завершён', () => roadmapCompletedEmail('Алексей', 'Frontend React', 200)],
  ['достижение', () => achievementUnlockedEmail('Алексей', 'Практик', 'Решено 10 задач', 30)],
] as const

describe('письма: общие требования', () => {
  it.each(ALL_TEMPLATES)('%s — есть тема, html и текстовая часть', (_name, build) => {
    const { subject, html, text } = build()

    expect(subject.trim().length).toBeGreaterThan(0)
    expect(html).toContain('<!DOCTYPE html>')
    expect(text.trim().length, 'без text письмо штрафуется спам-фильтрами').toBeGreaterThan(0)
  })

  it.each(ALL_TEMPLATES)('%s — html закрыт корректно', (_name, build) => {
    expect(build().html.trimEnd().endsWith('</html>')).toBe(true)
  })
})

describe('ссылка на установку пароля', () => {
  afterEach(() => {
    vi.unstubAllEnvs()
    vi.resetModules()
  })

  it('ведёт на страницу сброса и несёт токен', () => {
    expect(passwordSetupUrl('abc123')).toContain('/reset-password?token=abc123')
  })

  it('токен со спецсимволами кодируется — иначе ссылка обрывается', () => {
    const url = passwordSetupUrl('a+b/c=d&e')

    expect(url).toContain('token=a%2Bb%2Fc%3Dd%26e')
    expect(url).not.toContain('&e')
  })

  it('берёт адрес из окружения', async () => {
    vi.stubEnv('NEXT_PUBLIC_SERVER_URL', 'https://learn.mentorcareer.ru')
    vi.resetModules()
    const templates = await import('@/payload/emails/templates')

    expect(templates.passwordSetupUrl('t')).toBe(
      'https://learn.mentorcareer.ru/reset-password?token=t',
    )
  })

  it('лишние слеши в адресе не дают двойной // в ссылке', async () => {
    vi.stubEnv('NEXT_PUBLIC_SERVER_URL', 'https://learn.mentorcareer.ru///')
    vi.resetModules()
    const templates = await import('@/payload/emails/templates')

    expect(templates.passwordSetupUrl('t')).toBe(
      'https://learn.mentorcareer.ru/reset-password?token=t',
    )
  })
})

describe('приглашение', () => {
  it('сообщает логин и ведёт на установку пароля', () => {
    const { html, text } = inviteEmail('Алексей', 'student@mail.ru', 'tok-1')

    expect(html).toContain('student@mail.ru')
    expect(html).toContain('/reset-password?token=tok-1')
    expect(text).toContain('student@mail.ru')
    expect(text).toContain('/reset-password?token=tok-1')
  })

  it('пароль в письме не передаётся', () => {
    const { html, text } = inviteEmail('Алексей', 'student@mail.ru', 'tok-1')

    expect(html.toLowerCase()).not.toContain('пароль:')
    expect(text.toLowerCase()).not.toContain('пароль:')
  })

  it('срок жизни ссылки назван — иначе просроченный токен выглядит поломкой', () => {
    const { html, text } = inviteEmail('Алексей', 'student@mail.ru', 'tok-1')

    expect(html).toContain('7 дней')
    expect(text).toContain('7 дней')
  })

  it('есть запасная ссылка текстом — часть клиентов режет кнопки-таблицы', () => {
    const { html } = inviteEmail('Алексей', 'student@mail.ru', 'tok-1')

    const occurrences = html.split('/reset-password?token=tok-1').length - 1
    expect(occurrences).toBeGreaterThanOrEqual(2)
  })
})

describe('обращение по имени', () => {
  it('имя подставляется', () => {
    expect(inviteEmail('Алексей', 'a@m.ru', 't').html).toContain('Алексей')
  })

  it.each(['', '   '])('без имени письмо остаётся вежливым (имя: %j)', (name) => {
    const { html, text } = inviteEmail(name, 'a@m.ru', 't')

    expect(html).toContain('Здравствуйте!')
    expect(text).toContain('Здравствуйте!')
  })
})

describe('экранирование данных из CMS и профиля', () => {
  const XSS = '<script>alert(1)</script>'

  it('имя пользователя не попадает в html как разметка', () => {
    const { html } = inviteEmail(XSS, 'a@m.ru', 't')

    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('почта экранируется', () => {
    const { html } = inviteEmail('Алексей', 'a"><b>@m.ru', 't')

    expect(html).not.toContain('"><b>')
    expect(html).toContain('&quot;')
  })

  it('название курса экранируется', () => {
    const { html } = courseCompletedEmail('Алексей', XSS, 50)

    expect(html).not.toContain('<script>')
    expect(html).toContain('&lt;script&gt;')
  })

  it('название и описание достижения экранируются', () => {
    const { html } = achievementUnlockedEmail('Алексей', XSS, XSS, 10)

    expect(html).not.toContain('<script>')
    expect(html.match(/&lt;script&gt;/g) ?? []).toHaveLength(2)
  })

  it('в текстовой части разметки нет по определению — она уходит как есть', () => {
    expect(courseCompletedEmail('Алексей', 'C++ и STL', 50).text).toContain('C++ и STL')
  })
})

describe('баллы в письме', () => {
  it('начисление показывается, когда оно есть', () => {
    expect(courseCompletedEmail('Алексей', 'Курс', 50).html).toContain('50')
    expect(achievementUnlockedEmail('Алексей', 'Практик', 'описание', 30).html).toContain('30')
  })

  it('нулевой бонус за достижение не показывается', () => {
    const { html } = achievementUnlockedEmail('Алексей', 'Практик', 'описание', 0)

    expect(html).not.toContain('Бонус:')
  })
})

describe('темы писем различимы в списке входящих', () => {
  it('в теме есть название курса или достижения', () => {
    expect(courseCompletedEmail('А', 'Глубокий React', 50).subject).toContain('Глубокий React')
    expect(roadmapCompletedEmail('А', 'Frontend React', 200).subject).toContain('Frontend React')
    expect(achievementUnlockedEmail('А', 'Практик', 'd', 10).subject).toContain('Практик')
  })

  it('темы разных писем не совпадают', () => {
    const subjects = ALL_TEMPLATES.map(([, build]) => build().subject)

    expect(new Set(subjects).size).toBe(subjects.length)
  })
})
