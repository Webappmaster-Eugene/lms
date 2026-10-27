// Скриншот с шагами («Показать шаги», метки, приближение) и окно увеличения.
// Общий для инструкции по платформе и страницы буткемпа.
const compact = window.matchMedia('(max-width: 800px)')
// Доля исходного размера снимка на телефоне. Целиком снимок 1440 px сжат до 0,24, и текст интерфейса
// 14 px выходит около 3 px. Сравнивали 0,65-0,85: при 0,65 он около 9 px, мельче удобного для чтения;
// при 0,85 строки кода и комментариев в кадре 390 px обрываются раньше, и теряется то, что вокруг метки.
const FOCUS_SCALE = 0.75
// Короче порога движение считается касанием, а не листанием.
const SWIPE_MIN = 40

const widthOf = (image: HTMLImageElement) => Number(image.getAttribute('width')) || image.naturalWidth

const dialog = document.querySelector<HTMLDialogElement>('.image-dialog')
const dialogImage = dialog?.querySelector<HTMLImageElement>('img')
const dialogScroll = dialog?.querySelector<HTMLElement>('.dialog-image-scroll')
const dialogFit = dialog?.querySelector<HTMLButtonElement>('[data-dialog-fit]')
let zoomTrigger: HTMLElement | null = null
let dialogPoint: { x: number; y: number } | null = null

document.querySelector<HTMLButtonElement>('[data-close-dialog]')?.addEventListener('click', () => dialog?.close())
dialog?.addEventListener('close', () => zoomTrigger?.focus())
dialog?.addEventListener('click', (event) => {
  if (event.target === dialog) dialog.close()
})

// На телефоне окно открывается крупно, у метки текущего шага; «Целиком» вписывает снимок в ширину экрана.
const setDialogFit = (fit: boolean) => {
  if (!dialog || !dialogImage || !dialogScroll) return
  dialog.classList.toggle('fit', fit)
  if (dialogFit) dialogFit.textContent = fit ? 'Крупно' : 'Целиком'
  const point = fit ? null : dialogPoint
  dialogScroll.scrollLeft = point ? point.x / 100 * dialogImage.offsetWidth - dialogScroll.clientWidth / 2 : 0
  dialogScroll.scrollTop = point ? point.y / 100 * dialogImage.offsetHeight - dialogScroll.clientHeight / 2 : 0
}
dialogFit?.addEventListener('click', () => setDialogFit(!dialog?.classList.contains('fit')))

const openImage = (source: HTMLImageElement, trigger: HTMLElement | null, description: string, point: { x: number; y: number } | null = null) => {
  if (!dialog || !dialogImage) return
  zoomTrigger = trigger
  dialogPoint = point
  dialogImage.src = source.src
  dialogImage.alt = source.alt
  // Размеры заранее: до загрузки картинки окно уже знает её высоту и может прокрутить к метке.
  for (const name of ['width', 'height']) {
    const value = source.getAttribute(name)
    if (value) dialogImage.setAttribute(name, value)
    else dialogImage.removeAttribute(name)
  }
  const zoomedWidth = Math.round(widthOf(source) * FOCUS_SCALE)
  dialog.style.setProperty('--dialog-width', `${zoomedWidth}px`)
  // Узкий снимок телефона и так во всю ширину окна: переключать нечего. До showModal, чтобы фокус не попал на скрытую кнопку.
  if (dialogFit) dialogFit.hidden = zoomedWidth <= document.documentElement.clientWidth
  const caption = dialog.querySelector<HTMLElement>('[data-dialog-description]')
  if (caption) caption.textContent = description
  dialog.showModal()
  if (compact.matches) setDialogFit(false)
  else dialog.classList.remove('fit')
}

for (const trigger of document.querySelectorAll<HTMLButtonElement>('[data-zoom-static]')) {
  const source = trigger.closest('figure')?.querySelector<HTMLImageElement>('img')
  if (!source) continue
  trigger.addEventListener('click', () => openImage(source, trigger, source.alt))
  // На телефоне в снимок естественно нажать пальцем; кнопка «Увеличить» в подписи остаётся для клавиатуры.
  source.addEventListener('click', () => { if (compact.matches) openImage(source, trigger, source.alt) })
}

