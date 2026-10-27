/** Общие константы тестового окружения интеграционных тестов. */
import { loadWorktreeEnv } from '../../../scripts/worktree-env.mjs'

/**
 * Своё имя базы позволяет гонять интеграцию параллельно из нескольких worktree:
 * глобальный setup пересоздаёт базу, и общая база сносила бы чужой прогон.
 * В дереве после `pnpm wt:setup` имя приходит из .worktree.env.
 * Имя попадает в DROP/CREATE DATABASE без кавычек — поэтому только [a-z0-9_].
 */
loadWorktreeEnv()
export const INTEGRATION_DB = integrationDb(process.env.LMS_INTEGRATION_DB)

export function integrationDb(name: string | undefined): string {
  if (!name) return 'lms_integration'
  if (!/^[a-z][a-z0-9_]{0,62}$/.test(name)) throw new Error(`LMS_INTEGRATION_DB: допустимы строчные латинские буквы, цифры и _, получено «${name}»`)
  return name
}

/** Базы отдельных проверок (сид, миграции) получают тот же префикс, что и основная. */
export function auxiliaryDb(name: 'lms_seed' | 'lms_migrations'): string {
  return process.env.LMS_INTEGRATION_DB ? `${INTEGRATION_DB}_${name.slice('lms_'.length)}` : name
}

export const TEST_SECRET ='integration-test-secret-not-for-production-0001'

/** Админ, которого создаёт onInit на пустой базе (см. payload.config.ts). */
export const BOOTSTRAP_ADMIN = {
  email: 'bootstrap-admin@lms.test',
  password: 'Bootstrap-Admin-Pass-1',
}
