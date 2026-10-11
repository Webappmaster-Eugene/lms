export type CheckfrodJobState = {
  id: string
  status: 'uploading' | 'queued' | 'running' | 'done' | 'failed'
  phase: string
  progress: number
  episodes: number | null
  duration: number | null
  gaze: string | null
  error: string | null
}
export type CheckfrodSummary = {
  durationS: number
  episodes: number
  moments: number
  gaze: string
  irisMinutes: number
  headOnlyMinutes: number
  noFaceMinutes: number
  frozenMinutes: number
}
export type CheckfrodReportLink = { url: string; expiresInS: number }
export type CheckfrodAnalysisDTO = {
  provider: 'checkfrod'
  summary: CheckfrodSummary
  report: Record<string, unknown>
}
