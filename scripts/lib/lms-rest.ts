/**
 * REST LMS от имени администратора: вход, запросы под лимит прокси, выборки до конца.
 * Учётные данные только из окружения; в вывод и ошибки они не попадают.
 */

// Лимит прокси - 120 запросов в минуту на пользователя: идём чуть медленнее.
const MIN_INTERVAL_MS = 550

export type LmsDoc = { id: number; [key: string]: unknown }

export type LmsClientOptions = { base: string; email: string; password: string; fetch?: typeof fetch; minIntervalMs?: number; log?: (line: string) => void }

export function lmsFromEnv() {
  const base = (process.env.LMS_URL ?? '').replace(/\/+$/, '')
  const email = process.env.LMS_ADMIN_EMAIL
  const password = process.env.LMS_ADMIN_PASSWORD
  if (!base || !email || !password) {
    process.stderr.write('Нужны LMS_URL, LMS_ADMIN_EMAIL и LMS_ADMIN_PASSWORD в окружении\n')
    process.exit(2)
  }
  // Пароль админа и токен уходят в заголовках: по открытому каналу допустим только свой компьютер.
  let url: URL
  try { url = new URL(base) } catch { url = new URL('invalid:') }
  const local = url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname)
  if ((url.protocol !== 'https:' && !local) || url.username || url.password) {
    process.stderr.write('LMS_URL должен быть https:// (http:// только для localhost) и без логина и пароля в адресе\n')
    process.exit(2)
  }
  return createLmsClient({ base, email, password })
}

export type LmsClient = ReturnType<typeof createLmsClient>

export function createLmsClient({ base, email, password, fetch: request = globalThis.fetch, minIntervalMs = MIN_INTERVAL_MS, log = (line) => process.stdout.write(line) }: LmsClientOptions) {
  let token: string | null = null
  let last = 0

  async function api<T = unknown>(method: string, url: string, body?: unknown): Promise<T> {
    for (let attempt = 1; ; attempt += 1) {
      const wait = last + minIntervalMs - Date.now()
      if (wait > 0) await new Promise((resolve) => setTimeout(resolve, wait))
      last = Date.now()
      const response = await request(`${base}/api${url}`, {
        method,
        headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `JWT ${token}` } : {}) },
        body: body === undefined ? undefined : JSON.stringify(body),
      })
      if (response.status === 429 && attempt < 4) {
        const seconds = Number(response.headers.get('retry-after')) || 30
        log(`  … лимит запросов, жду ${seconds} с\n`)
        await new Promise((resolve) => setTimeout(resolve, seconds * 1000))
        continue
      }
      const text = await response.text()
      let json: unknown = null
      try {
        json = text ? JSON.parse(text) : null
      } catch {
        throw new Error(`${method} ${url}: ${response.status}, ответ не JSON: ${text.slice(0, 200)}`)
      }
      if (!response.ok) {
        const errors = json && typeof json === 'object' && 'errors' in json ? (json as { errors: unknown }).errors : json
        throw new Error(`${method} ${url}: ${response.status} ${JSON.stringify(errors).slice(0, 500)}`)
      }
      return json as T
    }
  }

  /** Все документы выборки: страницы до конца, а не первые N. */
  async function findAll(collection: string, where: string): Promise<LmsDoc[]> {
    const docs: LmsDoc[] = []
    for (let page = 1; ; page += 1) {
      const result = await api<{ docs: LmsDoc[]; hasNextPage: boolean }>('GET', `/${collection}?${where}&depth=0&limit=50&page=${page}`)
      docs.push(...result.docs)
      if (!result.hasNextPage) return docs
    }
  }

  async function login(): Promise<void> {
    token = (await api<{ token?: string }>('POST', '/users/login', { email, password })).token ?? null
    if (!token) throw new Error('вход не выдал токен')
    const me = await api<{ user?: { role?: string } }>('GET', '/users/me')
    if (me?.user?.role !== 'admin') throw new Error('учётная запись не администратор')
  }

  async function logout(): Promise<void> {
    if (!token) return
    await api('POST', '/users/logout').catch((error: unknown) => process.stderr.write(`Выход не выполнен: ${error instanceof Error ? error.message : 'ошибка'}\n`))
    token = null
  }

  return { base, api, findAll, login, logout }
}

export const relationId = (value: unknown): unknown => (value && typeof value === 'object' && 'id' in value ? (value as { id: unknown }).id : value)

/**
 * Документ из Payload приводится к форме желаемого значения: строки массивов приходят
 * с id и пустыми необязательными полями, их нельзя считать изменением.
 */
function project(actual: unknown, wanted: unknown): unknown {
  if (Array.isArray(wanted)) return Array.isArray(actual) && actual.length === wanted.length ? actual.map((item, index) => project(item, wanted[index])) : actual ?? null
  if (wanted && typeof wanted === 'object') {
    if (!actual || typeof actual !== 'object') return actual ?? null
    return Object.fromEntries(Object.keys(wanted).map((key) => [key, project((actual as Record<string, unknown>)[key], (wanted as Record<string, unknown>)[key])]))
  }
  return actual ?? null
}

const RELATIONS = new Set(['topic', 'course', 'section', 'roadmap', 'roadmapNode'])

export function changedKeys(doc: Record<string, unknown>, wanted: Record<string, unknown>, skip: readonly string[] = []): string[] {
  return Object.keys(wanted).filter((key) => {
    if (skip.includes(key)) return false
    const actual = RELATIONS.has(key) ? relationId(doc[key]) : doc[key]
    return JSON.stringify(project(actual, wanted[key])) !== JSON.stringify(wanted[key] ?? null)
  })
}
