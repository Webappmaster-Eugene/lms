/** Столько видео должно пробыть у экрана, чтобы его начали качать: при прокрутке мимо загрузка не стартует. */
const DWELL_MS = 1500

export type WarmupMode = 'auto' | 'metadata'
type Entry = { video: HTMLVideoElement; mode: WarmupMode; settled: boolean; warm: boolean }

const entries = new Set<Entry>()
const PLAYBACK_EVENTS = ['play', 'pause', 'ended'] as const

function started(video: HTMLVideoElement): boolean {
  return video.played.length > 0 || !video.paused
}

function distanceToCenter(video: HTMLVideoElement): number {
  const rect = video.getBoundingClientRect()
  return Math.abs(rect.top + rect.height / 2 - window.innerHeight / 2)
}

/**
 * Смена preload начатую загрузку не останавливает: Chrome докачивает ещё десятки мегабайт.
 * Прерывает только перезагрузка элемента; позицию после неё возвращает useVideoMemory.
 */
function stopLoading(video: HTMLVideoElement) {
  video.preload = 'none'
  const source = video.getAttribute('src')
  if (!source) return
  video.removeAttribute('src')
  video.load()
  video.setAttribute('src', source)
}

/**
 * Заранее качается не больше одного видео и только пока ни одно не играет. Иначе прокрутка
 * к конспекту запускала все части урока разом, и они делили канал с той, что смотрят.
 */
function rebalance() {
  // Уход вкладки в фон не прерывает то, что уже качается.
  if (document.visibilityState === 'hidden') return
  const list = [...entries]
  const playing = Array.from(document.querySelectorAll('video')).some((video) => !video.paused && !video.ended)
  const waiting = list.filter((entry) => entry.settled && !started(entry.video))
  // Запустят, скорее всего, то, что посередине экрана, а не то, что раньше попало в запас вокруг него.
  const chosen = playing ? undefined : waiting.sort((a, b) => distanceToCenter(a.video) - distanceToCenter(b.video))[0]
  for (const entry of list) {
    if (entry === chosen) {
      entry.warm = true
      entry.video.preload = entry.mode
    } else if (entry.warm && !started(entry.video)) {
      entry.warm = false
      stopLoading(entry.video)
    }
  }
}

function subscribe() {
  document.addEventListener('visibilitychange', rebalance)
  // play и pause не всплывают: ловим на перехвате, чтобы видеть все плееры страницы.
  for (const type of PLAYBACK_EVENTS) document.addEventListener(type, rebalance, true)
}

function unsubscribe() {
  document.removeEventListener('visibilitychange', rebalance)
  for (const type of PLAYBACK_EVENTS) document.removeEventListener(type, rebalance, true)
}

/** Подключает видео к общей очереди подготовки и возвращает отключение. */
export function watchVideoWarmup(video: HTMLVideoElement): () => void {
  const connection = (navigator as Navigator & { connection?: { saveData?: boolean; effectiveType?: string } }).connection
  const conserveData = connection?.saveData || ['slow-2g', '2g'].includes(connection?.effectiveType ?? '')
  const canObserve = typeof IntersectionObserver !== 'undefined'
  const entry: Entry = { video, mode: conserveData || !canObserve ? 'metadata' : 'auto', settled: !canObserve, warm: false }

  if (entries.size === 0) subscribe()
  entries.add(entry)

  let timer: ReturnType<typeof setTimeout> | undefined
  const observer = canObserve
    ? new IntersectionObserver((records) => {
      clearTimeout(timer)
      if (records.at(-1)?.isIntersecting) {
        timer = setTimeout(() => { entry.settled = true; rebalance() }, DWELL_MS)
        return
      }
      entry.settled = false
      rebalance()
    }, { rootMargin: '200px' })
    : undefined
  observer?.observe(video)
  rebalance()

  return () => {
    clearTimeout(timer)
    observer?.disconnect()
    entries.delete(entry)
    if (entries.size === 0) unsubscribe()
    else rebalance()
  }
}
