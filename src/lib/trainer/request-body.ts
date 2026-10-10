export class TrainerInputError extends Error {
  constructor(message: string, public readonly status: 400 | 413 = 400) { super(message) }
}

/** Ограничение применяется до JSON.parse, включая неизвестные поля запроса. */
export async function readTrainerBody(request: Request): Promise<Record<string, unknown>> {
  if (!request.body) throw new TrainerInputError('Невалидный JSON')
  const reader = request.body.getReader()
  const chunks: Uint8Array[] = []
  let size = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      size += chunk.value.byteLength
      if (size > 256 * 1024) {
        await reader.cancel()
        throw new TrainerInputError('Превышен размер запроса', 413)
      }
      chunks.push(chunk.value)
    }
  } finally { reader.releaseLock() }
  let input: unknown
  try { input = JSON.parse(Buffer.concat(chunks).toString('utf8')) } catch { throw new TrainerInputError('Невалидный JSON') }
  if (!input || typeof input !== 'object' || Array.isArray(input)) throw new TrainerInputError('Ожидается объект JSON')
  return input as Record<string, unknown>
}
