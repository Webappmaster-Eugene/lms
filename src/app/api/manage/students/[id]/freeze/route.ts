import { assertSameOrigin, authenticateManager } from '@/server/manage-auth'
import { changeStudentFreeze } from '@/server/manage-students'
import { readStudentBody, studentFailure, studentId, studentResponse } from '../../respond'

/** Заморозить, разморозить или назначить плановую заморозку: { action: 'freeze' | 'unfreeze' | 'plan', … }. */
export async function POST(request: Request, { params }: { params: Promise<{ id: string }> }) {
  try {
    const { payload, user, authorization } = await authenticateManager(request, 'Управлять учениками может только администратор')
    assertSameOrigin(request, authorization)
    return studentResponse({ student: await changeStudentFreeze(payload, user, request.headers, studentId((await params).id), await readStudentBody(request)) })
  } catch (error) { return studentFailure(error) }
}
