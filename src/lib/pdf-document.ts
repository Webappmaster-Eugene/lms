export type PdfPageSize = { width: number; height: number }
export type PdfRender = { done: Promise<void>; cancel: () => void }
export type PdfDocument = {
  pages: number
  pageSize: (page: number) => Promise<PdfPageSize>
  render: (page: number, canvas: HTMLCanvasElement, targetWidth: number) => Promise<PdfRender>
  destroy: () => Promise<void>
}

const MAX_SCALE = 4

async function readBody(response: Response, onProgress?: (share: number | null) => void): Promise<Uint8Array> {
  const total = Number(response.headers.get('content-length')) || null
  if (!response.body) return new Uint8Array(await response.arrayBuffer())
  const reader = response.body.getReader()
  const chunks: Uint8Array[] = []
  let loaded = 0
  for (;;) {
    const chunk = await reader.read()
    if (chunk.done) break
    chunks.push(chunk.value)
    loaded += chunk.value.byteLength
    onProgress?.(total ? Math.min(1, loaded / total) : null)
  }
  const data = new Uint8Array(loaded)
  let offset = 0
  for (const chunk of chunks) { data.set(chunk, offset); offset += chunk.byteLength }
  return data
}

/**
 * Скачивает PDF одним запросом и открывает его в pdf.js. Постраничная докачка диапазонами
 * дала бы сотню запросов на файл и упёрлась бы в лимит обращений ученика к прокси.
 */
export async function openPdf(url: string, signal: AbortSignal, onProgress?: (share: number | null) => void): Promise<PdfDocument> {
  const response = await fetch(url, { credentials: 'include', signal })
  if (!response.ok) throw new Error(`PDF не получен: ${response.status}`)
  const data = await readBody(response, onProgress)
  // Сборка legacy работает и в браузерах, где ещё нет свежих возможностей языка.
  const pdfjs = await import('pdfjs-dist/legacy/build/pdf.mjs')
  if (!pdfjs.GlobalWorkerOptions.workerSrc) {
    pdfjs.GlobalWorkerOptions.workerSrc = new URL('pdfjs-dist/legacy/build/pdf.worker.min.mjs', import.meta.url).toString()
  }
  const task = pdfjs.getDocument({ data })
  const abort = () => { void task.destroy() }
  signal.addEventListener('abort', abort, { once: true })
  try {
    const document = await task.promise
    if (signal.aborted) {
      // Отмена пришла, пока документ открывался: обработчик выше уже мог не застать задачу.
      await task.destroy()
      signal.throwIfAborted()
    }
    return {
      pages: document.numPages,
      async pageSize(page) {
        const viewport = (await document.getPage(page)).getViewport({ scale: 1 })
        return { width: viewport.width, height: viewport.height }
      },
      async render(page, canvas, targetWidth) {
        const source = await document.getPage(page)
        const base = source.getViewport({ scale: 1 })
        const viewport = source.getViewport({ scale: Math.min(MAX_SCALE, targetWidth / base.width) })
        canvas.width = Math.floor(viewport.width)
        canvas.height = Math.floor(viewport.height)
        const rendering = source.render({ canvas, viewport })
        return { done: rendering.promise, cancel: () => rendering.cancel() }
      },
      destroy: () => task.destroy(),
    }
  } finally {
    signal.removeEventListener('abort', abort)
  }
}
