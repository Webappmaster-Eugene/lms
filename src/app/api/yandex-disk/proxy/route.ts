import { lessonMediaRoute } from '@/server/lesson-media-route'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'

export const GET = (request: Request) => lessonMediaRoute(request)
export const HEAD = GET
