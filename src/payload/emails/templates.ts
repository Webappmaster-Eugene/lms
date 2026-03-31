const BASE_URL = process.env.NEXT_PUBLIC_SERVER_URL ?? 'http://localhost:3000'

function layout(content: string): string {
  return `<!DOCTYPE html>
<html>
<head><meta charset="utf-8"><meta name="viewport" content="width=device-width, initial-scale=1.0"></head>
<body style="margin:0;padding:0;background-color:#f4f4f5;font-family:'Inter',-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f4f4f5;padding:32px 16px;">
    <tr><td align="center">
      <table width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background-color:#ffffff;border-radius:12px;overflow:hidden;">
        <tr><td style="background-color:#18181b;padding:24px 32px;">
          <h1 style="margin:0;color:#ffffff;font-size:20px;font-weight:700;">MentorCareer LMS</h1>
        </td></tr>
        <tr><td style="padding:32px;">
          ${content}
        </td></tr>
        <tr><td style="padding:16px 32px;background-color:#f4f4f5;text-align:center;">
          <p style="margin:0;color:#71717a;font-size:12px;">MentorCareer &mdash; платформа обучения</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`
}

function button(text: string, url: string): string {
  return `<table cellpadding="0" cellspacing="0" style="margin:24px 0;">
    <tr><td style="background-color:#18181b;border-radius:8px;padding:12px 24px;">
      <a href="${url}" style="color:#ffffff;text-decoration:none;font-size:14px;font-weight:600;">${text}</a>
    </td></tr>
  </table>`
}

export function welcomeEmail(firstName: string, email: string): { subject: string; html: string } {
  return {
    subject: 'Добро пожаловать в MentorCareer LMS!',
    html: layout(`
      <h2 style="margin:0 0 16px;color:#18181b;font-size:22px;">Привет, ${firstName}!</h2>
      <p style="margin:0 0 16px;color:#3f3f46;font-size:15px;line-height:1.6;">
        Ваш аккаунт на платформе MentorCareer LMS создан. Теперь вы можете войти и начать обучение.
      </p>
      <p style="margin:0 0 8px;color:#3f3f46;font-size:15px;"><strong>Email:</strong> ${email}</p>
      ${button('Войти в систему', `${BASE_URL}/login`)}
      <p style="margin:0;color:#71717a;font-size:13px;">
        Если у вас возникнут вопросы, обратитесь к вашему ментору.
      </p>
    `),
  }
}

export function courseCompletedEmail(
  firstName: string,
  courseTitle: string,
  bonusPoints: number,
): { subject: string; html: string } {
  return {
    subject: `Курс "${courseTitle}" завершён!`,
    html: layout(`
      <h2 style="margin:0 0 16px;color:#18181b;font-size:22px;">Поздравляем, ${firstName}!</h2>
      <p style="margin:0 0 16px;color:#3f3f46;font-size:15px;line-height:1.6;">
        Вы успешно завершили курс <strong>&laquo;${courseTitle}&raquo;</strong>. Отличная работа!
      </p>
      <p style="margin:0 0 16px;color:#3f3f46;font-size:15px;">
        Вам начислено <strong style="color:#eab308;">+${bonusPoints} баллов</strong> за завершение курса.
      </p>
      ${button('Продолжить обучение', BASE_URL)}
    `),
  }
}

export function achievementUnlockedEmail(
  firstName: string,
  achievementTitle: string,
  achievementDescription: string,
  pointsReward: number,
): { subject: string; html: string } {
  return {
    subject: `Новое достижение: ${achievementTitle}`,
    html: layout(`
      <h2 style="margin:0 0 16px;color:#18181b;font-size:22px;">${firstName}, у вас новое достижение!</h2>
      <div style="margin:0 0 16px;padding:16px;background-color:#fefce8;border-radius:8px;border:1px solid #fde047;">
        <p style="margin:0 0 4px;color:#854d0e;font-size:16px;font-weight:600;">${achievementTitle}</p>
        <p style="margin:0;color:#a16207;font-size:14px;">${achievementDescription}</p>
      </div>
      ${pointsReward > 0 ? `<p style="margin:0 0 16px;color:#3f3f46;font-size:15px;">Бонус: <strong style="color:#eab308;">+${pointsReward} баллов</strong></p>` : ''}
      ${button('Посмотреть профиль', `${BASE_URL}/profile`)}
    `),
  }
}

export function roadmapCompletedEmail(
  firstName: string,
  roadmapTitle: string,
  bonusPoints: number,
): { subject: string; html: string } {
  return {
    subject: `Роадмап "${roadmapTitle}" завершён! Великолепный результат!`,
    html: layout(`
      <h2 style="margin:0 0 16px;color:#18181b;font-size:22px;">${firstName}, вы завершили роадмап!</h2>
      <p style="margin:0 0 16px;color:#3f3f46;font-size:15px;line-height:1.6;">
        Вы прошли все курсы в роадмапе <strong>&laquo;${roadmapTitle}&raquo;</strong>. Это огромное достижение!
      </p>
      <p style="margin:0 0 16px;color:#3f3f46;font-size:15px;">
        Бонус: <strong style="color:#eab308;">+${bonusPoints} баллов</strong>
      </p>
      ${button('Посмотреть прогресс', BASE_URL)}
    `),
  }
}
