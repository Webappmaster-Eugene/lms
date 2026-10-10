import 'server-only'

import type { Payload, PayloadRequest } from 'payload'
import type { Lesson } from '@/payload-types'

/** Only call after lesson authorization; generic populate also loads course/section policies. */
export async function populateLearningVideoFiles(payload: Payload, lessons: Lesson[], req: PayloadRequest): Promise<Lesson[]> {
  const ids = [...new Set(lessons.flatMap((lesson) => (lesson.content ?? []).flatMap((block) => block.blockType === 'file' && typeof block.file === 'number' ? [block.file] : [])))]
  if (!ids.length) return lessons
  const result = await payload.find({ collection: 'media', where: { id: { in: ids } }, select: { url: true, mimeType: true, filename: true, updatedAt: true, createdAt: true }, limit: ids.length, depth: 0, overrideAccess: true, req })
  const files = new Map(result.docs.map((file) => [file.id, file]))
  return lessons.map((lesson) => ({ ...lesson, content: lesson.content?.map((block) => {
    if (block.blockType !== 'file' || typeof block.file !== 'number') return block
    const file = files.get(block.file)
    return file ? { ...block, file } : block
  }) }))
}
