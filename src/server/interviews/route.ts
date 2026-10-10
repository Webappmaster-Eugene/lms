import 'server-only'
import { logger } from '@/lib/telemetry'
import { createLocalReq } from 'payload'
import { getPayload } from '@/lib/payload'
import { readBoundedJson, RequestBodyError } from '@/server/read-json-body'
import { InterviewLibraryError, uploadInput, analysisInput, getInterviewLibrary, getInterviewDetails, beginInterviewUpload, completeInterviewUpload, deleteInterviewRecording, queueInterviewAnalysis, importInterviewSources, accessibleRecording, claimInterviewUpload, releaseInterviewUpload } from '@/server/interviews/service'
import { uploadPrivateFile, InterviewStorageError } from '@/server/interviews/disk'
import { streamRecordingMedia } from '@/server/interviews/media'

const response = (body: unknown, status = 200) => Response.json(body, { status, headers: { 'Cache-Control': 'private, no-store' } })
type Action = 'list' | 'detail' | 'create' | 'upload' | 'finish' | 'delete' | 'analyze' | 'stream' | 'import'
export function validInterviewOrigin(request: Request): boolean {
  const origin = request.headers.get('origin')
  const allowed = new Set([new URL(request.url).origin])
  if (process.env.NEXT_PUBLIC_SERVER_URL) allowed.add(new URL(process.env.NEXT_PUBLIC_SERVER_URL).origin)
  if (['cross-site', 'same-site'].includes(request.headers.get('sec-fetch-site') ?? '')) return false
  if (origin) return allowed.has(origin)
  return /^(?:JWT|Bearer) \S+$/.test(request.headers.get('authorization') ?? '')
}
export async function interviewRoute(request: Request, action: Action, id?: number): Promise<Response> {
  const write = !['list', 'detail', 'stream'].includes(action)
  try {
    if (write && !validInterviewOrigin(request)) return response({ error: 'Откройте раздел на платформе' }, 403)
    const payload = await getPayload()
    const headers = new Headers(request.headers)
    const authorization = headers.get('authorization')
    if (authorization !== null) {
      if (!/^(?:JWT|Bearer) \S+$/.test(authorization)) return response({ error: 'Войдите в аккаунт' }, 401)
      headers.delete('cookie')
    }
    const req = await createLocalReq({}, payload)
    const { user } = await payload.auth({ headers, req })
    if (!user) return response({ error: 'Войдите в аккаунт' }, 401)
    const recordId = id ?? -1
    switch (action) {
      case 'list': {
        const p = new URL(request.url).searchParams
        return response(await getInterviewLibrary(payload, user, { direction: p.get('direction') ?? undefined, category: p.get('category') ?? undefined, page: p.get('page') ?? undefined, search: p.get('search') ?? undefined }))
      }
      case 'detail': return response(await getInterviewDetails(payload, user, recordId))
      case 'create': return response(await beginInterviewUpload(payload, user, uploadInput(await readBoundedJson(request, 8192))), 201)
      case 'finish': return response(await completeInterviewUpload(payload, user, recordId))
      case 'delete': return response(await deleteInterviewRecording(payload, user, recordId))
      case 'analyze': return response(await queueInterviewAnalysis(payload, user, recordId, analysisInput(await readBoundedJson(request, 24000))), 202)
      case 'import': return response(await importInterviewSources(payload, user))
      case 'stream': {
        const doc = await accessibleRecording(payload, user, recordId)
        if (doc.status !== 'ready') throw new InterviewLibraryError('Видео ещё не загружено', 409)
        return await streamRecordingMedia(request, doc, user.id)
      }
      case 'upload': {
        const { doc, claim } = await claimInterviewUpload(payload, user, recordId)
        try {
          if (!doc.diskPath) throw new InterviewLibraryError('Загрузка недоступна', 409)
          await uploadPrivateFile(request, { diskPath: doc.diskPath, expectedSize: doc.size, mimeType: doc.mimeType ?? 'video/mp4' })
          return response({ uploaded: true })
        } finally { await releaseInterviewUpload(payload, user, recordId, claim) }
      }
    }
  } catch (error) {
    if (error instanceof InterviewLibraryError) return response({ error: error.message }, error.status)
    if (error instanceof RequestBodyError) return response({ error: error.message }, error.status)
    if (error instanceof InterviewStorageError) return response({ error: error.message }, error.statusCode)
    // Provider errors can contain signed URLs or private transcripts; log no raw error.
    logger.error('Interview library request failed', { action, recordingId: id ?? null, errorClass: error instanceof Error ? error.name.slice(0, 64) : 'Unknown' })
    return response({ error: 'Сервис собеседований временно недоступен. Попробуйте ещё раз' }, 503)
  }
}
