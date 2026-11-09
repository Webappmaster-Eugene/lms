import program from './bootcamp-program.json' with { type: 'json' }
import { PROGRAM } from './bootcamp'

/**
 * Подробная программа по неделям. Источник - методички bootcamp/content: файл
 * bootcamp-program.json выгружает `npm run export:landing <путь>` в репозитории content,
 * руками его не правят. Технологии недель (WEEK_STACK) - короткие теги для страницы и
 * разметки, сверены с текстом методичек 09.11.2026.
 */
export interface ProgramWeek {
  number: number
  slug: string
  title: string
  subtitle: string
  version: string
  readingMinutes: number
  practiceMinutes: number
  competencies: string[]
  /** Начало «Задачи проката»: первый абзац, а если он короткий, то и второй. */
  task: string | null
  /** «Результаты обучения» методички без кодов компетенций. */
  outcomes: string[]
  /** «Вопросы собеседования» методички, без ответов. */
  questions: string[]
}

export interface Competency {
  title: string
  /** S - самостоятельно, свой код и доверенная проверка; A - архитектурная практика. */
  level: 'S' | 'A'
}

export const PROGRAM_SOURCE: string = program.source
export const PROGRAM_WEEKS_DETAILED = program.weeks as ProgramWeek[]
export const COMPETENCIES = program.competencies as Record<string, Competency>
export const INTERVIEW_QUESTIONS_TOTAL = PROGRAM_WEEKS_DETAILED.reduce((sum, week) => sum + week.questions.length, 0)

export const WEEK_STACK: Record<number, readonly string[]> = {
  0: ['Git', 'Docker', 'SQL'],
  1: ['Node.js', 'TypeScript', 'Streams', 'worker_threads', 'Zod'],
  2: ['Fastify', 'OpenAPI', 'Zod'],
  3: ['PostgreSQL', 'транзакции', 'Docker Compose'],
  4: ['NestJS', 'Fastify'],
  5: ['сессии', 'CSRF', 'scrypt', 'RBAC'],
  6: ['платежи', 'webhooks', 'идемпотентность'],
  7: ['Redis', 'LRU', 'rate limiting'],
  8: ['RabbitMQ', 'Transactional Outbox', 'Inbox', 'DLQ'],
  9: ['таймауты', 'ретраи', 'Circuit Breaker'],
  10: ['отдельный сервис', 'контракты событий', 'correlation ID'],
  11: ['PostgreSQL', 'полнотекстовый поиск', 'JSONB', 'EXPLAIN', 'keyset'],
  12: ['SaaS', 'подписки', 'лимиты тарифа'],
  13: ['Kafka', 'партиции', 'consumer groups'],
  14: ['Kafka', 'offsets', 'replay', 'DLQ'],
  15: ['ClickHouse', 'MergeTree', 'Kafka'],
  16: ['ClickHouse', 'отчёты', 'сверка'],
  17: ['k6', 'Prometheus', 'OpenTelemetry', 'system design'],
  18: ['pg_dump', 'SSRF', 'права ролей', 'выпуск по тегу'],
  19: ['анализ влияния', 'OpenAPI', 'expand-contract'],
  20: ['выпуск v1.0.0', 'демонстрация', 'защита'],
}

export const weekAnchor = (number: number) => `week-${String(number).padStart(2, '0')}`

/** Даты встреч из календаря потока для учебной недели программы. */
export function weekDates(number: number): string {
  const row = PROGRAM.find(({ weeks }) => {
    if (!weeks) return false
    const bounds = weeks.split('-').map(Number)
    return number >= Math.min(...bounds) && number <= Math.max(...bounds)
  })
  if (!row) throw new Error(`Неделя ${number} не найдена в календаре потока`)
  return row.dates
}

/** «2,5 часа» и «13 часов»: время недели по оценке методички. */
export function hoursText(minutes: number): string {
  const hours = minutes / 60
  const text = Number.isInteger(hours) ? String(hours) : hours.toFixed(1).replace('.', ',')
  const whole = Math.floor(hours)
  const noun = !Number.isInteger(hours) ? 'часа' : whole % 10 === 1 && whole % 100 !== 11 ? 'час' : [2, 3, 4].includes(whole % 10) && ![12, 13, 14].includes(whole % 100) ? 'часа' : 'часов'
  return `${text} ${noun}`
}

/** «1 вопрос», «3 вопроса», «164 вопроса», «11 вопросов». */
export function plural(count: number, [one, few, many]: readonly [string, string, string]): string {
  const last = count % 10
  const lastTwo = count % 100
  const word = lastTwo >= 11 && lastTwo <= 14 ? many : last === 1 ? one : last >= 2 && last <= 4 ? few : many
  return `${count} ${word}`
}

export const QUESTIONS_TEXT = plural(INTERVIEW_QUESTIONS_TOTAL, ['вопрос', 'вопроса', 'вопросов'])

/** Текст с `кодом` - части для вывода: код в <code>, остальное как есть. */
export function inlineCode(text: string): { code: boolean; text: string }[] {
  return text.split(/(`[^`]+`)/).filter(Boolean).map((part) => (part.startsWith('`') && part.endsWith('`') && part.length > 2 ? { code: true, text: part.slice(1, -1) } : { code: false, text: part }))
}

/** Текст без обратных кавычек: для разметки, llms.txt и описаний. */
export const plainText = (text: string) => text.replace(/`([^`]+)`/g, '$1')
