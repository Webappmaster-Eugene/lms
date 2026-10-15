import { compile } from 'html-to-text'
import type { Transporter } from 'nodemailer'

const convert = compile({
  wordwrap: false,
  selectors: [
    { selector: '.email-preheader', format: 'skip' },
    { selector: 'h1', options: { uppercase: false } },
    { selector: 'h2', options: { uppercase: false } },
    { selector: 'a', options: { hideLinkHrefIfSameAsText: true } },
  ],
})

/** Payload forgotPassword передаёт только HTML, минуя text из нашего шаблона. */
export function registerTextAlternative(transport: Transporter): void {
  transport.use('compile', (mail, done) => {
    try {
      const textMissing = !mail.data.text || (typeof mail.data.text === 'string' && !mail.data.text.trim())
      if (textMissing && typeof mail.data.html === 'string') {
        mail.data.text = convert(mail.data.html)
      }
      done()
    } catch (error) {
      done(error instanceof Error ? error : new Error('Cannot generate email text alternative'))
    }
  })
}
