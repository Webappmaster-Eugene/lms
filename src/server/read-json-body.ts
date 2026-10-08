export class RequestBodyError extends Error {
  constructor(message: string, readonly status: 400 | 413 | 415 = 400) { super(message) }
}

/** Enforce the limit while reading; Content-Length can be missing or forged. */
export async function readBoundedJson(request: Request, maxBytes: number): Promise<unknown> {
  if (request.headers.get('content-type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
    throw new RequestBodyError('Требуется Content-Type: application/json', 415)
  }
  const declared = Number(request.headers.get('content-length'))
  if (declared > maxBytes) throw new RequestBodyError('Слишком большой запрос', 413)
  const reader = request.body?.getReader()
  if (!reader) throw new RequestBodyError('Укажите данные запроса')
  const chunks: Uint8Array[] = []
  let size = 0
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
    reader.releaseLock()
  }
  const bytes = new Uint8Array(size)
  let offset = 0
  for (const chunk of chunks) { bytes.set(chunk, offset); offset += chunk.byteLength }
  try {
    return JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes))
  } catch {
    throw new RequestBodyError('Некорректные данные запроса')
  }
}
