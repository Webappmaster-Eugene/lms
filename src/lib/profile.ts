export type ProfileDTO = {
  id: number
  firstName: string
  lastName: string
  email: string
  telegram: string | null
  bio: string | null
  avatar: { id: number; url: string | null; alt: string | null } | null
}

export function normalizeTelegram(value: unknown): string | null {
  if (value === null || value === '') return null
  if (typeof value !== 'string') throw new Error('Укажите Telegram в формате @username или https://t.me/username')
  const trimmed = value.trim()
  if (!trimmed) return null
  const username = trimmed.startsWith('@') ? trimmed.slice(1) : /^https:\/\/t\.me\/([a-zA-Z][a-zA-Z0-9_]{4,31})\/?$/.exec(trimmed)?.[1]
  if (!username || !/^[a-zA-Z][a-zA-Z0-9_]{4,31}$/.test(username)) throw new Error('Укажите Telegram в формате @username или https://t.me/username')
  return `https://t.me/${username}`
}

export function passwordPolicyError(value: unknown): string | null {
  return typeof value !== 'string' || value.length < 10 || value.length > 128 || !/\p{L}/u.test(value) || !/\d/.test(value)
    ? 'Пароль должен содержать от 10 до 128 символов, буквы и цифры'
    : null
}
