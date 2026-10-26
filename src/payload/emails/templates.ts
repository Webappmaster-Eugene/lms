import { absoluteBroadcastUrl, broadcastPlainText, parseBroadcastBody, type BroadcastInline } from '@/lib/broadcast-markup'

const BASE_URL = (process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:3000').replace(/\/+$/, '')
const BRAND_NAME = 'MentorCareer LMS'

export type EmailContent = {
  subject: string
  html: string
  text: string
}

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;',
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char)
}

function greeting(firstName: string): string {
  return firstName.trim() ? `Привет, ${firstName.trim()}!` : 'Здравствуйте!'
}

function link(label: string, url: string): string {
  return `<a href="${escapeHtml(url)}" style="color:#27272a;text-decoration:underline;text-underline-offset:3px;word-wrap:break-word;">${escapeHtml(label)}</a>`
}

function paragraph(content: string): string {
  return `<p style="margin:0 0 18px;font-size:16px;line-height:1.65;color:#3f3f46;">${content}</p>`
}

function button(label: string, url: string): string {
  return `<table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0;width:auto;">
    <tr><td bgcolor="#18181b" style="border-radius:8px;text-align:center;mso-padding-alt:15px 24px;">
      <a href="${escapeHtml(url)}" class="email-button" style="display:inline-block;padding:15px 24px;border:1px solid #18181b;border-radius:8px;color:#ffffff;font-size:16px;line-height:1.4;font-weight:bold;text-decoration:none;text-align:center;mso-padding-alt:0;">${escapeHtml(label)}</a>
    </td></tr>
  </table>`
}

