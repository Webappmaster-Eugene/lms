import { assertSameOrigin, authenticateManager } from '@/server/manage-auth'
import { createStudent } from '@/server/manage-students'
import { readStudentBody, studentFailure, studentResponse } from './respond'

const forbidden = 'Управлять учениками может только администратор'

export async function POST(request: Request) {
  try {
    const { payload, user, authorization } = await authenticateManager(request, forbidden)
    assertSameOrigin(request, authorization)
    return studentResponse(await createStudent(payload, user, request.headers, await readStudentBody(request)), 201)
  } catch (error) { return studentFailure(error) }
}
