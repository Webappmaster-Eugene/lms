// Скриншот с шагами («Показать шаги», метки, приближение) и окно увеличения.
// Общий для инструкции по платформе и страницы буткемпа.
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
