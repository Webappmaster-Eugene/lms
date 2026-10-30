/**
 * Входное задание буткемпа: личная ссылка кандидата и сроки. Решения владельца
 * от 27.10.2026: задание приходит сразу после заявки, на него 7 дней, ответ на
 * сданное задание — в течение 5 дней.
 */

export const ENTRY_TASK_DUE_DAYS = 7
export const ENTRY_TASK_REVIEW_DAYS = 5
// Решение владельца 30.10.2026: каждая отправка шлёт письмо команде, бесконечные повторы не нужны.
// «Проверить» не ограничено: оно ничего не пишет и писем не шлёт.
export const ENTRY_TASK_MAX_SUBMISSIONS = 3

/** 24 случайных байта в base64url: ссылку нельзя подобрать, поэтому вход не нужен. */
const TOKEN_PATTERN = /^[A-Za-z0-9_-]{32}$/

const DAY_MS = 24 * 60 * 60_000
// Москва живёт без перехода на летнее время: сдвиг постоянный.
const MOSCOW_OFFSET_MS = 3 * 60 * 60_000

export function isEntryTaskToken(value: string): boolean {
  return TOKEN_PATTERN.test(value)
}

export function entryTaskPath(token: string): string {
  return `/entry-task/${token}`
}

/** Конец седьмого дня по Москве: «до 3 ноября включительно» значит до полуночи, а не до часа отправки письма. */
export function entryTaskDueAt(sentAt: Date): Date {
  const moscowDay = Math.floor((sentAt.getTime() + MOSCOW_OFFSET_MS) / DAY_MS)
  return new Date((moscowDay + ENTRY_TASK_DUE_DAYS + 1) * DAY_MS - MOSCOW_OFFSET_MS - 1)
}

/** Дата для людей: занятия и сроки потока считаются по Москве. */
export function formatEntryTaskDate(value: Date | string): string {
  return new Intl.DateTimeFormat('ru-RU', { day: 'numeric', month: 'long', year: 'numeric', timeZone: 'Europe/Moscow' }).format(new Date(value))
}
