document.documentElement.classList.add('guide-ready')

const contents = document.querySelector<HTMLDetailsElement>('.contents details')
const compact = window.matchMedia('(max-width: 800px)')
const setContents = () => { if (contents) contents.open = !compact.matches }
setContents()
compact.addEventListener('change', setContents)
const contentsSearch = document.querySelector<HTMLInputElement>('#contents-search')
const contentsLinks = Array.from(document.querySelectorAll<HTMLAnchorElement>('[data-chapter-link]'))
const contentsEmpty = document.querySelector<HTMLElement>('[data-contents-empty]')
const normalize = (value: string) => value.toLocaleLowerCase('ru').replaceAll('ё', 'е').trim()
const filterContents = () => {
  const term = normalize(contentsSearch?.value ?? '')
  contentsLinks.forEach(link => { link.hidden = !normalize(link.dataset.search ?? link.textContent ?? '').includes(term) })
  if (contentsEmpty) contentsEmpty.hidden = contentsLinks.some(link => !link.hidden)
}
contentsSearch?.addEventListener('input', filterContents)
document.querySelector<HTMLFormElement>('[data-contents-search]')?.addEventListener('submit', event => {
  event.preventDefault()
  contentsLinks.find(link => !link.hidden)?.click()
})
contentsLinks.forEach(link => {
  link.addEventListener('click', () => {
    if (contents && compact.matches) {
      contents.open = false
      requestAnimationFrame(() => {
        const heading = document.getElementById(link.hash.slice(1))?.querySelector<HTMLElement>('h1, h2')
        if (heading) {
          heading.setAttribute('tabindex', '-1')
          heading.focus({ preventScroll: true })
        }
      })
    }
    if (contentsSearch) contentsSearch.value = ''
    filterContents()
  })
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

// Мелкий скриншот на телефоне без приближения не читается, а на компьютере сильное увеличение размывает картинку.
const TOUR_ZOOM_MIN = 1.6
const TOUR_ZOOM_MAX = 2.4

for (const walkthrough of document.querySelectorAll<HTMLElement>('[data-walkthrough]')) {
  const steps = Array.from(walkthrough.querySelectorAll<HTMLElement>('[data-step]'))
  const selectors = Array.from(walkthrough.querySelectorAll<HTMLButtonElement>('[data-select]'))
  const hotspots = Array.from(walkthrough.querySelectorAll<HTMLButtonElement>('[data-hotspot]'))
  const play = walkthrough.querySelector<HTMLButtonElement>('[data-play]')
  const status = walkthrough.querySelector<HTMLElement>('.guide-status')
  const canvas = walkthrough.querySelector<HTMLElement>('.screen-canvas')
  const image = canvas?.querySelector<HTMLImageElement>('img')
  const label = walkthrough.querySelector<HTMLElement>('[data-tour-label]')
  const progress = walkthrough.querySelector<HTMLElement>('[data-tour-progress]')
  const idleLabel = label?.textContent ?? ''
  let current = 0
  let timer: ReturnType<typeof setTimeout> | undefined
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
    if (status && announce) status.textContent = `Шаг ${index + 1} из ${steps.length}: ${steps[index]?.dataset.title ?? ''}`
  }

  // Приближает скриншот к метке шага так, чтобы край картинки не уходил внутрь кадра.
  const zoomTo = (index: number) => {
    const spot = hotspots[index]
    if (!canvas || !image || !spot) return
    const ratio = Number(image.getAttribute('width')) / image.clientWidth
    const zoom = Math.min(TOUR_ZOOM_MAX, Math.max(TOUR_ZOOM_MIN, ratio || TOUR_ZOOM_MAX))
    const shift = (point: number) => Math.min(0, Math.max(100 - 100 * zoom, 50 - point * zoom))
    canvas.style.setProperty('--zoom', String(zoom))
    canvas.style.setProperty('--shift-x', `${shift(Number(spot.dataset.x))}%`)
    canvas.style.setProperty('--shift-y', `${shift(Number(spot.dataset.y))}%`)
  }

  const stop = () => {
    if (timer !== undefined) clearTimeout(timer)
    timer = undefined
    walkthrough.classList.remove('touring')
    progress?.getAnimations().forEach(animation => animation.cancel())
    if (label) label.textContent = idleLabel
    play?.setAttribute('aria-pressed', 'false')
    if (play) play.innerHTML = '<span aria-hidden="true">▷</span> Показать шаги'
  }

  const show = (index: number) => {
    select(index)
    zoomTo(index)
    if (label) label.textContent = `Шаг ${index + 1} из ${steps.length} · ${steps[index]?.dataset.title ?? ''}`
    // Длинное пояснение держится на экране дольше, чтобы его успели дочитать.
    const length = steps[index]?.querySelector('p')?.textContent?.length ?? 0
    const duration = Math.min(9000, Math.max(5000, 2500 + length * 35))
    progress?.getAnimations().forEach(animation => animation.cancel())
    progress?.animate([{ transform: 'scaleX(0)' }, { transform: 'scaleX(1)' }], { duration, easing: 'linear', fill: 'forwards' })
    timer = setTimeout(() => {
      if (index === steps.length - 1) stop()
      else show(index + 1)
    }, duration)
  }

  for (const [index, button] of selectors.entries()) button.addEventListener('click', () => { stop(); select(index) })
  for (const [index, button] of hotspots.entries()) button.addEventListener('click', () => { stop(); select(index) })
  play?.addEventListener('click', () => {
    if (timer !== undefined) { stop(); return }
    walkthrough.classList.add('touring')
    play.setAttribute('aria-pressed', 'true')
    play.innerHTML = '<span aria-hidden="true">Ⅱ</span> Остановить'
    show(0)
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

const currentSection = document.querySelector<HTMLElement>('[data-current-section]')
const chapters = Array.from(document.querySelectorAll<HTMLElement>('[data-chapter]'))
const header = document.querySelector<HTMLElement>('.site-header')
const contentsSummary = contents?.querySelector<HTMLElement>('summary')
let activeId = ''
let scrollScheduled = false
const updateCurrentSection = () => {
  const boundary = (compact.matches ? contentsSummary?.getBoundingClientRect().bottom : header?.getBoundingClientRect().bottom) ?? 0
  const padding = Number.parseFloat(getComputedStyle(document.documentElement).scrollPaddingTop) || 0
  const activationLine = Math.max(boundary + 24, padding) + 1
  let active = chapters[0]
  for (const chapter of chapters) {
    if (chapter.getBoundingClientRect().top > activationLine) break
    active = chapter
  }
  if (!active || activeId === active.id) return
  activeId = active.id
  contentsLinks.forEach(link => {
    if (link.hash === `#${activeId}`) {
      link.setAttribute('aria-current', 'location')
      if (currentSection) currentSection.textContent = link.textContent?.replace(/^\s*\d+\s*/, '').trim() ?? ''
    } else link.removeAttribute('aria-current')
  })
}
const scheduleCurrentSection = () => {
  if (scrollScheduled) return
  scrollScheduled = true
  requestAnimationFrame(() => {
    scrollScheduled = false
    updateCurrentSection()
  })
}
window.addEventListener('scroll', scheduleCurrentSection, { passive: true })
window.addEventListener('resize', scheduleCurrentSection)
window.addEventListener('hashchange', scheduleCurrentSection)
updateCurrentSection()

// Шрифты и включение интерактивных шагов меняют высоту разделов после первого перехода по hash.
const initialHash = window.location.hash
const initialTarget = document.getElementById(initialHash.slice(1))
if (initialTarget) {
  let pending = true
  const cancel = () => { pending = false }
  for (const event of ['pointerdown', 'wheel', 'keydown']) window.addEventListener(event, cancel, { once: true, passive: true })
  void document.fonts.ready.then(() => {
    requestAnimationFrame(() => {
      for (const event of ['pointerdown', 'wheel', 'keydown']) window.removeEventListener(event, cancel)
      if (!pending || window.location.hash !== initialHash) return
      initialTarget.scrollIntoView({ block: 'start', behavior: 'instant' })
      updateCurrentSection()
    })
  })
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
