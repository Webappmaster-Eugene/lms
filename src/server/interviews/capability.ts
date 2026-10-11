import 'server-only'
import { createHmac, timingSafeEqual } from 'node:crypto'
import type { InterviewRecording } from '@/payload-types'
import { relationId } from '@/lib/relation-id'

const TTL_SECONDS = 24 * 60 * 60
function signature(doc: InterviewRecording, expires: number): string {
  const secret = process.env.PAYLOAD_SECRET
  if (!secret) throw new Error('Interview storage capability is not configured')
  return createHmac('sha256', secret).update(JSON.stringify(['lms-interview-source-v1', doc.id, relationId(doc.owner), doc.analysisAttempts, doc.analysisRemoteKey, expires])).digest('hex')
}
export function interviewSourceFilename(doc: InterviewRecording): string {
  if (!doc.analysisRemoteKey || !/^[a-f0-9]{8}-[a-f0-9]{4}-4[a-f0-9]{3}-[89ab][a-f0-9]{3}-[a-f0-9]{12}$/.test(doc.analysisRemoteKey)) throw new Error('Missing interview source key')
  return `lms-${doc.id}-${doc.analysisAttempts}-${doc.analysisRemoteKey}.mp4`
}
export function createInterviewSource(doc: InterviewRecording): string {
  const root = new URL(process.env.NEXT_PUBLIC_SERVER_URL || 'https://learn.mentorcareer.ru')
  if (root.username || root.password || root.protocol !== 'https:') throw new Error('Interview evaluation requires the public HTTPS LMS origin')
  const requestedAt = Date.parse(doc.analysisRequestedAt ?? '')
  if (!Number.isFinite(requestedAt)) throw new Error('Missing analysis request date')
  const expires = Math.floor(requestedAt / 1000) + TTL_SECONDS
  const url = new URL(`/api/internal/interviews/${doc.id}/${interviewSourceFilename(doc)}`, root.origin)
  url.searchParams.set('expires', String(expires))
  url.searchParams.set('token', signature(doc, expires))
  return url.href
}
export function validInterviewSource(doc: InterviewRecording, file: string, params: URLSearchParams, now = Date.now()): boolean {
  if (doc.category !== 'personal' || !relationId(doc.owner) || doc.status !== 'ready' || doc.analysisBackend !== 'sovetnik' || !['queued', 'processing'].includes(doc.analysisStatus)) return false
  const expiresText = params.get('expires') ?? ''
  const token = params.get('token') ?? ''
  if (!/^\d{10}$/.test(expiresText) || !/^[a-f0-9]{64}$/.test(token) || [...params.keys()].some((key) => !['expires', 'token'].includes(key)) || params.getAll('expires').length !== 1 || params.getAll('token').length !== 1) return false
  const expires = Number(expiresText)
  if (expires <= now / 1000 || expires > now / 1000 + TTL_SECONDS + 60) return false
  try { return file === interviewSourceFilename(doc) && timingSafeEqual(Buffer.from(signature(doc, expires), 'hex'), Buffer.from(token, 'hex')) }
  catch { return false }
}
