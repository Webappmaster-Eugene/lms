/**
 * Свой полноэкранный режим урока: развёрнут весь документ, а нужная часть лежит поверх него.
 *
 * Развёрнутый браузером <video> исчезает вместе со страницей урока, вернуться браузер пускает
 * только по новому действию пользователя, а всё, что на странице, лежит под ним: подсказки
 * листания не видно. Документ переживает смену части и урока без выхода и входа, поэтому касания
 * идут тем же путём, что и в обычном режиме.
 */

const MODE_ATTRIBUTE = 'data-lesson-fullscreen'
const TARGET_ATTRIBUTE = 'data-lesson-fullscreen-target'
const FRAME_SELECTOR = '[data-lesson-video]'
/** Потоковый плеер держит кнопки рядом с кадром: разворачивается рамка вместе с ними. */
const SHELL_SELECTOR = '[data-lesson-video-shell]'
const CHANGE_EVENT = 'lessonfullscreenchange'

/** Режим включён поворотом телефона или браузером: обратный поворот его и выключает. */
let enteredByRotation = false
/** Браузер уже разворачивал документ: иначе пустой fullscreenElement значит отказ, а не выход. */
let documentExpanded = false

function notify() {
  document.dispatchEvent(new Event(CHANGE_EVENT))
}

export function subscribeLessonFullscreen(listener: () => void): () => void {
  document.addEventListener(CHANGE_EVENT, listener)
  return () => document.removeEventListener(CHANGE_EVENT, listener)
}

export function isLessonFullscreen(): boolean {
  return document.documentElement.hasAttribute(MODE_ATTRIBUTE)
}

export function isLessonFullscreenFromRotation(): boolean {
  return enteredByRotation
}

/** На iPhone документ развернуть нельзя: там остаётся системный плеер. */
export function lessonFullscreenAvailable(): boolean {
  return typeof document.documentElement.requestFullscreen === 'function'
}

/** Что сейчас лежит поверх страницы: кадр или рамка потокового плеера. */
export function lessonFullscreenTarget(): HTMLElement | null {
  return document.querySelector<HTMLElement>(`[${TARGET_ATTRIBUTE}]`)
}

function frameOf(element: Element): HTMLElement | null {
  return element.closest<HTMLElement>(FRAME_SELECTOR) ?? element.closest(SHELL_SELECTOR)?.querySelector<HTMLElement>(FRAME_SELECTOR) ?? null
}

function show(frame: HTMLElement) {
  lessonFullscreenTarget()?.removeAttribute(TARGET_ATTRIBUTE)
  // Пока кадр в потоке страницы: выход из режима вернёт на него, а не на ту часть, с которой листали.
  frame.scrollIntoView({ block: 'center' })
  ;(frame.closest<HTMLElement>(SHELL_SELECTOR) ?? frame).setAttribute(TARGET_ATTRIBUTE, '')
  notify()
}

function lockLandscape(frame: HTMLElement) {
  const video = frame.querySelector('video')
  // Вертикальную запись поворачивать незачем. Пока размер неизвестен, считаем запись горизонтальной.
  if (video && video.videoHeight > video.videoWidth) return
  const orientation = window.screen.orientation as (ScreenOrientation & { lock?: (type: string) => Promise<void> }) | undefined
  void orientation?.lock?.('landscape').catch(() => undefined)
}

function finish() {
  const target = lessonFullscreenTarget()
  const frame = target && (target.matches(FRAME_SELECTOR) ? target : target.querySelector<HTMLElement>(FRAME_SELECTOR))
  target?.removeAttribute(TARGET_ATTRIBUTE)
  document.documentElement.removeAttribute(MODE_ATTRIBUTE)
  document.removeEventListener('fullscreenchange', onBrowserChange)
  window.screen.orientation?.unlock?.()
  enteredByRotation = false
  documentExpanded = false
  frame?.scrollIntoView({ block: 'center' })
  notify()
}

function onBrowserChange() {
  if (document.fullscreenElement === document.documentElement) documentExpanded = true
  // Выход кнопкой «назад» или клавишей Esc.
  else if (documentExpanded && !document.fullscreenElement) finish()
}

async function expandDocument() {
  const root = document.documentElement
  if (document.fullscreenElement === root) return
  // Поверх развёрнутого видео документ не кладём: выход из него вернул бы видео, а не страницу.
  if (document.fullscreenElement) await document.exitFullscreen().catch(() => undefined)
  // Отказ не страшен: часть уже лежит поверх страницы, следующее касание попробует снова.
  await root.requestFullscreen?.({ navigationUI: 'hide' }).catch(() => undefined)
}

export async function enterLessonFullscreen(frame: HTMLElement, { rotated = false }: { rotated?: boolean } = {}): Promise<void> {
  enteredByRotation = rotated
  document.documentElement.setAttribute(MODE_ATTRIBUTE, '')
  document.addEventListener('fullscreenchange', onBrowserChange)
  show(frame)
  await expandDocument()
  // Телефон уже повёрнут ученику как удобно, а замок помешал бы вернуть его обратно.
  if (!rotated) lockLandscape(frame)
}

/** Смена части без выхода из режима: право на вход здесь не нужно, поэтому работает и тачпад. */
export function moveLessonFullscreen(frame: HTMLElement): void {
  // Чужой плеер в iframe касаний не отдаёт: поверх страницы из него не вышли бы.
  if (frame.dataset.lessonVideo === 'embed') {
    void exitLessonFullscreen().then(() => frame.scrollIntoView({ block: 'center' }))
    return
  }
  show(frame)
}

export async function exitLessonFullscreen(): Promise<void> {
  const expanded = document.fullscreenElement === document.documentElement
  finish()
  if (expanded) await document.exitFullscreen().catch(() => undefined)
}

/** Браузер отказал без действия пользователя (поворот, смена урока): касание такое право даёт. */
export function retryLessonFullscreen(): void {
  if (isLessonFullscreen() && !document.fullscreenElement) void expandDocument()
}

export function toggleLessonFullscreen(inside: Element): void {
  const frame = frameOf(inside)
  if (lessonFullscreenTarget()?.contains(inside)) void exitLessonFullscreen()
  else if (frame) void enterLessonFullscreen(frame)
}
