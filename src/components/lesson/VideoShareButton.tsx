'use client'

import type { RefObject } from 'react'
import { ShareButton } from '@/components/ui/ShareButton'
import { sharedPlaybackRate, sharedVideoId } from '@/lib/shared-url'

export function VideoShareButton({ videoRef, videoId }: { videoRef: RefObject<HTMLVideoElement | null>; videoId: string }) {
  return <ShareButton label="Поделиться этим моментом" getHref={() => {
    const url = new URL(window.location.href)
    url.search = ''
    const id = sharedVideoId(videoId)
    if (id) url.searchParams.set('video', id)
    const seconds = Math.floor(videoRef.current?.currentTime ?? 0)
    if (Number.isFinite(seconds) && seconds >= 0 && seconds <= 999_999) url.searchParams.set('t', String(seconds))
    const rate = sharedPlaybackRate(String(videoRef.current?.playbackRate ?? 1))
    if (rate !== null) url.searchParams.set('rate', String(rate))
    return url.toString()
  }} />
}
