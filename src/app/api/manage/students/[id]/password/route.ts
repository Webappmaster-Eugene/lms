import { assertSameOrigin, authenticateManager } from '@/server/manage-auth'
import { resetStudentPassword } from '@/server/manage-students'
import { studentFailure, studentId, studentResponse } from '../../respond'

export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { payload, user, authorization } = await authenticateManager(request, 'Управлять учениками может только администратор')
    assertSameOrigin(request, authorization)
    return studentResponse({ credentials: await resetStudentPassword(payload, user, request.headers, studentId((await params).id)) })
  } catch (error) { return studentFailure(error) }
}
