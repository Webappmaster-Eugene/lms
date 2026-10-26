import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

/**
 * Обёртка над pdf.js для слайдов: один запрос за файлом с прогрессом,
 * масштаб страниц и отмена. Сам pdf.js подменён — проверяется то, что
 * обёртка передаёт ему и как реагирует на сеть и отмену.
 */

const pdfjs = vi.hoisted(() => ({ GlobalWorkerOptions: { workerSrc: '' }, getDocument: vi.fn() }))
vi.mock('pdfjs-dist/legacy/build/pdf.mjs', () => pdfjs)

const { openPdf } = await import('@/lib/pdf-document')

const fetchPdf = vi.fn<(url: string, init: RequestInit) => Promise<Response>>()
const renderTask = { promise: Promise.resolve(), cancel: vi.fn() }
const page = {
  getViewport: vi.fn(({ scale }: { scale: number }) => ({ width: 600 * scale, height: 800 * scale })),
  render: vi.fn(() => renderTask),
}
const pdfFile = { numPages: 3, getPage: vi.fn(async () => page) }

function loadingTask(opened: Promise<typeof pdfFile> = Promise.resolve(pdfFile)) {
  return { promise: opened, destroy: vi.fn(async () => {}) }
}

function streamed(chunks: number[][], headers: Record<string, string> = {}): Response {
  const body = new ReadableStream<Uint8Array>({
    start(controller) {
      for (const chunk of chunks) controller.enqueue(new Uint8Array(chunk))
      controller.close()
    },
  })
  return new Response(body, { headers })
}

beforeEach(() => {
  vi.clearAllMocks()
  pdfjs.GlobalWorkerOptions.workerSrc = ''
  vi.stubGlobal('fetch', fetchPdf)
})

afterEach(() => vi.unstubAllGlobals())

describe('openPdf: загрузка', () => {
  it('скачивает файл одним запросом с cookie и сообщает долю по Content-Length', async () => {
    fetchPdf.mockResolvedValue(streamed([[1, 2, 3, 4], [5, 6, 7, 8, 9, 10]], { 'Content-Length': '10' }))
    const task = loadingTask()
    pdfjs.getDocument.mockReturnValue(task)
    const progress = vi.fn()
    const controller = new AbortController()
    const pdf = await openPdf('/api/slides/1.pdf', controller.signal, progress)
    expect(fetchPdf).toHaveBeenCalledWith('/api/slides/1.pdf', { credentials: 'include', signal: controller.signal })
    expect(progress.mock.calls).toEqual([[0.4], [1]])
    expect(Array.from(pdfjs.getDocument.mock.calls[0][0].data as Uint8Array)).toEqual([1, 2, 3, 4, 5, 6, 7, 8, 9, 10])
    expect(pdf.pages).toBe(3)
  })

  it('без Content-Length доля неизвестна, а не выдумывается', async () => {
    fetchPdf.mockResolvedValue(streamed([[1], [2]]))
    pdfjs.getDocument.mockReturnValue(loadingTask())
    const progress = vi.fn()
    await openPdf('/file.pdf', new AbortController().signal, progress)
    expect(progress.mock.calls).toEqual([[null], [null]])
  })

  it('ответ без потока читается целиком', async () => {
    fetchPdf.mockResolvedValue({ ok: true, status: 200, headers: new Headers(), body: null, arrayBuffer: async () => new Uint8Array([7, 8]).buffer } as unknown as Response)
    pdfjs.getDocument.mockReturnValue(loadingTask())
    await openPdf('/file.pdf', new AbortController().signal)
    expect(Array.from(pdfjs.getDocument.mock.calls[0][0].data as Uint8Array)).toEqual([7, 8])
  })

  it('неуспешный статус — ошибка с кодом, pdf.js не вызывается', async () => {
    fetchPdf.mockResolvedValue(new Response('нет доступа', { status: 403 }))
    await expect(openPdf('/file.pdf', new AbortController().signal)).rejects.toThrow('PDF не получен: 403')
    expect(pdfjs.getDocument).not.toHaveBeenCalled()
  })

  it('задаёт адрес воркера pdf.js, только если он ещё не задан', async () => {
    fetchPdf.mockImplementation(async () => streamed([[1]]))
    pdfjs.getDocument.mockImplementation(() => loadingTask())
    await openPdf('/a.pdf', new AbortController().signal)
    expect(pdfjs.GlobalWorkerOptions.workerSrc).toMatch(/pdfjs-dist\/legacy\/build\/pdf\.worker\.min\.mjs$/)
    pdfjs.GlobalWorkerOptions.workerSrc = '/custom-worker.mjs'
    await openPdf('/b.pdf', new AbortController().signal)
    expect(pdfjs.GlobalWorkerOptions.workerSrc).toBe('/custom-worker.mjs')
  })
})

describe('openPdf: отмена', () => {
  it('отмена во время открытия уничтожает задачу pdf.js и завершается AbortError', async () => {
    fetchPdf.mockResolvedValue(streamed([[1]]))
    let open: (value: typeof pdfFile) => void = () => {}
    const task = loadingTask(new Promise((resolve) => { open = resolve }))
    pdfjs.getDocument.mockReturnValue(task)
    const controller = new AbortController()
    const opening = openPdf('/file.pdf', controller.signal)
    await vi.waitFor(() => expect(pdfjs.getDocument).toHaveBeenCalled())
    controller.abort()
    expect(task.destroy).toHaveBeenCalledTimes(1)
    open(pdfFile)
    await expect(opening).rejects.toMatchObject({ name: 'AbortError' })
    expect(task.destroy).toHaveBeenCalledTimes(2)
  })

  it('после открытия отмена сигнала документ не уничтожает — им владеет вызывающий', async () => {
    fetchPdf.mockResolvedValue(streamed([[1]]))
    const task = loadingTask()
    pdfjs.getDocument.mockReturnValue(task)
    const controller = new AbortController()
    const pdf = await openPdf('/file.pdf', controller.signal)
    controller.abort()
    expect(task.destroy).not.toHaveBeenCalled()
    await pdf.destroy()
    expect(task.destroy).toHaveBeenCalledTimes(1)
  })
})

describe('openPdf: страницы', () => {
  it('размер страницы — в масштабе 1', async () => {
    fetchPdf.mockResolvedValue(streamed([[1]]))
    pdfjs.getDocument.mockReturnValue(loadingTask())
    const pdf = await openPdf('/file.pdf', new AbortController().signal)
    expect(await pdf.pageSize(2)).toEqual({ width: 600, height: 800 })
    expect(pdfFile.getPage).toHaveBeenCalledWith(2)
  })

  it('рисует страницу под ширину холста, но не крупнее четырёхкратного масштаба, и умеет отменять отрисовку', async () => {
    fetchPdf.mockResolvedValue(streamed([[1]]))
    pdfjs.getDocument.mockReturnValue(loadingTask())
    const pdf = await openPdf('/file.pdf', new AbortController().signal)
    const canvas = { width: 0, height: 0 } as HTMLCanvasElement
    const narrow = await pdf.render(1, canvas, 301)
    expect([canvas.width, canvas.height]).toEqual([301, 401])
    expect(page.render).toHaveBeenCalledWith({ canvas, viewport: { width: 301, height: 800 * (301 / 600) } })
    await pdf.render(1, canvas, 100_000)
    expect([canvas.width, canvas.height]).toEqual([2400, 3200])
    await expect(narrow.done).resolves.toBeUndefined()
    narrow.cancel()
    expect(renderTask.cancel).toHaveBeenCalledTimes(1)
  })
})
