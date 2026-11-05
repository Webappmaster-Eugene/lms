import { readJson } from '@/lib/http-client'

export class AssignmentRequestError extends Error {
  constructor(message: string, readonly code?: 'orphaned-assignment') { super(message) }
}

export async function result<T>(response: Response): Promise<T> {
  const data = await readJson<{ error?: unknown; code?: unknown }>(response)
  if (!response.ok || !data) throw new AssignmentRequestError(typeof data?.error === 'string' ? data.error : 'Не удалось выполнить запрос. Повторите попытку', data?.code === 'orphaned-assignment' ? data.code : undefined)
  return data as T
}
