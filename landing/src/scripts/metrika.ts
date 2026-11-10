// Яндекс Метрика страниц буткемпа. Вебвизор выключен: тексты полей анкеты в Метрику не уходят.
import { METRIKA_ID, SITE_URL, type MetrikaGoal } from '../config'

type Ym = ((...args: unknown[]) => void) & { a?: IArguments[], l?: number }

declare global {
  interface Window { ym?: Ym }
}

const NOTICE_KEY = 'bc-cookie-notice'

// Очередь вызовов до загрузки tag.js, как в официальном коде счётчика: tag.js разбирает её сам.
const queue: Ym = Object.assign(function () {
  (queue.a = queue.a ?? []).push(arguments)
}, { l: Date.now() })
const ym: Ym = window.ym ?? queue
window.ym = ym

// tag.js только на боевом домене: локальные прогоны и CI не ходят в Метрику и не портят статистику.
if (location.host === new URL(SITE_URL).host) {
  const script = document.createElement('script')
  script.async = true
  script.src = 'https://mc.yandex.ru/metrika/tag.js'
  document.head.append(script)
}

ym(METRIKA_ID, 'init', { clickmap: true, trackLinks: true, accurateTrackBounce: true, webvisor: false })

let clientId: string | null = null
ym(METRIKA_ID, 'getClientID', (id: unknown) => {
  const value = typeof id === 'number' || typeof id === 'string' ? String(id) : ''
  if (/^\d{1,30}$/.test(value)) clientId = value
})

/** ClientID посетителя: уходит с заявкой, чтобы по нему найти визит в отчётах Метрики. Пока tag.js не загрузился - null. */
export const metrikaClientId = (): string | null => clientId

export function reachGoal(goal: MetrikaGoal): void {
  ym(METRIKA_ID, 'reachGoal', goal)
}

const notice = document.querySelector<HTMLElement>('[data-cookie-notice]')
if (notice) {
  let seen = false
  try { seen = localStorage.getItem(NOTICE_KEY) === '1' } catch { /* без хранилища уведомление показывается при каждом входе */ }
  notice.hidden = seen
  notice.querySelector('[data-cookie-ok]')?.addEventListener('click', () => {
    notice.hidden = true
    try { localStorage.setItem(NOTICE_KEY, '1') } catch { /* закроется до перезагрузки страницы */ }
  })
}
