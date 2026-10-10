import { interviewRoute } from '@/server/interviews/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const POST = (request: Request) => interviewRoute(request, 'create')
