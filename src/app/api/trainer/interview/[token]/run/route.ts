import { interviewRequest } from '@/lib/trainer/interview-server'

export const runtime = 'nodejs'
type Context = { params: Promise<{ token: string }> }
export async function POST(request: Request, context: Context) {
  return interviewRequest(request, 'run', (await context.params).token)
}
