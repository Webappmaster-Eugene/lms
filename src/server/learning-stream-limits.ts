import 'server-only'

const MAX_CONCURRENT = 6
const BURST_PER_MINUTE = 120
const MAX_VIEWERS = 10000
const WINDOW_MS = 60000

type Viewer = { active: number; count: number; window: number }
// Different Next route bundles must share the same process-local quota.
const processState = globalThis as typeof globalThis & { __lmsLearningStreamViewers?: Map<number, Viewer> }
const viewers = processState.__lmsLearningStreamViewers ??= new Map<number, Viewer>()

export class LearningStreamLimitError extends Error {}

/** In-memory safeguard per instance; active viewers are never evicted. */
export function acquireLearningStream(userId: number, now = Date.now()): () => void {
  let viewer = viewers.get(userId)
  if (!viewer) {
    for (const [id, candidate] of viewers) {
      if (!candidate.active && now - candidate.window >= WINDOW_MS) viewers.delete(id)
    }
    if (viewers.size >= MAX_VIEWERS) throw new LearningStreamLimitError('Слишком много запросов. Повторите через минуту')
    viewer = { active: 0, count: 0, window: now }
    viewers.set(userId, viewer)
  }
  if (now - viewer.window >= WINDOW_MS) { viewer.count = 0; viewer.window = now }
  if (viewer.active >= MAX_CONCURRENT || viewer.count >= BURST_PER_MINUTE) {
    throw new LearningStreamLimitError('Слишком много запросов. Повторите через минуту')
  }
  viewer.active++
  viewer.count++
  let released = false
  return () => {
    if (released) return
    released = true
    viewer.active--
  }
}

/** Release on EOF, cancellation, network error and client abort. */
export function limitedLearningBody(body: ReadableStream<Uint8Array>, release: () => void, signal: AbortSignal, onFailure?: () => void): ReadableStream<Uint8Array> {
  const reader = body.getReader()
  let finished = false
  const finish = () => {
    if (finished) return
    finished = true
    signal.removeEventListener('abort', abort)
    release()
  }
  const abort = () => {
    finish()
    void reader.cancel().catch(() => undefined)
  }
  signal.addEventListener('abort', abort, { once: true })
  if (signal.aborted) abort()
  return new ReadableStream({
    async pull(controller) {
      try {
        const chunk = await reader.read()
        if (chunk.done) { finish(); controller.close() }
        else controller.enqueue(chunk.value)
      } catch (error) { if (!signal.aborted) onFailure?.(); finish(); controller.error(error) }
    },
    async cancel(reason) {
      finish()
      await reader.cancel(reason)
    },
  })
}
