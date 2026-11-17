import { parseArgs } from 'node:util'

import { setupReactNextBootcamp, type BootcampSetupApi } from '../src/lib/react-next-bootcamp-setup'

type Document = { id: number, [field: string]: unknown }

const document = (value: unknown): Document => {
  if (!value || typeof value !== 'object' || !('id' in value) || typeof value.id !== 'number' || !Number.isSafeInteger(value.id) || value.id <= 0) {
    throw new Error('API вернул документ без корректного ID')
  }
  return { ...value, id: value.id }
}

async function main() {
  const { values } = parseArgs({ options: { apply: { type: 'boolean', default: false } } })
  const { LMS_URL, LMS_ADMIN_EMAIL, LMS_ADMIN_PASSWORD } = process.env
  if (!LMS_URL || !LMS_ADMIN_EMAIL || !LMS_ADMIN_PASSWORD) throw new Error('Нужны LMS_URL, LMS_ADMIN_EMAIL и LMS_ADMIN_PASSWORD в окружении')
  const url = new URL(LMS_URL)
  if (url.username || url.password || url.search || url.hash || url.pathname !== '/') throw new Error('LMS_URL должен быть адресом без пути и учётных данных')
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['localhost', '127.0.0.1', '[::1]'].includes(url.hostname))) {
    throw new Error('Для удалённого API нужен HTTPS; HTTP допустим только на localhost')
  }
  const base = url.origin
  let token = ''
  async function request(method: string, path: string, data?: unknown): Promise<unknown> {
    const response = await fetch(`${base}/api${path}`, {
      method,
      redirect: 'error',
      signal: AbortSignal.timeout(30_000),
      headers: { 'Content-Type': 'application/json', ...(token ? { Authorization: `JWT ${token}` } : {}) },
      ...(data === undefined ? {} : { body: JSON.stringify(data) }),
    })
    // Тело ошибочного ответа может содержать введённые значения; в отчёт оно не попадает.
    if (!response.ok) throw new Error(`API ${method} ${path.split('?')[0]}: HTTP ${response.status}`)
    return response.json()
  }
  const auth = await request('POST', '/users/login', { email: LMS_ADMIN_EMAIL, password: LMS_ADMIN_PASSWORD })
  if (!auth || typeof auth !== 'object' || !('token' in auth) || typeof auth.token !== 'string') throw new Error('API не вернул токен входа')
  token = auth.token
  const me = await request('GET', '/users/me')
  if (!me || typeof me !== 'object' || !('user' in me) || !me.user || typeof me.user !== 'object' || !('role' in me.user) || me.user.role !== 'admin') {
    throw new Error('Для настройки нужна учётная запись администратора')
  }
  async function find(collection: string, field: string, value: string) {
    const query = new URLSearchParams({ [`where[${field}][equals]`]: value, limit: '2', depth: '0' })
    const response = await request('GET', `/${collection}?${query}`)
    if (!response || typeof response !== 'object' || !('docs' in response) || !Array.isArray(response.docs)) throw new Error('API не вернул список документов')
    return response.docs.map(document)
  }
  const api: BootcampSetupApi = {
    findCourse: (slug) => find('courses', 'slug', slug),
    findProgram: (key) => find('bootcamp-programs', 'key', key),
    createProgram: async (data) => {
      const response = await request('POST', '/bootcamp-programs', data)
      if (!response || typeof response !== 'object' || !('doc' in response)) throw new Error('API не вернул созданную программу')
      return document(response.doc)
    },
    readProgram: async (id) => document(await request('GET', `/bootcamp-programs/${id}?depth=0`)),
  }
  const result = await setupReactNextBootcamp(api, values.apply)
  process.stdout.write(`${result.action}: программа react-next${result.id ? `, ID ${result.id}` : ''}, набор ${result.isActive ? 'открыт' : 'закрыт'}\n`)
  if (!values.apply) process.stdout.write('Без записи. Для создания отсутствующей программы добавьте --apply.\n')
}

main().catch((error: unknown) => {
  process.stderr.write(`${error instanceof Error ? error.message : 'Не удалось настроить программу'}\n`)
  process.exitCode = 1
})
