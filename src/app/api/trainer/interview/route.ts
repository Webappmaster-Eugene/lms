import { interviewRequest } from '@/lib/trainer/interview-server'

export const runtime = 'nodejs'
export const POST = (request: Request) => interviewRequest(request, 'create')