function notice(content: string): string {
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:22px 0;">
    <tr><td bgcolor="#f4f4f5" style="padding:18px 20px;border-radius:8px;font-size:14px;line-height:1.65;color:#52525b;">${content}</td></tr>
  </table>`
}

function fallbackLink(url: string): string {
  return `<p style="margin:0 0 22px;font-size:13px;line-height:1.65;color:#52525b;">Если кнопка не открывается, скопируйте ссылку в браузер:<br>
    <a href="${escapeHtml(url)}" style="color:#52525b;text-decoration:underline;word-break:break-all;overflow-wrap:anywhere;">${escapeHtml(url)}</a>
  </p>`
}

function reward(points: number): string {
  if (!Number.isFinite(points) || points <= 0) return ''
  const lastTwo = points % 100
  const last = points % 10
  const noun = !Number.isInteger(points) ? 'балла'
    : lastTwo >= 11 && lastTwo <= 14 ? 'баллов'
      : last === 1 ? 'балл' : last >= 2 && last <= 4 ? 'балла' : 'баллов'
  return `+${new Intl.NumberFormat('ru-RU', { maximumFractionDigits: 20 }).format(points)} ${noun}`
}

function resultCard(title: string, description: string, points: number): string {
  const bonus = reward(points)
  return `<table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="margin:24px 0;table-layout:fixed;">
    <tr><td bgcolor="#fffbeb" style="padding:22px;border-left:4px solid #b77913;border-radius:0 8px 8px 0;word-wrap:break-word;overflow-wrap:anywhere;">
      <h2 style="margin:0 0 10px;font-size:21px;line-height:1.4;font-weight:bold;color:#18181b;">${escapeHtml(title)}</h2>
      <p style="margin:0;font-size:15px;line-height:1.65;color:#52525b;">${escapeHtml(description)}</p>
      ${bonus ? `<p style="margin:16px 0 0;font-size:19px;line-height:1.4;font-weight:bold;color:#854d0e;">${escapeHtml(bonus)}</p>` : ''}
    </td></tr>
  </table>`
}

type EmailFooter = { html: string; text: string }

const DEFAULT_FOOTER_HTML = `<p style="margin:0 0 8px;">Это автоматическое письмо, связанное с вашим аккаунтом или обучением в MentorCareer. Ответы на этот адрес не обрабатываются.</p>
          <p style="margin:0;">${link('Открыть платформу', BASE_URL)} &nbsp; / &nbsp; ${link('Контакты', `${BASE_URL}/contacts`)}</p>`

function layout(preview: string, title: string, content: string, footer = DEFAULT_FOOTER_HTML): string {
  return `<!DOCTYPE html>
<html lang="ru">
<head>
  <meta charset="utf-8">
  <meta name="viewport" content="width=device-width, initial-scale=1.0">
  <meta name="color-scheme" content="light">
  <title>${escapeHtml(title)} — MentorCareer</title>
  <style>
    body, table, td, a { -webkit-text-size-adjust:100%; -ms-text-size-adjust:100%; }
    table, td { mso-table-lspace:0pt; mso-table-rspace:0pt; }
    a:focus-visible { outline:3px solid #b77913; outline-offset:4px; }
    @media only screen and (max-width:600px) {
      .email-outer { padding:16px 10px !important; }
      .email-content { padding:28px 22px !important; }
      .email-header { padding:24px 22px !important; }
      .email-title { font-size:26px !important; }
      .email-button { padding:15px 20px !important; }
    }
  </style>
</head>
<body style="margin:0;padding:0;width:100%;background-color:#f4f4f5;font-family:Arial,Helvetica,sans-serif;">
  <div class="email-preheader" aria-hidden="true" style="display:none;max-height:0;max-width:0;overflow:hidden;opacity:0;mso-hide:all;">${escapeHtml(preview)}</div>
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#f4f4f5">
    <tr><td align="center" class="email-outer" style="padding:36px 16px;">
      <!--[if mso]><table role="presentation" width="600" align="center"><tr><td><![endif]-->
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" bgcolor="#ffffff" style="max-width:600px;border:1px solid #e4e4e7;border-radius:12px;table-layout:fixed;">
        <tr><td class="email-header" bgcolor="#18181b" style="padding:28px 36px;border-radius:11px 11px 0 0;border-bottom:3px solid #b77913;">
          <a href="${escapeHtml(BASE_URL)}" style="font-size:25px;line-height:1.2;font-weight:bold;letter-spacing:-0.6px;color:#ffffff;text-decoration:none;">MentorCareer</a>
          <p style="margin:7px 0 0;font-size:13px;line-height:1.5;color:#d4d4d8;">Платформа обучения</p>
        </td></tr>
        <tr><td class="email-content" style="padding:36px;word-wrap:break-word;overflow-wrap:anywhere;">
          <h1 class="email-title" style="margin:0 0 24px;font-size:30px;line-height:1.2;letter-spacing:-0.6px;font-weight:bold;color:#18181b;">${escapeHtml(title)}</h1>
          ${content}
          <p style="margin:30px 0 0;padding-top:22px;border-top:1px solid #e4e4e7;font-size:14px;line-height:1.6;color:#52525b;">До встречи на платформе,<br><strong style="color:#27272a;">Команда MentorCareer</strong></p>
        </td></tr>
        <tr><td class="email-content" bgcolor="#fafafa" style="padding:22px 36px;border-top:1px solid #e4e4e7;border-radius:0 0 11px 11px;font-size:12px;line-height:1.7;color:#52525b;">
          ${footer}
        </td></tr>
      </table>
      <!--[if mso]></td></tr></table><![endif]-->
    </td></tr>
  </table>
</body>
</html>`
}

const DEFAULT_FOOTER_TEXT = `Это автоматическое письмо. Ответы на этот адрес не обрабатываются.\nКонтакты: ${BASE_URL}/contacts`

function email(subject: string, preview: string, title: string, html: string, text: string, footer?: EmailFooter): EmailContent {
  return {
    subject,
    html: layout(preview, title, html, footer?.html),
    text: `${BRAND_NAME}\n\n${title}\n\n${text.trim()}\n\nДо встречи на платформе,\nКоманда MentorCareer\n${BASE_URL}\n\n${footer?.text ?? DEFAULT_FOOTER_TEXT}\n`,
  }
}

export function passwordSetupUrl(token: string): string {
  return `${BASE_URL}/reset-password?token=${encodeURIComponent(token)}`
}

/** В письмо попадает только https-ссылка: значение приходит из настроек CMS. */
function safeCommunityUrl(value: string | undefined): string | undefined {
  if (!value) return undefined
  try {
    const parsed = new URL(value)
    return parsed.protocol === 'https:' && !parsed.username && !parsed.password ? parsed.toString() : undefined
  } catch {
    return undefined
  }
}

export function inviteEmail(firstName: string, address: string, token: string, communityUrl?: string): EmailContent {
  const url = passwordSetupUrl(token)
  const community = safeCommunityUrl(communityUrl)
  const steps = ['Задайте пароль по ссылке из этого письма.', 'Войдите на платформу с вашим email и новым паролем.', 'Откройте доступные вам материалы и выберите первый урок.']
  return email(
    `Доступ к ${BRAND_NAME}`,
    'Ваш аккаунт готов. Задайте пароль и начните обучение. Ссылка действует 7 дней.',
    'Ваше обучение начинается здесь',
    `${paragraph(escapeHtml(greeting(firstName)))}
    ${paragraph('Администратор создал для вас аккаунт MentorCareer. Осталось задать пароль — после этого вы сможете открыть назначенные вам учебные материалы.')}
    ${notice(`<strong style="color:#27272a;">Ваш логин</strong><br><span style="word-break:break-all;">${escapeHtml(address)}</span>`)}
    <ol style="margin:0 0 18px;padding-left:22px;font-size:15px;line-height:1.7;color:#3f3f46;">${steps.map(step => `<li style="padding:0 0 8px 4px;">${escapeHtml(step)}</li>`).join('')}</ol>
    ${button('Задать пароль', url)}
    ${paragraph('<strong>Ссылка действует 7 дней и используется один раз.</strong> Выберите пароль, который не используете в других сервисах.')}
    ${fallbackLink(url)}
    ${paragraph(`Ссылка устарела? ${link('Запросите новую', `${BASE_URL}/forgot-password`)}. Уже задали пароль? ${link('Войдите в аккаунт', `${BASE_URL}/login`)}.`)}
    ${community ? paragraph(`Вопросы по задачам, разборы и общение с другими учениками — в нашем чате. ${link('Вступить в чат учеников в Telegram', community)}.`) : ''}
    ${notice('Если вы не ожидали приглашения, уточните его у администратора, который выдал доступ. Не пересылайте это письмо: ссылка позволяет задать пароль к вашему аккаунту.')}`,
    `${greeting(firstName)}\n\nАдминистратор создал для вас аккаунт MentorCareer.\nВаш логин: ${address}\n\n${steps.map((step, index) => `${index + 1}. ${step}`).join('\n')}\n\nЗадать пароль по ссылке:\n${url}\n\nСсылка действует 7 дней и используется один раз. Выберите пароль, который не используете в других сервисах.\n\nСсылка устарела? Запросите новую: ${BASE_URL}/forgot-password\nУже задали пароль? Войти: ${BASE_URL}/login\n\n${community ? `Чат учеников в Telegram — вопросы по задачам, разборы и общение:\n${community}\n\n` : ''}Если вы не ожидали приглашения, уточните его у администратора, который выдал доступ. Не пересылайте это письмо: ссылка позволяет задать пароль к вашему аккаунту.`,
  )
}

export function resetPasswordEmail(firstName: string, token: string): EmailContent {
  const url = passwordSetupUrl(token)
  return email(
    `Восстановление пароля — ${BRAND_NAME}`,
    'Ссылка для нового пароля действует 1 час. Если запрос не ваш, ничего делать не нужно.',
    'Задайте новый пароль',
    `${paragraph(escapeHtml(greeting(firstName)))}
    ${paragraph('Мы получили запрос на восстановление доступа к вашему аккаунту MentorCareer. Нажмите кнопку и задайте новый пароль, чтобы вернуться к обучению.')}
    ${button('Восстановить пароль', url)}
    ${notice('<strong style="color:#27272a;">Ссылка действует 1 час и используется один раз.</strong><br>Не пересылайте это письмо и не сообщайте ссылку другим людям.')}
    ${fallbackLink(url)}
    ${paragraph(`Ссылка больше не действует? ${link('Запросите новую ссылку', `${BASE_URL}/forgot-password`)}.`)}
    ${paragraph('<strong>Не запрашивали восстановление?</strong> Просто проигнорируйте это письмо. Ваш текущий пароль останется прежним, пока вы сами не зададите новый.')}`,
    `${greeting(firstName)}\n\nМы получили запрос на восстановление доступа к вашему аккаунту MentorCareer.\n\nЗадать новый пароль:\n${url}\n\nСсылка действует 1 час и используется один раз. Не пересылайте это письмо и не сообщайте ссылку другим людям.\n\nСсылка больше не действует? Запросите новую: ${BASE_URL}/forgot-password\n\nНе запрашивали восстановление? Просто проигнорируйте это письмо. Ваш текущий пароль останется прежним, пока вы сами не зададите новый.`,
  )
}

export function courseCompletedEmail(firstName: string, courseTitle: string, bonusPoints: number, slug?: string): EmailContent {
  const url = slug ? `${BASE_URL}/courses/${encodeURIComponent(slug)}` : `${BASE_URL}/courses`
  const bonus = reward(bonusPoints)
  return email(
    `Курс «${courseTitle}» завершён!`,
    'Курс пройден. Вернитесь к материалам или выберите следующий шаг обучения.',
    'Ещё один курс пройден',
    `${paragraph(escapeHtml(greeting(firstName)))}
    ${paragraph('Поздравляем! Вы завершили курс. Самое время закрепить материал: вернитесь к сложной теме, повторите примеры и примените изученное в своей задаче.')}
    ${resultCard(courseTitle, 'Все уроки курса отмечены пройденными.', bonusPoints)}
    ${bonus ? paragraph('Баллы за завершение курса уже учтены в вашем профиле.') : ''}
    ${button('Открыть курс', url)}
    ${paragraph(`Что дальше: ${link('выбрать следующий курс', `${BASE_URL}/courses`)} или ${link('посмотреть свои сертификаты', `${BASE_URL}/certificates`)}.`)}`,
    `${greeting(firstName)}\n\nПоздравляем! Вы завершили курс «${courseTitle}». Все уроки курса отмечены пройденными.\n${bonus ? `\nНаграда за завершение курса: ${bonus}. Она учтена в ваших баллах на платформе.\n` : ''}\nЗакрепите материал: вернитесь к сложной теме, повторите примеры и примените изученное в своей задаче.\n\nОткрыть курс: ${url}\nВыбрать следующий курс: ${BASE_URL}/courses\nВаши сертификаты: ${BASE_URL}/certificates`,
  )
}

export function achievementUnlockedEmail(firstName: string, achievementTitle: string, achievementDescription: string, pointsReward: number): EmailContent {
  const url = `${BASE_URL}/profile`
  const bonus = reward(pointsReward)
  return email(
    `Новое достижение: ${achievementTitle}`,
    'Ваш прогресс принёс новое достижение. Посмотрите награду и следующие цели в профиле.',
    'Ваш прогресс заметен',
    `${paragraph(escapeHtml(greeting(firstName)))}
    ${paragraph('У вас новое достижение в MentorCareer. Оно уже появилось в вашем профиле вместе с другими результатами обучения.')}
    ${resultCard(achievementTitle, achievementDescription, pointsReward)}
    ${bonus ? paragraph('Бонус за достижение добавлен к вашим баллам на платформе.') : ''}
    ${button('Посмотреть профиль', url)}
    ${paragraph('В профиле можно посмотреть полученные достижения и прогресс к следующим целям. Выберите ближайшую цель и продолжайте в удобном вам темпе.')}`,
    `${greeting(firstName)}\n\nУ вас новое достижение: ${achievementTitle}\n${achievementDescription}\n${bonus ? `\nБонус: ${bonus}. Награда добавлена к вашим баллам.\n` : ''}\nВ профиле можно посмотреть полученные достижения и прогресс к следующим целям. Выберите ближайшую цель и продолжайте в удобном вам темпе.\n\nПосмотреть профиль: ${url}`,
  )
}

export function roadmapCompletedEmail(firstName: string, roadmapTitle: string, bonusPoints: number, slug?: string): EmailContent {
  const url = slug ? `${BASE_URL}/roadmaps/${encodeURIComponent(slug)}` : `${BASE_URL}/roadmaps`
  const bonus = reward(bonusPoints)
  return email(
    `Роадмап «${roadmapTitle}» завершён!`,
    'Вы прошли все курсы роадмапа. Сохраните результаты и выберите новое направление.',
    'Учебный маршрут пройден',
    `${paragraph(escapeHtml(greeting(firstName)))}
    ${paragraph('Поздравляем с завершением роадмапа! Вы прошли все его курсы. Теперь можно закрепить знания в практике или использовать их как основу для следующего направления.')}
    ${resultCard(roadmapTitle, 'Все курсы роадмапа завершены.', bonusPoints)}
    ${bonus ? paragraph('Баллы за завершение роадмапа уже учтены в вашем профиле.') : ''}
    ${button('Открыть роадмап', url)}
    ${paragraph(`Посмотрите свои результаты в разделе ${link('«Сертификаты»', `${BASE_URL}/certificates`)}. Для следующего шага ${link('откройте другие роадмапы', `${BASE_URL}/roadmaps`)}.`)}`,
    `${greeting(firstName)}\n\nПоздравляем! Вы завершили роадмап «${roadmapTitle}» и прошли все его курсы.\n${bonus ? `\nНаграда за завершение роадмапа: ${bonus}. Она учтена в ваших баллах на платформе.\n` : ''}\nЗакрепите знания в практике или используйте их как основу для следующего направления.\n\nОткрыть роадмап: ${url}\nВаши сертификаты: ${BASE_URL}/certificates\nДругие роадмапы: ${BASE_URL}/roadmaps`,
  )
}

function broadcastInlineHtml(nodes: BroadcastInline[]): string {
  return nodes.map((node) => {
    if (node.type === 'text') return escapeHtml(node.value)
    if (node.type === 'break') return '<br>'
    if (node.type === 'bold') return `<strong style="color:#27272a;">${broadcastInlineHtml(node.children)}</strong>`
    return link(node.label, node.url)
  }).join('')
}

export type BroadcastEmailInput = {
  firstName: string
  subject: string
  body: string
  ctaLabel?: string | null
  ctaUrl?: string | null
  unsubscribeUrl: string
  /** Есть ли адрес для ответа: иначе подвал честно говорит, что ответы не читаются. */
  replyable: boolean
}

export function broadcastEmail({ firstName, subject, body, ctaLabel, ctaUrl, unsubscribeUrl, replyable }: BroadcastEmailInput): EmailContent {
  const paragraphs = parseBroadcastBody(body)
  const cta = ctaLabel?.trim() && ctaUrl?.trim() ? { label: ctaLabel.trim(), url: absoluteBroadcastUrl(ctaUrl.trim(), BASE_URL) } : null
  const plain = paragraphs.map(broadcastPlainText).join('\n\n')
  const preview = plain.replace(/\s+/g, ' ').slice(0, 140)
  const reason = 'Вы получили это письмо, потому что учитесь на платформе MentorCareer.'
  const reply = replyable ? 'Чтобы задать вопрос, просто ответьте на это письмо.' : 'Ответы на этот адрес не обрабатываются.'
  return email(
    subject,
    preview,
    subject,
    `${paragraph(escapeHtml(greeting(firstName)))}
    ${paragraphs.map((nodes) => paragraph(broadcastInlineHtml(nodes))).join('\n    ')}
    ${cta ? `${button(cta.label, cta.url)}\n    ${fallbackLink(cta.url)}` : ''}`,
    `${greeting(firstName)}\n\n${plain}${cta ? `\n\n${cta.label}: ${cta.url}` : ''}`,
    {
      html: `<p style="margin:0 0 8px;">${escapeHtml(`${reason} ${reply}`)}</p>
          <p style="margin:0;">${link('Открыть платформу', BASE_URL)} &nbsp; / &nbsp; ${link('Контакты', `${BASE_URL}/contacts`)} &nbsp; / &nbsp; ${link('Отписаться от рассылок', unsubscribeUrl)}</p>`,
      text: `${reason} ${reply}\nКонтакты: ${BASE_URL}/contacts\nОтписаться от рассылок: ${unsubscribeUrl}`,
    },
  )
}

type BootcampLeadEmailInput = {
  id: number | string
  address: string
  name: string | null
  program: string
  source: string
}

/** Команде: пришла новая предзапись. Ученику письмо не уходит — адрес не подтверждён. */
export function bootcampLeadEmail({ id, address, name, program, source }: BootcampLeadEmailInput): EmailContent {
  const url = `${BASE_URL}/admin/collections/bootcamp-leads/${encodeURIComponent(String(id))}`
  const rows: [string, string][] = [['Email', address], ['Имя', name ?? 'не указано'], ['Программа', program], ['Откуда', source]]
  return email(
    `Новая заявка на буткемп: ${address}`,
    `Заявка от ${address}: ответьте и пришлите входное задание.`,
    'Новая заявка на буткемп',
    `${paragraph('С лендинга пришла предзапись. Ответьте человеку и отметьте этап заявки в CMS.')}
    ${notice(rows.map(([title, value]) => `<strong style="color:#27272a;">${escapeHtml(title)}</strong><br><span style="word-break:break-all;">${escapeHtml(value)}</span>`).join('<br><br>'))}
    ${button('Открыть заявку', url)}
    ${fallbackLink(url)}`,
    `С лендинга пришла предзапись. Ответьте человеку и отметьте этап заявки в CMS.\n\n${rows.map(([title, value]) => `${title}: ${value}`).join('\n')}\n\nОткрыть заявку: ${url}`,
  )
}

export function emailBaseUrl(): string {
  return BASE_URL
}
