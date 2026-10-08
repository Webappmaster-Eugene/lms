const contents = document.querySelector<HTMLDetailsElement>('.contents details')
const compact = window.matchMedia('(max-width: 800px)')
const setContents = () => { if (contents) contents.open = !compact.matches }
setContents()
compact.addEventListener('change', setContents)
document.querySelectorAll<HTMLAnchorElement>('.contents a[href^="#"]').forEach(link => {
  link.addEventListener('click', () => { if (contents && compact.matches) contents.open = false })
})

const dialog = document.querySelector<HTMLDialogElement>('.image-dialog')
const dialogImage = dialog?.querySelector<HTMLImageElement>('img')
let zoomTrigger: HTMLElement | null = null

document.querySelector<HTMLButtonElement>('[data-close-dialog]')?.addEventListener('click', () => dialog?.close())
dialog?.addEventListener('close', () => zoomTrigger?.focus())
dialog?.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close()
})

const openImage = (source: HTMLImageElement, trigger: HTMLElement | null, description: string) => {
  if (!dialog || !dialogImage) return
  zoomTrigger = trigger
  dialogImage.src = source.src
  dialogImage.alt = source.alt
  const caption = dialog.querySelector<HTMLElement>('[data-dialog-description]')
  if (caption) caption.textContent = description
  dialog.showModal()
}

for (const trigger of document.querySelectorAll<HTMLButtonElement>('[data-zoom-static]')) {
  trigger.addEventListener('click', () => {
    const source = trigger.closest('figure')?.querySelector<HTMLImageElement>('img')
    if (source) openImage(source, trigger, source.alt)
  })
}

for (const walkthrough of document.querySelectorAll<HTMLElement>('[data-walkthrough]')) {
  const steps = Array.from(walkthrough.querySelectorAll<HTMLElement>('[data-step]'))
  const selectors = Array.from(walkthrough.querySelectorAll<HTMLButtonElement>('[data-select]'))
  const hotspots = Array.from(walkthrough.querySelectorAll<HTMLButtonElement>('[data-hotspot]'))
  const play = walkthrough.querySelector<HTMLButtonElement>('[data-play]')
  const status = walkthrough.querySelector<HTMLElement>('.guide-status')
  let current = 0
  let timer: ReturnType<typeof setInterval> | undefined
  walkthrough.classList.add('enhanced')

  const select = (index: number, announce = true) => {
    if (index < 0 || index >= steps.length) return
    current = index
    steps.forEach((step, i) => { step.dataset.active = String(i === index) })
    for (const buttons of [selectors, hotspots]) {
      buttons.forEach((button, i) => {
        button.dataset.active = String(i === index)
        button.setAttribute('aria-pressed', String(i === index))
      })
    }
    if (status && announce) status.textContent = `Шаг ${index + 1} из ${steps.length}: ${selectors[index]?.textContent?.trim() ?? ''}`
  }

  const stop = () => {
    if (timer !== undefined) clearInterval(timer)
    timer = undefined
    play?.setAttribute('aria-pressed', 'false')
    if (play) play.innerHTML = '<span aria-hidden="true">▷</span> Показать шаги'
  }

  for (const [index, button] of selectors.entries()) button.addEventListener('click', () => { stop(); select(index) })
  for (const [index, button] of hotspots.entries()) button.addEventListener('click', () => { stop(); select(index) })
  play?.addEventListener('click', () => {
    if (timer !== undefined) { stop(); return }
    select(0)
    play.setAttribute('aria-pressed', 'true')
    play.innerHTML = '<span aria-hidden="true">Ⅱ</span> Остановить'
    timer = setInterval(() => {
      if (current === steps.length - 1) { stop(); return }
      select(current + 1)
    }, 6500)
  })

  walkthrough.querySelector<HTMLButtonElement>('[data-zoom]')?.addEventListener('click', (event) => {
    stop()
    const source = walkthrough.querySelector<HTMLImageElement>('.screen-image img')
    if (!source) return
    openImage(source, event.currentTarget instanceof HTMLElement ? event.currentTarget : null, steps[current]?.textContent?.trim() ?? '')
  })

  document.addEventListener('visibilitychange', () => { if (document.hidden) stop() })
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      if (!entries[0]?.isIntersecting) stop()
    }).observe(walkthrough)
  }
}

const links = Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-chapter-link]'))
const chapters = Array.from(document.querySelectorAll<HTMLElement>('[data-chapter]'))
if ('IntersectionObserver' in window) {
  const observer = new IntersectionObserver(entries => {
    const visible = entries.filter(entry => entry.isIntersecting).sort((a, b) => a.boundingClientRect.top - b.boundingClientRect.top)
    if (!visible[0]) return
    links.forEach(link => {
      if (link.hash === `#${visible[0].target.id}`) link.setAttribute('aria-current', 'location')
      else link.removeAttribute('aria-current')
    })
  }, { rootMargin: '-15% 0px -60% 0px' })
  chapters.forEach(chapter => observer.observe(chapter))
}

const checks = Array.from(document.querySelectorAll<HTMLInputElement>('[data-check]'))
const count = document.querySelector<HTMLElement>('[data-check-count]')
const storageKey = 'mentorcareer-guide-checklist-v1'
const updateCount = () => { if (count) count.textContent = String(checks.filter(check => check.checked).length) }
try {
  const saved: unknown = JSON.parse(localStorage.getItem(storageKey) ?? '[]')
  if (Array.isArray(saved)) checks.forEach((check, i) => { check.checked = saved[i] === true })
} catch {
  // A browser may block local storage; the checklist still works for this visit.
}
updateCount()
checks.forEach(check => check.addEventListener('change', () => {
  updateCount()
  try { localStorage.setItem(storageKey, JSON.stringify(checks.map(item => item.checked))) } catch {
    // Persistence is optional and must not prevent using the checklist.
  }
}))
