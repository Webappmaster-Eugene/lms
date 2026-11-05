import { logger } from '@/lib/telemetry'
import { AssignmentInputError } from '@/components/learning-access/contracts'
import { RequestBodyError, readRequestJson } from '@/server/read-json-body'
import { studentFailureMessage } from '@/server/manage-students'

export const studentResponse = (data: unknown, status = 200) => Response.json(data, { status, headers: { 'Cache-Control': 'private, no-store', Vary: 'Cookie, Authorization' } })

export function studentFailure(error: unknown) {
  if (error instanceof RequestBodyError) return studentResponse({ error: error.message }, error.status)
  const { message, status } = studentFailureMessage(error)
  if (status >= 500) logger.error('Student management failed', error)
  return studentResponse({ error: message }, status)
}

export const readStudentBody = (request: Request) => readRequestJson(request, 8_192)

export function studentId(raw: string): number {
  const id = /^\d+$/.test(raw) ? Number(raw) : Number.NaN
  if (!Number.isSafeInteger(id) || id < 1 || id > 2_147_483_647) throw new AssignmentInputError('Ученик не найден', 404)
  return id
}
