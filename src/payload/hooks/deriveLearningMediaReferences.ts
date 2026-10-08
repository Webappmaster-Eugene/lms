import type { CollectionBeforeChangeHook, PayloadRequest } from 'payload'
import { sql } from '@payloadcms/db-postgres'

import { mediaFilePath } from '@/lib/lesson-video-source'
import { collectAllPages } from '@/lib/paginate'
import type { Lesson } from '@/payload-types'
import { consumeRawCollectionPatch } from '@/payload/hooks/rawCollectionPatch'

function relationId(value: unknown): number | null {
  const candidate = value && typeof value === 'object' && 'id' in value ? value.id : value
  return typeof candidate === 'number' && Number.isSafeInteger(candidate) && candidate > 0 ? candidate : null
}

export async function deriveMediaReferenceIds(req: PayloadRequest, lesson: Pick<Lesson, 'content' | 'description'>): Promise<number[]> {
  const ids = new Set<number>()
  const filenames = new Set<string>()
  const scan = (value: unknown) => {
    if (typeof value === 'string') {
      const urls = value.match(/(?:https?:\/\/[^\s<>"'()[\]]+|\/api\/media\/file\/[^\s<>"'()[\]]+)/gi) ?? []
      for (const url of urls) {
        const pathname = mediaFilePath(url)
        if (!pathname) continue
        try {
          const filename = decodeURIComponent(pathname.slice('/api/media/file/'.length))
          if (filename && !/[/\\]/.test(filename)) filenames.add(filename)
        } catch { /* malformed URL has no asset reference */ }
      }
    } else if (Array.isArray(value)) {
      for (const child of value) scan(child)
    } else if (value && typeof value === 'object') {
      const record = value as Record<string, unknown>
      if (record.relationTo === 'media') { const id = relationId(record.value); if (id !== null) ids.add(id) }
      // Upload owner profiles are metadata, never part of the learning material.
      for (const [key, child] of Object.entries(record)) if (key !== 'uploadedBy') scan(child)
    }
  }
  for (const block of lesson.content ?? []) {
    if (block.blockType === 'image') { const id = relationId(block.image); if (id !== null) ids.add(id) }
    if (block.blockType === 'file') { const id = relationId(block.file); if (id !== null) ids.add(id) }
    scan(block)
  }
  scan(lesson.description)
  if (!ids.size && !filenames.size) return []
  const names = [...filenames]
  const docs = await collectAllPages(({ page, limit }) => req.payload.find({
    collection: 'media', req, overrideAccess: true, depth: 0, sort: 'id', page, limit,
    select: { filename: true },
    where: { or: [
      { id: { in: [...ids] } },
      { filename: { in: names } },
      { 'sizes.thumbnail.filename': { in: names } },
      { 'sizes.card.filename': { in: names } },
    ] },
  }), { label: 'Индекс учебных файлов урока' })
  return docs.map((doc) => doc.id)
}

/** Always recompute from actual content. Client-supplied reference IDs are ignored. */
export const deriveLearningMediaReferences: CollectionBeforeChangeHook = async ({ data, originalDoc, req, operation }) => {
  if (!data) return data
  if (operation === 'update' && originalDoc?.id) {
    const patch = consumeRawCollectionPatch(req, 'lessons', originalDoc.id)
    if (!patch) throw new Error('Derived media references require raw patch capture')
    const adapter = req.payload.db as unknown as { sessions: Record<string | number, { db: { execute: (query: ReturnType<typeof sql>) => Promise<unknown> } } | undefined> }
    const transactionId = await req.transactionID
    const db = transactionId === undefined ? undefined : adapter.sessions[transactionId]?.db
    if (!db) throw new Error('Derived media references require a PostgreSQL transaction')
    await db.execute(sql`select id from lessons where id = ${originalDoc.id} for update`)
    const current = await req.payload.findByID({ collection: 'lessons', id: originalDoc.id, req, depth: 0, overrideAccess: true, select: { content: true, description: true } })
    // beforeValidate has already filled omitted fields from a stale snapshot.
    // Only explicit input may replace the newly locked current material.
    if (!patch.keys.has('content')) data.content = current.content
    if (!patch.keys.has('description')) data.description = current.description
    // Payload merges omitted fields from originalDoc after this hook. Refresh only
    // these two inputs after the row lock to keep their derived index consistent.
    originalDoc.content = current.content
    originalDoc.description = current.description
  }
  const content = data.content === undefined ? originalDoc?.content : data.content
  const description = data.description === undefined ? originalDoc?.description : data.description
  return { ...data, mediaReferences: await deriveMediaReferenceIds(req, { content, description }), mediaReferencesResolved: true }
}
