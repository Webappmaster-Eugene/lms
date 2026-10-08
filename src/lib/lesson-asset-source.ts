/** An identifier, not a capability: every request still needs the lesson entitlement. */
export function lessonAssetToken(rawUrl: string): string {
  let hash = 2166136261
  for (let index = 0; index < rawUrl.length; index++) {
    hash ^= rawUrl.charCodeAt(index)
    hash = Math.imul(hash, 16777619)
  }
  return (hash >>> 0).toString(36)
}

export function lessonAssetUrl(lessonId: number, blockId: string, rawUrl: string): string {
  return `/api/learning-assets?${new URLSearchParams({ lesson: String(lessonId), block: blockId, asset: lessonAssetToken(rawUrl) })}`
}
