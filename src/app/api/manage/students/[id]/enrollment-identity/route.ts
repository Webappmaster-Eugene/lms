import { AssignmentInputError } from '@/components/learning-access/contracts'
import { confirmEnrollmentIdentity } from '@/server/enrollment-identity'
import { assertSameOrigin, authenticateManager } from '@/server/manage-auth'
import { readStudentBody, studentFailure, studentId, studentResponse } from '../../respond'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { payload, user, authorization } = await authenticateManager(request)
    assertSameOrigin(request, authorization)
    const body = await readStudentBody(request)
    if (!body || typeof body !== 'object' || !('email' in body) || typeof body.email !== 'string'
      || !('revision' in body) || typeof body.revision !== 'string' || !Number.isFinite(Date.parse(body.revision))) {
      throw new AssignmentInputError('Обновите карточку и сверьте адрес ученика.')
    }
    await confirmEnrollmentIdentity(payload, user, studentId((await params).id), body.email, body.revision)
    return studentResponse({ confirmed: true })
  } catch (error) { return studentFailure(error) }
}
