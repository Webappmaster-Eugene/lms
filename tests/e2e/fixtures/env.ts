import { APP_PORT, LANDING_PORT } from './data'

/** Адреса приложения и лендинга. В контейнере Playwright — через host.docker.internal. */
export const APP_URL = process.env.E2E_BASE_URL ?? `http://localhost:${APP_PORT}`
export const LANDING_URL = process.env.E2E_LANDING_URL ?? `http://localhost:${LANDING_PORT}`

/**
 * Опции спеков лендинга. Глобальный Origin платформы из playwright.config.ts сбрасывается:
 * с чужим Origin Chrome отклоняет подресурсы лендинга (net::ERR_INVALID_ARGUMENT),
 * и страница остаётся без CSS и JS.
 */
export const LANDING_USE = { baseURL: LANDING_URL, extraHTTPHeaders: {} }

export const AUTH_DIR = new URL('../.auth/', import.meta.url).pathname

export type Role = 'admin' | 'student' | 'leader' | 'doer'

export const storageStateOf = (role: Role) => `${AUTH_DIR}${role}.json`
