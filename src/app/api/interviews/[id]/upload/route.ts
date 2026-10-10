import { interviewRoute } from '@/server/interviews/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 7200

export async function PUT(request: Request, context: { params: Promise<{ id: string }> }) {
  const { id } = await context.params
  return interviewRoute(request, 'upload', Number(id))
}
