import './walkthrough'

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
