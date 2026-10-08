import { sql } from '@payloadcms/db-postgres'
import type { Access, Payload, PayloadRequest, Where } from 'payload'

import { collectAllPages } from '@/lib/paginate'
import { getAuthoritativeLearningPolicy } from '@/server/learning-access-policy'

interface ReferenceRow { media_id: number; lesson_id: number | null; public: boolean }
interface QueryResult { rows: ReferenceRow[] }
interface ReadAdapter {
  drizzle: { execute: (query: ReturnType<typeof sql>) => Promise<QueryResult> }
  sessions: Record<string | number, { db: ReadAdapter['drizzle'] } | undefined>
}

const requestReads = new WeakMap<PayloadRequest, Map<string, Promise<Where>>>()
const RASTER_MIME = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']

/** A Where is required even for admins: Payload otherwise skips filename lookup. */
export const learningMediaReadAccess: Access = async ({ req, data, id }) => {
  if (req.user && (await getAuthoritativeLearningPolicy(req.payload, req.user.id, req)).role === 'admin') return { id: { exists: true } }
  const filename = typeof data?.filename === 'string' ? data.filename : undefined
  const key = filename ? `file:${filename}` : id === undefined ? 'list' : `id:${id}`
  let reads = requestReads.get(req)
  if (!reads) { reads = new Map(); requestReads.set(req, reads) }
  let read = reads.get(key)
  if (!read) {
    read = readableMediaWhere(req.payload, req, filename, id)
    reads.set(key, read)
  }
  return read
}

export function mediaFilenameWhere(filename: string): Where {
  return { or: [
    { filename: { equals: filename } },
    { 'sizes.thumbnail.filename': { equals: filename } },
    { 'sizes.card.filename': { equals: filename } },
  ] }
}

async function readableMediaWhere(payload: Payload, req: PayloadRequest, filename?: string, id?: number | string): Promise<Where> {
  const media = await collectAllPages(({ page, limit }) => payload.find({
    collection: 'media', overrideAccess: true, req, depth: 0, page, limit, sort: 'id',
    where: filename ? mediaFilenameWhere(filename) : id === undefined ? undefined : { id: { equals: id } },
    select: { filename: true, sizes: true, mimeType: true },
  }), { label: 'Ссылки на учебные файлы' })
  if (!media.length) return { id: { in: [] } }

  // Aliases include generated sizes and URL encoding; no content JSON is loaded.
  const aliases = media.flatMap((doc) => {
    const filenames = [doc.filename, doc.sizes?.thumbnail?.filename, doc.sizes?.card?.filename]
    return filenames.filter((name): name is string => !!name).flatMap((name) => [...new Set([name, encodeURIComponent(name)])].map((alias) => ({
      media_id: doc.id, path: `/api/media/file/${alias}`,
      regex: `/api/media/file/${alias.replace(/[\\^$.*+?()[\]{}|]/g, '\\$&')}([?#[:space:]"<>()\\[\\]]|$)`,
      raster: RASTER_MIME.includes(doc.mimeType ?? ''),
    })))
  })
  const adapter = payload.db as unknown as ReadAdapter
  const transactionId = await req.transactionID
  const db = transactionId === undefined ? adapter.drizzle : adapter.sessions[transactionId]?.db
  if (!db) throw new Error('Media reference access requires PostgreSQL')
  const result = await db.execute(sql`
    with aliases as (
      select * from jsonb_to_recordset(${JSON.stringify(aliases)}::jsonb)
      as x(media_id integer, path text, regex text, raster boolean)
    ), media_refs as (
      select a.media_id, r.parent_id as lesson_id, false as public
      from aliases a join lessons_rels r on r.media_id = a.media_id and r.path = 'mediaReferences'
      join lessons l on l.id = r.parent_id and l.media_references_resolved = true
      union
      select a.media_id, b._parent_id as lesson_id, false as public
      from aliases a join lessons_blocks_image b on b.image_id = a.media_id
      join lessons l on l.id = b._parent_id and coalesce(l.media_references_resolved, false) = false
      union
      select a.media_id, b._parent_id, false
      from aliases a join lessons_blocks_file b on b.file_id = a.media_id
      join lessons l on l.id = b._parent_id and coalesce(l.media_references_resolved, false) = false
      union
      select a.media_id, b._parent_id, false
      from aliases a join lessons_blocks_video b on regexp_replace(split_part(split_part(b.video_url, '?', 1), '#', 1), '^https?://[^/]+', '') = a.path
      join lessons l on l.id = b._parent_id and coalesce(l.media_references_resolved, false) = false
      union
      select a.media_id, b._parent_id, false
      from aliases a join lessons_blocks_link b on regexp_replace(split_part(split_part(b.url, '?', 1), '#', 1), '^https?://[^/]+', '') = a.path
      join lessons l on l.id = b._parent_id and coalesce(l.media_references_resolved, false) = false
      union
      select a.media_id, l.id, false from aliases a join lessons l
      on coalesce(l.media_references_resolved, false) = false and l.description ~ a.regex
      union
      select a.media_id, b._parent_id, false from aliases a join lessons_blocks_text b
      on b.content::text ~ a.regex or jsonb_path_exists(b.content, '$.** ? (@.relationTo == "media" && (@.value == $media || @.value.id == $media))', jsonb_build_object('media', a.media_id))
      join lessons l on l.id = b._parent_id and coalesce(l.media_references_resolved, false) = false
      union
      select a.media_id, null::integer, true
      from aliases a join courses c on c.cover_image_id = a.media_id and c.is_published = true
      join roadmaps r on r.id = c.roadmap_id and r.is_published = true
      left join roadmap_nodes n on n.id = c.roadmap_node_id
      where a.raster and (c.roadmap_node_id is null or n.roadmap_id = c.roadmap_id)
      union
      select a.media_id, null::integer, true
      from aliases a join roadmaps r on r.cover_image_id = a.media_id and r.is_published = true where a.raster
      union
      select a.media_id, null::integer, true
      from aliases a join users u on u.avatar_id = a.media_id where a.raster
      union
      select a.media_id, null::integer, true
      from aliases a join media m on m.id = a.media_id
      where a.raster and m.filesize > 0 and m.filesize <= 2097152 and m.uploaded_by_id = ${req.user?.id ?? 0}
    ) select distinct media_id, lesson_id, public from media_refs
  `)
  // A public reference must not publish private course material (including sizes).
  const privateIds = new Set(result.rows.filter((row) => row.lesson_id !== null).map((row) => row.media_id))
  const allowedIds = new Set(result.rows.filter((row) => row.public && !privateIds.has(row.media_id)).map((row) => row.media_id))
  const candidates = [...new Set(result.rows.flatMap((row) => row.lesson_id === null || allowedIds.has(row.media_id) ? [] : [row.lesson_id]))]
  if (req.user && candidates.length) {
    // The collection's central policy checks assignments and all parent publication.
    const lessons = await collectAllPages(({ page, limit }) => payload.find({
      collection: 'lessons', req, user: req.user, overrideAccess: false,
      where: { id: { in: candidates } }, select: { title: true }, depth: 0, page, limit, sort: 'id',
    }), { label: 'Доступные ссылки на учебные файлы' })
    const allowedLessons = new Set(lessons.map((lesson) => lesson.id))
    for (const row of result.rows) if (row.lesson_id !== null && allowedLessons.has(row.lesson_id)) allowedIds.add(row.media_id)
  }
  return { id: { in: [...allowedIds] } }
}
