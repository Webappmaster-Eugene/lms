export class RequestBodyError extends Error {
  constructor(message: string, readonly status: 400 | 413 | 415 = 400) { super(message) }
}

/** A page closing during body transfer is a client error, before any domain write. */
export async function readRequestJson(request: Request, maxBytes: number): Promise<unknown> {
  try {
    return await readBoundedJson(request, maxBytes)
  } catch (error) {
    if (error instanceof RequestBodyError) throw error
    if (request.signal.aborted || error instanceof Error && (error.name === 'AbortError' || error.message === 'aborted')) {
      throw new RequestBodyError('Передача данных запроса прервана')
    }
    throw error
  }
}

/** Форма с файлом: тот же предел при чтении, что и у JSON, разбор только после него. */
export async function readRequestForm(request: Request, maxBytes: number, deadlineMs?: number): Promise<FormData> {
  const contentType = request.headers.get('content-type') ?? ''
  if (contentType.split(';')[0]?.trim().toLowerCase() !== 'multipart/form-data') {
    throw new RequestBodyError('Требуется Content-Type: multipart/form-data', 415)
  }
  try {
    const bytes = await readBoundedBytes(request, maxBytes, deadlineMs)
    return await new Response(bytes, { headers: { 'Content-Type': contentType } }).formData()
  } catch (error) {
    if (error instanceof RequestBodyError) throw error
    if (request.signal.aborted || error instanceof Error && (error.name === 'AbortError' || error.message === 'aborted')) {
      throw new RequestBodyError('Передача данных запроса прервана')
    }
    throw new RequestBodyError('Некорректные данные запроса')
  }
}

/** Enforce the limit while reading; Content-Length can be missing or forged. */
export async function readBoundedJson(request: Request, maxBytes: number): Promise<unknown> {
  if (request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
    throw new RequestBodyError('Требуется Content-Type: application/json', 415)
  }
  const bytes = await readBoundedBytes(request, maxBytes)
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    throw new RequestBodyError('Некорректные данные запроса')
  }
}

async function readBoundedBytes(request: Request, maxBytes: number, deadlineMs?: number): Promise<Uint8Array<ArrayBuffer>> {
  const declared = Number(request.headers.get('content-length'))
  if (declared > maxBytes) throw new RequestBodyError('Слишком большой запрос', 413)
  const reader = request.body?.getReader()
  if (!reader) throw new RequestBodyError('Укажите данные запроса')
  const chunks: Uint8Array[] = []
  let size = 0
  let expired = false
  const timer = deadlineMs ? setTimeout(() => { expired = true; void reader.cancel().catch(() => undefined) }, deadlineMs) : undefined
  try {
    for (;;) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > maxBytes) {
        await reader.cancel()
        throw new RequestBodyError('Слишком большой запрос', 413)
      }
      chunks.push(chunk.value)
    }
  } finally {
    clearTimeout(timer)
    reader.releaseLock()
  }
  if (expired) throw new RequestBodyError('Передача данных запроса прервана')
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  return bytes
}
