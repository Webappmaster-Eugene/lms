import type { Lesson } from '@/payload-types'
import { blockVideoSource } from '@/lib/lesson-video-source'

export type VideoPosition = { seconds: number; at: number; ended: boolean }
export type VideoPositions = Record<string, VideoPosition>
export type LearningState = { userId: number; positions: VideoPositions; lastVideoId: string | null; lastViewedAt: string | null }
export type LearningVideo = { id: string; title: string; index: number }

/** Source fingerprints prevent resuming a replacement recording at the old time. */
export function learningVideos(lesson: Pick<Lesson, 'content'>): LearningVideo[] {
  return (lesson.content ?? []).flatMap((block, index) => {
    const source = blockVideoSource(block)
    if (!source) return []
    let hash = 2166136261
    for (const char of source) hash = Math.imul(hash ^ char.charCodeAt(0), 16777619)
    return [{ id: `${block.id ?? `index:${index}`}:${(hash >>> 0).toString(16)}`, title: 'title' in block ? block.title : 'Видео', index }]
  })
}

export function readVideoPositions(value: unknown): VideoPositions {
  if (!value || typeof value !== 'object' || Array.isArray(value)) return {}
  return Object.fromEntries(Object.entries(value).filter((entry): entry is [string, VideoPosition] => {
    const position: unknown = entry[1]
    return !!position && typeof position === 'object' && 'seconds' in position && 'at' in position && 'ended' in position &&
      typeof position.seconds === 'number' && Number.isFinite(position.seconds) && position.seconds >= 0 &&
      typeof position.at === 'number' && Number.isFinite(position.at) && typeof position.ended === 'boolean'
  }))
}

export function newerPosition(server: VideoPosition | undefined, local: VideoPosition | undefined): VideoPosition | undefined {
  return local && (!server || local.at > server.at) ? local : server
}

export function learningVideoHref(slug: string, videoId?: string | null): string {
  return `/lessons/${slug}${videoId ? `?video=${encodeURIComponent(videoId)}#video-${encodeURIComponent(videoId)}` : ''}`
}
