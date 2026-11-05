/**
 * Анкета заявки на буткемп. Лендинг - отдельный пакет и не видит кода LMS, поэтому варианты и пороги
 * записаны и здесь: расхождение с src/lib/bootcamp-leads.ts ловит tests/smoke/bootcampLanding.smoke.test.ts.
 */
export const LEAD_REASONS = [
  { value: 'first-job', label: 'Первая работа в ИТ' },
  { value: 'switch-or-grow', label: 'Сменить работу или вырасти в грейде' },
  { value: 'interviews', label: 'Подготовка к собеседованиям' },
  { value: 'new-area', label: 'Перейти в другую область' },
  { value: 'other', label: 'Другое' },
] as const
export const LEAD_URGENCIES = [
  { value: 'now', label: 'Нужно сейчас' },
  { value: 'soon', label: '1-3 месяца' },
  { value: 'browsing', label: 'Присматриваюсь' },
] as const
export const LEAD_HOURS = [
  { value: 'under-5', label: 'До 5' },
  { value: '5-10', label: '5-10' },
  { value: '10-20', label: '10-20' },
  { value: 'over-20', label: 'Больше 20' },
] as const

export const LEAD_ANSWER_LIMITS = {
  problem: { min: 100, max: 3000, words: 10, distinct: 6 },
  story: { min: 100, max: 3000, words: 10, distinct: 6 },
  goal: { min: 20, max: 1500, words: 3, distinct: 1 },
} as const
export const LEAD_LINKS_MAX = 5
export const LEAD_RESUME_MAX_BYTES = 5 * 1024 * 1024

/** Личный аккаунт наставника: написать туда - последний шаг заявки. */
export const PERSONAL_TELEGRAM = { handle: 'eugene_galera', url: 'https://t.me/eugene_galera' }
