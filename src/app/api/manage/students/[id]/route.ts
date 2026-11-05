import { assertSameOrigin, authenticateManager } from '@/server/manage-auth'
import { deleteStudent, studentDetails, updateStudent } from '@/server/manage-students'
import { readStudentBody, studentFailure, studentId, studentResponse } from '../respond'

type Context = { params: Promise<{ id: string }> }
const forbidden = 'Управлять учениками может только администратор'

export async function GET(request: Request, { params }: Context) {
  try {
    const { payload, user } = await authenticateManager(request, forbidden)
    return studentResponse(await studentDetails(payload, user, request.headers, studentId((await params).id)))
  } catch (error) { return studentFailure(error) }
}

export async function PATCH(request: Request, { params }: Context) {
  try {
    const { payload, user, authorization } = await authenticateManager(request, forbidden)
    assertSameOrigin(request, authorization)
    return studentResponse({ student: await updateStudent(payload, user, request.headers, studentId((await params).id), await readStudentBody(request)) })
  } catch (error) { return studentFailure(error) }
}

export async function DELETE(request: Request, { params }: Context) {
  try {
    const { payload, user, authorization } = await authenticateManager(request, forbidden)
    assertSameOrigin(request, authorization)
    await deleteStudent(payload, user, request.headers, studentId((await params).id), await readStudentBody(request))
    return studentResponse({ deleted: true })
  } catch (error) { return studentFailure(error) }
}
