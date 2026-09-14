const BASE_URL = (process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:3000').replace(/\/+$/, '')

const BRAND_NAME = 'MentorCareer LMS'
const BRAND_TAGLINE = 'MentorCareer — платформа обучения'

/**
 * Готовое письмо. `text` обязателен: письмо без текстовой части
 * получает заметный штраф у спам-фильтров Mail.ru и Gmail.
 */
export type EmailContent = {
  subject: string
  html: string
  text: string
}

const HTML_ESCAPES: Readonly<Record<string, string>> = {
  '&': '&amp;',
  '<': '&lt;',
  '>': '&gt;',
  '"': '&quot;',
  "'": '&#39;',
}

/**
 * Экранирует значение перед вставкой в HTML-письмо.
 * Имена, названия курсов и достижений приходят из пользовательского ввода,
 * поэтому подставлять их в разметку сырыми нельзя.
 */
function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (char) => HTML_ESCAPES[char] ?? char)
}

function layout(content: string): string {
  return `<!DOCTYPE html>
<html lang="ru">
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;">
        <tr><td style="background-color:#18181b;padding:24px 32px;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">${BRAND_NAME}</h1>
        </td></tr>
        <tr><td style="padding:32px;">
          ${content}
        </td></tr>
        <tr><td style="padding:16px 32px;background-color:#f4f4f5;text-align:center;">
          <p style="margin:0;color:#71717a;font-size:12px;">${BRAND_TAGLINE}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function textLayout(body: string): string {
  return `${BRAND_NAME}\n\n${body.trim()}\n\n--\n${BRAND_TAGLINE}\n${BASE_URL}\n`
}

function button(text: string, url: string): string {
  return `<table cellpadding="0" cellspacing="0" style="margin:24px 0;">
    <tr><td style="background-color:#18181b;border-radius:8px;padding:12px 24px;">
      <a href="${escapeHtml(url)}" style="color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;">${escapeHtml(text)}</a>
    </td></tr>
  </table>`
}

/** Запасной вариант ссылки — часть почтовых клиентов режет кнопки-таблицы. */
function fallbackLink(url: string): string {
  return `<p style="margin:0 0 16px;color:#71717a;font-size:13px;line-height:1.6;word-break:break-all;">
    Если кнопка не работает, скопируйте ссылку в адресную строку браузера:<br>
    <a href="${escapeHtml(url)}" style="color:#3f3f46;">${escapeHtml(url)}</a>
  </p>`
}

function greeting(firstName: string): string {
  const name = firstName.trim()
  return name ? `Привет, ${escapeHtml(name)}!` : 'Здравствуйте!'
}

function greetingText(firstName: string): string {
  const name = firstName.trim()
  return name ? `Привет, ${name}!` : 'Здравствуйте!'
}

/** Ссылка на страницу установки/сброса пароля. */
export function passwordSetupUrl(token: string): string {
  return `${BASE_URL}/reset-password?token=${encodeURIComponent(token)}`
}

/**
 * Приглашение в LMS. Заменяет прежнее welcome-письмо: аккаунты заводит
 * администратор, поэтому студенту нужен способ задать пароль, а не просто
 * ссылка на форму входа. Пароль в письме не передаётся намеренно.
 */
export function inviteEmail(firstName: string, email: string, token: string): EmailContent {
  const url = passwordSetupUrl(token)

  return {
    subject: `Доступ к ${BRAND_NAME}`,
    html: layout(`
      <h2 style="margin:0 0 16px;color:#18181b;font-size:22px;">${greeting(firstName)}</h2>
      <p style="margin:0 0 16px;color:#3f3f46;font-size:15px;line-height:1.6;">
        Для вас создан аккаунт на платформе ${BRAND_NAME}. Чтобы начать обучение,
        задайте пароль по ссылке ниже.
      </p>
      <p style="margin:0 0 8px;color:#3f3f46;font-size:15px;"><strong>Логин:</strong> ${escapeHtml(email)}</p>
      ${button('Задать пароль', url)}
      ${fallbackLink(url)}
      <p style="margin:0;color:#71717a;font-size:13px;line-height:1.6;">
        Ссылка действует 7 дней. Если срок истёк, воспользуйтесь формой
        «Забыли пароль?» на странице входа.
      </p>
    `),
    text: textLayout(`
${greetingText(firstName)}

Для вас создан аккаунт на платформе ${BRAND_NAME}.
Логин: ${email}

Задайте пароль по ссылке:
${url}

Ссылка действует 7 дней. Если срок истёк, воспользуйтесь формой
«Забыли пароль?» на странице входа.
    `),
  }
}

/**
 * Восстановление пароля. Подставляется в `Users.auth.forgotPassword`,
 * чтобы Payload не слал дефолтное письмо со ссылкой на админку.
 */
export function resetPasswordEmail(firstName: string, token: string): EmailContent {
  const url = passwordSetupUrl(token)

  return {
    subject: `Восстановление пароля — ${BRAND_NAME}`,
    html: layout(`
      <h2 style="margin:0 0 16px;color:#18181b;font-size:22px;">${greeting(firstName)}</h2>
      <p style="margin:0 0 16px;color:#3f3f46;font-size:15px;line-height:1.6;">
        Мы получили запрос на восстановление пароля от вашего аккаунта.
        Чтобы задать новый пароль, перейдите по ссылке.
      </p>
      ${button('Восстановить пароль', url)}
      ${fallbackLink(url)}
      <p style="margin:0;color:#71717a;font-size:13px;line-height:1.6;">
        Ссылка действует 1 час. Если вы не запрашивали восстановление,
        просто проигнорируйте это письмо — пароль останется прежним.
      </p>
    `),
    text: textLayout(`
${greetingText(firstName)}

Мы получили запрос на восстановление пароля от вашего аккаунта.
Чтобы задать новый пароль, перейдите по ссылке:

${url}

Ссылка действует 1 час. Если вы не запрашивали восстановление,
просто проигнорируйте это письмо — пароль останется прежним.
    `),
  }
}

export function courseCompletedEmail(
  firstName: string,
  courseTitle: string,
  bonusPoints: number,
): EmailContent {
  return {
    subject: `Курс «${courseTitle}» завершён!`,
    html: layout(`
      <h2 style="margin:0 0 16px;color:#18181b;font-size:22px;">Поздравляем, ${escapeHtml(firstName.trim())}!</h2>
      <p style="margin:0 0 16px;color:#3f3f46;font-size:15px;line-height:1.6;">
        Вы успешно завершили курс <strong>&laquo;${escapeHtml(courseTitle)}&raquo;</strong>. Отличная работа!
      </p>
      <p style="margin:0 0 16px;color:#3f3f46;font-size:15px;">
        Вам начислено <strong style="color:#eab308;">+${bonusPoints} баллов</strong> за завершение курса.
      </p>
      ${button('Продолжить обучение', BASE_URL)}
    `),
    text: textLayout(`
Поздравляем, ${firstName.trim()}!

Вы успешно завершили курс «${courseTitle}». Отличная работа!
Вам начислено +${bonusPoints} баллов за завершение курса.

Продолжить обучение: ${BASE_URL}
    `),
  }
}

export function achievementUnlockedEmail(
  firstName: string,
  achievementTitle: string,
  achievementDescription: string,
  pointsReward: number,
): EmailContent {
  const profileUrl = `${BASE_URL}/profile`

  return {
    subject: `Новое достижение: ${achievementTitle}`,
    html: layout(`
      <h2 style="margin:0 0 16px;color:#18181b;font-size:22px;">${escapeHtml(firstName.trim())}, у вас новое достижение!</h2>
      <div style="margin:0 0 16px;padding:16px;background-color:#fefce8;border-radius:8px;border:1px solid #fde047;">
        <p style="margin:0 0 4px;color:#854d0e;font-size:16px;font-weight:600;">${escapeHtml(achievementTitle)}</p>
        <p style="margin:0;color:#a16207;font-size:14px;">${escapeHtml(achievementDescription)}</p>
      </div>
      ${pointsReward > 0 ? `<p style="margin:0 0 16px;color:#3f3f46;font-size:15px;">Бонус: <strong style="color:#eab308;">+${pointsReward} баллов</strong></p>` : ''}
      ${button('Посмотреть профиль', profileUrl)}
    `),
    text: textLayout(`
${firstName.trim()}, у вас новое достижение!

${achievementTitle}
${achievementDescription}
${pointsReward > 0 ? `\nБонус: +${pointsReward} баллов` : ''}

Посмотреть профиль: ${profileUrl}
    `),
  }
}

export function roadmapCompletedEmail(
  firstName: string,
  roadmapTitle: string,
  bonusPoints: number,
): EmailContent {
  return {
    subject: `Роадмап «${roadmapTitle}» завершён! Великолепный результат!`,
    html: layout(`
      <h2 style="margin:0 0 16px;color:#18181b;font-size:22px;">${escapeHtml(firstName.trim())}, вы завершили роадмап!</h2>
      <p style="margin:0 0 16px;color:#3f3f46;font-size:15px;line-height:1.6;">
        Вы прошли все курсы в роадмапе <strong>&laquo;${escapeHtml(roadmapTitle)}&raquo;</strong>. Это огромное достижение!
      </p>
      <p style="margin:0 0 16px;color:#3f3f46;font-size:15px;">
        Бонус: <strong style="color:#eab308;">+${bonusPoints} баллов</strong>
      </p>
      ${button('Посмотреть прогресс', BASE_URL)}
    `),
    text: textLayout(`
${firstName.trim()}, вы завершили роадмап!

Вы прошли все курсы в роадмапе «${roadmapTitle}». Это огромное достижение!
Бонус: +${bonusPoints} баллов

Посмотреть прогресс: ${BASE_URL}
    `),
  }
}
