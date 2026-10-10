import { interviewRoute } from '@/server/interviews/route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = (request: Request) => interviewRoute(request, 'list')
