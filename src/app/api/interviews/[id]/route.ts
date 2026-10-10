import { interviewRoute } from '@/server/interviews/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export async function GET(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  return interviewRoute(request, 'detail', Number(id))
}

export async function DELETE(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  return interviewRoute(request, 'delete', Number(id))
}
