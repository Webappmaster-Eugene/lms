// Форма предзаписи. Успех показывается только после ответа сервера о сохранении:
// при сбое сети введённое остаётся в полях, и заявку можно отправить ещё раз.
const ENDPOINT = '/api/bootcamp/leads'
const TIMEOUT_MS = 15_000
const UTM_KEYS = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_content', 'utm_term']
const EMAIL = /^[^\s@]+@[^\s@.][^\s@]*\.[^\s@]{2,}$/

const form = document.querySelector<HTMLFormElement>('[data-lead-form]')
if (form) setup(form)

function setup(form: HTMLFormElement) {
  const email = form.elements.namedItem('email') as HTMLInputElement
  const name = form.elements.namedItem('name') as HTMLInputElement
  const consent = form.elements.namedItem('consent') as HTMLInputElement
  const website = form.elements.namedItem('website') as HTMLInputElement
  const submit = form.querySelector<HTMLButtonElement>('[data-submit]')!
  const status = form.querySelector<HTMLElement>('[data-status]')!
  const done = document.querySelector<HTMLElement>('[data-done]')!
  // Метки рекламы и сайт перехода — с момента входа на страницу, а не отправки.
  const params = new URLSearchParams(location.search)
  const utm = Object.fromEntries(UTM_KEYS.flatMap((key) => (params.get(key) ? [[key, params.get(key)]] : [])))
  const referrer = document.referrer && new URL(document.referrer).host !== location.host ? document.referrer : undefined

  function showError(field: 'email' | 'consent', message: string) {
    const input = field === 'email' ? email : consent
    const error = form.querySelector<HTMLElement>(`[data-error-for="${field}"]`)!
    error.textContent = message
    error.hidden = message === ''
    input.setAttribute('aria-invalid', message === '' ? 'false' : 'true')
  }

  function checkEmail() {
    const address = email.value.trim()
    showError('email', !address ? 'Укажите email: на него придёт входное задание.' : EMAIL.test(address) ? '' : 'Проверьте email: в нём должны быть @ и домен, например name@mail.ru.')
  }

  /** Фокус уводится только при отправке: при переходе Tab между полями он должен идти своим порядком. */
  function validate(): boolean {
    checkEmail()
    showError('consent', consent.checked ? '' : 'Отметьте согласие, чтобы мы могли принять заявку.')
    const firstInvalid = [email, consent].find((input) => input.getAttribute('aria-invalid') === 'true')
    firstInvalid?.focus()
    return !firstInvalid
  }

  email.addEventListener('blur', () => { if (email.getAttribute('aria-invalid') === 'true') checkEmail() })
  consent.addEventListener('change', () => { if (consent.checked) showError('consent', '') })

  form.addEventListener('submit', async (event) => {
    event.preventDefault()
    if (submit.disabled || !validate()) return
    submit.disabled = true
    submit.textContent = 'Отправляем…'
    status.textContent = ''
    const controller = new AbortController()
    const timer = setTimeout(() => controller.abort(), TIMEOUT_MS)
    try {
      const response = await fetch(ENDPOINT, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          program: 'nodejs', email: email.value.trim(), name: name.value.trim(), consent: consent.checked,
          consentVersion: form.dataset.consentVersion, website: website.value, utm, referrer,
        }),
        signal: controller.signal,
      })
      const result = await response.json().catch(() => null) as { ok?: boolean; error?: string } | null
      if (response.ok && result?.ok) {
        done.querySelector('[data-done-email]')!.textContent = email.value.trim()
        form.hidden = true
        done.hidden = false
        done.focus()
        return
      }
      status.textContent = result?.error ?? `Заявка не сохранилась: сервер ответил ${response.status}. Отправьте её ещё раз через минуту.`
    } catch {
      status.textContent = controller.signal.aborted
        ? 'Сервер не ответил за 15 секунд. Заявка могла не сохраниться. Отправьте её ещё раз, дубля не будет.'
        : 'Нет связи с сервером. Проверьте интернет и отправьте заявку ещё раз. Введённые данные остались в форме.'
    } finally {
      clearTimeout(timer)
      submit.disabled = false
      submit.textContent = 'Оставить заявку'
    }
  })
}
