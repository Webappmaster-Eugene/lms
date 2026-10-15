import { describe, expect, it } from 'vitest'
import nodemailer from 'nodemailer'
import { registerTextAlternative } from '@/payload/email/textAlternative'
import { inviteEmail, resetPasswordEmail } from '@/payload/emails/templates'

function transport() {
  const instance = nodemailer.createTransport({ streamTransport: true, buffer: true, newline: 'unix' })
  registerTextAlternative(instance)
  return instance
}

describe('текстовая версия настоящего MIME-письма', () => {
  it('HTML-only запрос Payload превращается в multipart с рабочей ссылкой и читаемым текстом', async () => {
    const sender = transport()
    const message = resetPasswordEmail('Анна & Олег', 'a+b/c=d&e')
    let text: unknown
    sender.use('compile', (mail, done) => { text = mail.data.text; done() })
    const result = await sender.sendMail({ to: 'student@example.test', subject: message.subject, html: message.html })
    const mime = result.message.toString()

    expect(mime).toContain('Content-Type: multipart/alternative')
    expect(mime).toContain('Content-Type: text/plain')
    expect(mime).toContain('Content-Type: text/html')
    expect(text).toContain('Анна & Олег')
    expect(text).toContain('/reset-password?token=a%2Bb%2Fc%3Dd%26e')
    expect(text).toContain('1 час')
    expect(text).toContain('один раз')
    expect(text).not.toContain('mso-table')
    expect(text).not.toContain('Ссылка для нового пароля действует') // скрытый preheader
    expect(text).not.toContain('&amp;')
  })

  it('сохраняет специально написанную текстовую версию приглашения', async () => {
    const sender = transport()
    const message = inviteEmail('Анна', 'student@example.test', 'invite-token')
    let text: unknown
    sender.use('compile', (mail, done) => { text = mail.data.text; done() })

    await sender.sendMail({ to: 'student@example.test', ...message })
    expect(text).toBe(message.text)
  })

  it('два одновременных сброса не смешивают имена и токены', async () => {
    const sender = nodemailer.createTransport({ jsonTransport: true })
    registerTextAlternative(sender)
    const messages = [resetPasswordEmail('Анна', 'token-anna'), resetPasswordEmail('Борис', 'token-boris')]
    const results = await Promise.all(messages.map(({ subject, html }) => sender.sendMail({ subject, html, to: 'student@example.test' })))
    const [anna, boris] = results.map(result => JSON.parse(result.message) as { text: string })

    expect(anna.text).toContain('Анна')
    expect(anna.text).toContain('token-anna')
    expect(anna.text).not.toContain('token-boris')
    expect(boris.text).toContain('Борис')
    expect(boris.text).toContain('token-boris')
    expect(boris.text).not.toContain('token-anna')
  })

  it('письмо только с текстом не получает пустую HTML-часть', async () => {
    const sender = transport()
    const result = await sender.sendMail({ to: 'student@example.test', text: 'Служебное сообщение' })
    expect(result.message.toString()).toContain('Content-Type: text/plain')
    expect(result.message.toString()).not.toContain('Content-Type: text/html')
  })
})