// Мелкий скриншот на телефоне без приближения не читается, а на компьютере сильное увеличение размывает картинку.
const TOUR_ZOOM_MIN = 1.6
const TOUR_ZOOM_MAX = 2.4

for (const walkthrough of document.querySelectorAll<HTMLElement>('[data-walkthrough]')) {
  const steps = Array.from(walkthrough.querySelectorAll<HTMLElement>('[data-step]'))
  const selectors = Array.from(walkthrough.querySelectorAll<HTMLButtonElement>('[data-select]'))
  const hotspots = Array.from(walkthrough.querySelectorAll<HTMLButtonElement>('[data-hotspot]'))
  const dots = Array.from(walkthrough.querySelectorAll<HTMLElement>('[data-dot]'))
  const play = walkthrough.querySelector<HTMLButtonElement>('[data-play]')
  const prev = walkthrough.querySelector<HTMLButtonElement>('[data-prev]')
  const next = walkthrough.querySelector<HTMLButtonElement>('[data-next]')
  const count = walkthrough.querySelector<HTMLElement>('[data-focus-count]')
  const status = walkthrough.querySelector<HTMLElement>('.guide-status')
  const frame = walkthrough.querySelector<HTMLElement>('.screen-image')
  const canvas = walkthrough.querySelector<HTMLElement>('.screen-canvas')
  const image = canvas?.querySelector<HTMLImageElement>('img')
  const label = walkthrough.querySelector<HTMLElement>('[data-tour-label]')
  const progress = walkthrough.querySelector<HTMLElement>('[data-tour-progress]')
  const idleLabel = label?.textContent ?? ''
  // Снимок телефона узкий и читается целиком, режим фрагмента ему не нужен.
  const focusable = !walkthrough.classList.contains('walkthrough-mobile')
  let focused = false
  let current = 0
  let timer: ReturnType<typeof setTimeout> | undefined
  walkthrough.classList.add('enhanced')

  // Сдвиг в пикселях кадра: у кадра 4:3 и у снимка разные пропорции, проценты холста метку бы не центровали.
  const focusTo = (index: number, instant = false) => {
    const spot = hotspots[index]
    if (!frame || !canvas || !image || !spot || !canvas.clientWidth) return
    const width = canvas.clientWidth
    // На планшете широкий снимок при FOCUS_SCALE ниже кадра 4:3: приближаем, пока не закроет кадр целиком.
    const zoom = Math.max(1, FOCUS_SCALE * widthOf(image) / width, frame.clientHeight / (canvas.clientHeight || 1))
    // Метка по центру кадра, но край снимка не заходит внутрь кадра.
    const shift = (size: number, point: number, frameSize: number) =>
      Math.min(0, Math.max(frameSize - size * zoom, frameSize / 2 - point / 100 * size * zoom))
    if (instant) canvas.style.transition = 'none'
    canvas.style.setProperty('--zoom', String(zoom))
    canvas.style.setProperty('--shift-x', `${shift(width, Number(spot.dataset.x), frame.clientWidth)}px`)
    canvas.style.setProperty('--shift-y', `${shift(canvas.clientHeight, Number(spot.dataset.y), frame.clientHeight)}px`)
    if (instant) {
      void canvas.offsetWidth
      canvas.style.transition = ''
    }
  }

  const select = (index: number, announce = true) => {
    if (index < 0 || index >= steps.length) return
    current = index
    steps.forEach((step, i) => { step.dataset.active = String(i === index) })
    dots.forEach((dot, i) => { dot.dataset.active = String(i === index) })
    for (const buttons of [selectors, hotspots]) {
      buttons.forEach((button, i) => {
        button.dataset.active = String(i === index)
        button.setAttribute('aria-pressed', String(i === index))
      })
    }
    // Метки за краем кадра не видны, фокус на них потерялся бы; к ним ведут «Назад» и «Дальше».
    hotspots.forEach((button, i) => {
      if (focused && i !== index) button.tabIndex = -1
      else button.removeAttribute('tabindex')
    })
    prev?.setAttribute('aria-disabled', String(index === 0))
    next?.setAttribute('aria-disabled', String(index === steps.length - 1))
    if (count) count.textContent = `Шаг ${index + 1} из ${steps.length}`
    if (status && announce) status.textContent = `Шаг ${index + 1} из ${steps.length}: ${steps[index]?.dataset.title ?? ''}`
    if (focused) focusTo(index)
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

  // Телефон в портрете получает фрагмент у шага, поворот в широкий экран возвращает обычный вид.
  const setFocusMode = () => {
    const on = focusable && compact.matches
    if (on === focused) return
    stop()
    focused = on
    walkthrough.classList.toggle('focus-mode', on)
    // Смена режима без анимации: снимок не должен «уезжать» при повороте экрана.
    if (canvas) {
      canvas.style.transition = 'none'
      for (const name of ['--zoom', '--shift-x', '--shift-y']) canvas.style.removeProperty(name)
    }
    select(current, false)
    if (canvas) {
      void canvas.offsetWidth
      canvas.style.transition = ''
    }
  }

  for (const [index, button] of selectors.entries()) button.addEventListener('click', () => { stop(); select(index) })
  for (const [index, button] of hotspots.entries()) button.addEventListener('click', () => { stop(); select(index) })
  prev?.addEventListener('click', () => select(current - 1))
  next?.addEventListener('click', () => select(current + 1))
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
    const spot = hotspots[current]
    const point = spot ? { x: Number(spot.dataset.x), y: Number(spot.dataset.y) } : null
    // Заголовок и текст шага по отдельности: textContent всего пункта склеивал их без пробела.
    const step = steps[current]
    const description = step ? `${step.dataset.title ?? ''}. ${step.querySelector('p')?.textContent ?? ''}` : ''
    openImage(source, event.currentTarget instanceof HTMLElement ? event.currentTarget : null, description, point)
  })

  // Листание пальцем по кадру. Вертикальную прокрутку страницы забирает браузер (touch-action: pan-y),
  // тогда приходит pointercancel и жест не считается.
  let swipe: { id: number; x: number; y: number } | null = null
  frame?.addEventListener('pointerdown', (event) => {
    swipe = focused && event.isPrimary && event.button === 0 ? { id: event.pointerId, x: event.clientX, y: event.clientY } : null
  })
  frame?.addEventListener('pointercancel', () => { swipe = null })
  window.addEventListener('pointerup', (event) => {
    if (!swipe || event.pointerId !== swipe.id) return
    const dx = event.clientX - swipe.x
    const dy = event.clientY - swipe.y
    swipe = null
    if (Math.abs(dx) >= SWIPE_MIN && Math.abs(dx) > Math.abs(dy)) select(current + (dx < 0 ? 1 : -1))
  })
  // Мышью картинку иначе тащит встроенный drag-and-drop браузера, и жест обрывается.
  frame?.addEventListener('dragstart', (event) => { if (focused) event.preventDefault() })
  // Кадр с overflow: hidden браузер прокручивает к сфокусированной метке, и расчёт сдвига сбивается.
  // overflow: clip в CSS этого не допускает, а здесь защита для браузеров без него.
  for (const box of [walkthrough, frame]) {
    if (!box) continue
    box.addEventListener('scroll', () => {
      if (!focused) return
      box.scrollLeft = 0
      box.scrollTop = 0
    })
  }
  if (frame && 'ResizeObserver' in window) new ResizeObserver(() => { if (focused) focusTo(current, true) }).observe(frame)

  compact.addEventListener('change', setFocusMode)
  setFocusMode()

  document.addEventListener('visibilitychange', () => { if (document.hidden) stop() })
  if ('IntersectionObserver' in window) {
    new IntersectionObserver(entries => {
      if (!entries[0]?.isIntersecting) stop()
    }).observe(walkthrough)
  }
}
