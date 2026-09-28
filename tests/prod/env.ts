export const PROD_URL = process.env.PROD_BASE_URL ?? 'https://learn.mentorcareer.ru'

/** Временные аккаунты прогона — из env, который задаёт scripts/prod-test-accounts.mjs. */
function required(name: string): string {
  const value = process.env[name]
  if (!value) throw new Error(`${name} не задан — запускайте через pnpm test:prod`)
  return value
}

export const RUN_ID = required('PROD_RUN_ID')
/** Метка прогона в текстах: по ней удаляются уведомления реальным админам о тестовых вопросах. */
export const MARK = `e2e-prod ${RUN_ID}`

export const ACCOUNTS = {
  student: { email: required('PROD_STUDENT_EMAIL'), password: required('PROD_STUDENT_PASSWORD') },
  admin: { email: required('PROD_ADMIN_EMAIL'), password: required('PROD_ADMIN_PASSWORD') },
} as const

export type Role = keyof typeof ACCOUNTS

const AUTH_DIR = new URL('./.auth/', import.meta.url).pathname
export const stateOf = (role: Role) => `${AUTH_DIR}${role}.json`
