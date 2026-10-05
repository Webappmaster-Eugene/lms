import { interviewRequest } from '@/lib/trainer/interview-server'

export const runtime = 'nodejs'
type Context = { params: Promise<{ token: string }> }
export async function GET(request: Request, context: Context) {
  return interviewRequest(request, 'read', (await context.params).token)
}
export async function POST(request: Request, context: Context) {
  return interviewRequest(request, 'join', (await context.params).token)
}
export async function PATCH(request: Request, context: Context) {
  return interviewRequest(request, 'update', (await context.params).token)
}
