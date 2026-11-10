// Заявка на буткемп. Успех показывается только после ответа сервера о сохранении:
// при сбое сети введённое остаётся в полях, и заявку можно отправить ещё раз.
import { METRIKA_GOALS } from '../config'
import { LEAD_ANSWER_LIMITS, LEAD_LINKS_MAX, LEAD_REASONS, LEAD_RESUME_MAX_BYTES, PERSONAL_TELEGRAM } from '../data/bootcamp-form'
import { metrikaClientId, reachGoal } from './metrika'

const ENDPOINT = '/api/bootcamp/leads'
const TIMEOUT_MS = 15_000
// Файл на пять мегабайт с телефона идёт дольше, чем текст анкеты.
const UPLOAD_TIMEOUT_MS = 120_000
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']
const EMAIL = /^[^\s@]+@[^\s@.][^\s@]*\.[^\s@]{2,}$/
const TELEGRAM = /^(?:(?:https?:\/\/)?(?:www\.)?t(?:elegram)?\.me\/@?|@?)[a-zA-Z][a-zA-Z0-9_]{4,31}\/?$/
const PHONE = /^\+?\d{10,15}$/

type Answer = keyof typeof LEAD_ANSWER_LIMITS
type Input = HTMLInputElement | HTMLTextAreaElement | HTMLSelectElement

const wordsOf = (value: string) => value.toLowerCase().match(/\p{L}{2,}/gu) ?? []

function answerError(field: Answer, value: string, empty: string): string {
  const { min, words, distinct } = LEAD_ANSWER_LIMITS[field]
  if (!value) return empty
  const found = wordsOf(value)
  return value.length < min || found.length < words || new Set(found).size < distinct ? `Расскажите подробнее: нужно хотя бы ${min} знаков связного текста.` : ''
}

function linksError(value: string): string {
  const parts = value.split(/[\s,]+/).filter(Boolean)
  if (parts.length > LEAD_LINKS_MAX) return `Укажите не больше ${LEAD_LINKS_MAX} ссылок.`
  for (const part of parts) {
    try {
      const url = new URL(/^[a-z][a-z0-9+.-]*:/i.test(part) ? part : `https://${part}`)
      if (!['http:', 'https:'].includes(url.protocol) || !url.hostname.includes('.')) return `Проверьте ссылку: ${part.slice(0, 60)}`
    } catch {
      return `Проверьте ссылку: ${part.slice(0, 60)}`
    }
  }
  return ''
}

const form = document.querySelector<HTMLFormElement>('[data-lead-form]')
if (form) setup(form)

