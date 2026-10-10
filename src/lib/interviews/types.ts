export type RecordingCategory = 'mentor' | 'community' | 'personal'
export type AnalysisStatus = 'idle' | 'queued' | 'processing' | 'completed' | 'failed'

export type InterviewDirectionDTO = {
  id: number
  slug: string
  title: string
  description: string
}

export type InterviewRecordingDTO = {
  id: number
  title: string
  description: string
  direction: InterviewDirectionDTO
  category: RecordingCategory
  status: 'uploading' | 'ready' | 'failed'
  size: number
  createdAt: string
  isOwner: boolean
  analysisStatus: AnalysisStatus
  analysisProgress: string
  analysisError: string
}

export type InterviewListDTO = {
  directions: InterviewDirectionDTO[]
  recordings: InterviewRecordingDTO[]
  page: number
  totalPages: number
  totalDocs: number
  uploadAvailable: boolean
  analysisAvailable: boolean
  isAdmin: boolean
}

export const RECORDING_CATEGORIES = {
  mentor: 'Собесы ментора',
  community: 'Чужие собесы',
  personal: 'Мои собесы',
} as const

export const MAX_RECORDING_BYTES = 2 * 1024 * 1024 * 1024
