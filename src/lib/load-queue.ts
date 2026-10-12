const PARALLEL_LOADS = 3
// Зависшая загрузка не держит место вечно: спустя минуту очередь идёт дальше без неё.
const HOLD_LIMIT_MS = 60_000
const waiting: Array<() => void> = []
let running = 0

/**
 * Очередь загрузок файлов урока. Прокси отдаёт одному пользователю не больше шести файлов
 * сразу, и быстрое листание презентации без очереди получало бы отказы вместо слайдов.
 *
 * `start` вызывается, когда подошла очередь; `urgent` ставит заявку первой — так текущий
 * слайд не ждёт соседних. Возвращённая функция освобождает место, а если очередь ещё
 * не подошла — снимает заявку.
 */
export function requestLoadSlot(start: () => void, urgent = false): () => void {
  let state: 'waiting' | 'running' | 'done' = 'waiting'
  let hold: ReturnType<typeof setTimeout> | undefined
  const release = () => {
    if (state === 'waiting') {
      const position = waiting.indexOf(run)
      if (position >= 0) waiting.splice(position, 1)
    } else if (state === 'running') {
      clearTimeout(hold)
      running -= 1
      waiting.shift()?.()
    }
    state = 'done'
  }
  function run() {
    state = 'running'
    running += 1
    hold = setTimeout(release, HOLD_LIMIT_MS)
    start()
  }
  if (running < PARALLEL_LOADS) run()
  else if (urgent) waiting.unshift(run)
  else waiting.push(run)
  return release
}