function setup(form: HTMLFormElement) {
  const input = (name: string) => form.elements.namedItem(name) as Input
  const value = (name: string) => input(name).value.trim()
  const resume = input('resume') as HTMLInputElement
  const consent = input('consent') as HTMLInputElement
  const submit = form.querySelector<HTMLButtonElement>('[data-submit]')!
  const status = form.querySelector<HTMLElement>('[data-status]')!
  const done = document.querySelector<HTMLElement>('[data-done]')!
  // Метки рекламы и сайт перехода - с момента входа на страницу, а не отправки.
  const params = new URLSearchParams(location.search)
  const referrer = document.referrer && new URL(document.referrer).host !== location.host ? document.referrer : undefined
  // С первого ввода, а не с открытия страницы: страницу могли читать час, а робот в поля не печатает.
  let startedAt = 0
  // В ссылке имя из анкеты, поэтому сам переход Метрика не записывает (ym-disable-tracklink), только цель.
  done.querySelector('[data-telegram-link]')!.addEventListener('click', () => reachGoal(METRIKA_GOALS.telegram))

  /** Порядок - порядок на странице: фокус уходит на первое неверное поле. */
  const checks: Record<string, () => string> = {
    name: () => value('name').length >= 2 ? '' : 'Как к вам обращаться? Укажите имя.',
    telegram: () => TELEGRAM.test(value('telegram')) || PHONE.test(value('telegram').replace(/[\s()-]/g, '')) ? '' : 'Укажите Telegram: ник, ссылку t.me или телефон.',
    email: () => !value('email') ? 'Укажите email: на него придёт ответ на заявку.' : EMAIL.test(value('email')) ? '' : 'Проверьте email: в нём должны быть @ и домен, например name@mail.ru.',
    reason: () => value('reason') ? '' : 'Выберите, с чем вы пришли.',
    problem: () => answerError('problem', value('problem'), 'Расскажите, в чём сейчас проблема.'),
    story: () => answerError('story', value('story'), 'Расскажите свою историю.')
      || (wordsOf(value('story')).join(' ') === wordsOf(value('problem')).join(' ') ? 'История совпадает с описанием проблемы. Расскажите, где вы работали или учились.' : ''),
    goal: () => answerError('goal', value('goal'), 'Напишите, какой результат будет успехом и к какому сроку.'),
    urgency: () => value('urgency') ? '' : 'Выберите, насколько это срочно.',
    hoursPerWeek: () => value('hoursPerWeek') ? '' : 'Выберите, сколько часов в неделю готовы уделять.',
    links: () => linksError(value('links')),
    resume: () => {
      const file = resume.files?.[0]
      if (!file) return ''
      if (file.size > LEAD_RESUME_MAX_BYTES) return 'Файл резюме больше 5 МБ. Приложите файл поменьше или дайте ссылку на него.'
      return /\.(pdf|docx)$/i.test(file.name) ? '' : 'Резюме принимается в PDF или DOCX. Сохраните файл в одном из них или дайте ссылку на него.'
    },
    consent: () => consent.checked ? '' : 'Отметьте согласие, чтобы мы могли принять заявку.',
  }

  function showError(field: string, message: string) {
    const error = form.querySelector<HTMLElement>(`[data-error-for="${field}"]`)!
    error.textContent = message
    error.hidden = message === ''
    input(field).setAttribute('aria-invalid', message === '' ? 'false' : 'true')
  }

  /** Фокус уводится только при отправке: при переходе Tab между полями он должен идти своим порядком. */
  function validate(): boolean {
    let first: Input | null = null
    for (const [field, check] of Object.entries(checks)) {
      const message = check()
      showError(field, message)
      if (message && !first) first = input(field)
    }
    first?.focus()
    return !first
  }

  // Ошибка уходит, как только поле исправлено, а новая не появляется, пока человек ещё печатает.
  for (const [field, check] of Object.entries(checks)) {
    const recheck = () => { if (input(field).getAttribute('aria-invalid') === 'true') showError(field, check()) }
    input(field).addEventListener('blur', recheck)
    input(field).addEventListener('change', recheck)
  }

  form.addEventListener('input', (event) => {
    if (!startedAt) {
      startedAt = performance.now()
      reachGoal(METRIKA_GOALS.formStart)
    }
    const target = event.target as Input
    const counter = form.querySelector<HTMLElement>(`[data-count-for="${target.name}"]`)
    if (counter) counter.textContent = `${target.value.trim().length} из ${LEAD_ANSWER_LIMITS[target.name as Answer].min} знаков`
  })

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (submit.disabled || !validate()) return
    submit.disabled = true
    submit.textContent = 'Отправляем…'
    status.textContent = ''
    const data = new FormData(form)
    data.set('program', form.dataset.program ?? '')
    data.set('consentVersion', form.dataset.consentVersion ?? '')
    data.set('fillMs', String(startedAt ? Math.round(performance.now() - startedAt) : 0))
    for (const key of UTM_KEYS) { const mark = params.get(key); if (mark) data.set(key, mark) }
    if (referrer) data.set('referrer', referrer)
    const clientId = metrikaClientId()
    if (clientId) data.set('ymClientId', clientId)
    const limit = resume.files?.length ? UPLOAD_TIMEOUT_MS : TIMEOUT_MS
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), limit)
    try {
      const response = await fetch(ENDPOINT, { method: 'POST', body: data, signal: controller.signal })
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string; field?: string } | null
      if (response.ok && result?.ok) {
        reachGoal(METRIKA_GOALS.leadSubmit)
        const reason = LEAD_REASONS.find((item) => item.value === value('reason'))?.label ?? ''
        const text = `Здравствуйте! Меня зовут ${value('name')}. Заявка на буткемп ${form.dataset.programTitle}: ${reason}.`
        done.querySelector<HTMLAnchorElement>('[data-telegram-link]')!.href = `${PERSONAL_TELEGRAM.url}?text=${encodeURIComponent(text)}`
        done.querySelector('[data-done-email]')!.textContent = value('email')
        form.hidden = true
        done.hidden = false
        done.focus()
        return
      }
      if (result?.error && result.field && result.field in checks) {
        showError(result.field, result.error)
        input(result.field).focus()
        return
      }
      status.textContent = result?.error ?? `Заявка не сохранилась: сервер ответил ${response.status}. Отправьте её ещё раз через минуту.`
    } catch {
      status.textContent = controller.signal.aborted
        ? `Сервер не ответил за ${limit / 1000} секунд. Заявка могла не сохраниться. Отправьте её ещё раз, дубля не будет.`
        : 'Нет связи с сервером. Проверьте интернет и отправьте заявку ещё раз. Введённые данные остались в форме.'
    } finally {
      clearTimeout(timer)
      submit.disabled = false
      submit.textContent = 'Оставить заявку'
    }
  })
}
