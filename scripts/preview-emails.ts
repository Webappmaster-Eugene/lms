import { mkdir, writeFile } from 'node:fs/promises'
import { resolve } from 'node:path'
import {
  achievementUnlockedEmail,
  courseCompletedEmail,
  inviteEmail,
  resetPasswordEmail,
  roadmapCompletedEmail,
} from '@/payload/emails/templates'

const directory = resolve(process.argv[2] ?? '.codex/state/email-preview')
const samples = [
  { id: 'invite', title: 'Приглашение', email: inviteEmail('Алексей', 'student@example.test', 'preview-not-a-real-token') },
  { id: 'reset', title: 'Восстановление пароля', email: resetPasswordEmail('Алексей', 'preview-not-a-real-token') },
  { id: 'course', title: 'Завершение курса', email: courseCompletedEmail('Алексей', 'React: от компонентов до первого приложения', 50, 'react') },
  { id: 'roadmap', title: 'Завершение роадмапа', email: roadmapCompletedEmail('Алексей', 'Frontend-разработчик', 200, 'frontend') },
  { id: 'achievement', title: 'Достижение', email: achievementUnlockedEmail('Алексей', 'Первый шаг', 'Пройдите первый урок', 5) },
]

await mkdir(directory, { recursive: true })
for (const sample of samples) {
  await writeFile(resolve(directory, `${sample.id}.html`), sample.email.html)
  await writeFile(resolve(directory, `${sample.id}.txt`), sample.email.text)
}
await writeFile(resolve(directory, 'index.html'), `<!DOCTYPE html>
<html lang="ru"><head><meta charset="utf-8"><meta name="viewport" content="width=device-width,initial-scale=1"><title>Письма MentorCareer</title>
<style>body{margin:0;background:#f4f4f5;color:#18181b;font:16px/1.6 Arial,sans-serif}main{max-width:680px;margin:48px auto;padding:0 24px}h1{font-size:32px}li{margin:16px 0}a{color:#18181b}small{display:block;color:#52525b}</style></head>
<body><main><h1>Письма MentorCareer</h1><p>Предпросмотр пяти шаблонов. Данные вымышленные, ссылки установки пароля не действуют.</p><ul>
${samples.map(sample => `<li><a href="${sample.id}.html">${sample.title}</a> — <a href="${sample.id}.txt">текстовая версия</a></li>`).join('\n')}
</ul><small>Чтобы проверить мобильную версию, уменьшите ширину окна браузера.</small></main></body></html>`)
process.stdout.write(`Предпросмотр писем: ${resolve(directory, 'index.html')}\n`)
