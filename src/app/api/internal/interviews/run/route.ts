import { cleanupInterviewUploads } from '@/server/interviews/cleanup'
import { getPayload } from '@/lib/payload'
import { validInterviewJobKey } from '@/server/interviews/job-auth'
import { runInterviewAnalysisJobs } from '@/server/interviews/jobs'

export const runtime = 'nodejs'
export const dynamic = 'force-dynamic'
export const maxDuration = 7200
export async function POST(request: Request) {
  const headers = { 'Cache-Control': 'no-store' }
  if (!validInterviewJobKey(request.headers.get('x-lms-job-key'))) return Response.json({ error: 'Доступ запрещён' }, { status: 403, headers })
  try {
    const payload = await getPayload()
    const removedUploads = await cleanupInterviewUploads(payload)
    return Response.json({ ...await runInterviewAnalysisJobs(payload), removedUploads }, { headers })
  }
  catch { return Response.json({ error: 'Задача анализа не выполнена' }, { status: 503, headers }) }
}
