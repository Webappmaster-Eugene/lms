import 'server-only'
import { createHash, randomUUID } from 'node:crypto'
import { sql } from '@payloadcms/db-postgres'
import {
  commitTransaction, createLocalReq, getPayload, initTransaction, killTransaction,
  type PayloadRequest, type RequiredDataFromCollectionSlug,
} from 'payload'
import config from '@payload-config'
import { ContentError, canonicalContent, contentCollection, contentId, validateContentInput, type ContentCollection } from './validation'

interface Executor {
  execute: (query: ReturnType<typeof sql>) => Promise<unknown>
}

interface TransactionAdapter {
  sessions: Record<string | number, { db: Executor } | undefined>
}

const CYRILLIC: Record<string, string> = {
  а: 'a', б: 'b', в: 'v', г: 'g', д: 'd', е: 'e', ё: 'yo', ж: 'zh', з: 'z',
  и: 'i', й: 'y', к: 'k', л: 'l', м: 'm', н: 'n', о: 'o', п: 'p', р: 'r',
  с: 's', т: 't', у: 'u', ф: 'f', х: 'kh', ц: 'ts', ч: 'ch', ш: 'sh', щ: 'shch',
  ъ: '', ы: 'y', ь: '', э: 'e', ю: 'yu', я: 'ya',
}

function uniqueSlug(title: string, suffix = randomUUID().slice(0, 8)): string {
  const base = [...title.toLowerCase()].map((char) => CYRILLIC[char] ?? char).join('')
    .replace(/[^a-z0-9]+/g, '-').replace(/^-+|-+$/g, '').slice(0, 199 - suffix.length).replace(/-+$/, '')
  return `${base || 'material'}-${suffix}`
}

async function replayCreation(req: PayloadRequest, collection: ContentCollection, data: Record<string, unknown>, key: string) {
  if (!/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/i.test(key)) {
    throw new ContentError('Idempotency-Key должен быть UUIDv4')
  }
  if (data.slug !== undefined) throw new ContentError('При создании адрес генерируется автоматически. Измените slug после сохранения')
  const compactKey = key.toLowerCase().replaceAll('-', '')
  const digest = createHash('sha256').update(canonicalContent(data)).digest('hex').slice(0, 16)
  const db = await transactionDB(req)
  const lockId = createHash('sha256').update(`${collection}:${compactKey}`).digest().readInt32BE(0)
  await db.execute(sql`select pg_advisory_xact_lock(7202, ${lockId})`)
  const existing = await req.payload.find({ collection, where: { slug: { contains: `-${compactKey}-` } }, limit: 2, depth: 0, overrideAccess: false, user: req.user, req })
  if (existing.totalDocs) {
    const doc = existing.docs[0]
    if (existing.totalDocs !== 1 || !doc.slug.endsWith(`-${compactKey}-${digest}`)) {
      throw new ContentError('Материал уже создан с другими данными. Обновите каталог и откройте его для редактирования', 409)
    }
    return doc
  }
  data.slug = uniqueSlug(String(data.title), `${compactKey}-${digest}`)
  return undefined
}

async function transactionDB(req: PayloadRequest): Promise<Executor> {
  const id = await req.transactionID
  const adapter = req.payload.db as unknown as TransactionAdapter
  const db = id === undefined ? undefined : adapter.sessions[id]?.db
  if (!db) throw new Error('Content writes require a PostgreSQL transaction')
  return db
}

async function lockDocument(req: PayloadRequest, collection: ContentCollection, id: number): Promise<void> {
  const db = await transactionDB(req)
  // Row locks also serialize CMS writes, which do not use our API or advisory locks.
  await db.execute(sql`select id from ${sql.identifier(collection)} where id = ${id} for update`)
}

async function related(
  req: PayloadRequest,
  collection: 'roadmaps' | 'roadmap-nodes' | 'courses' | 'sections' | 'media',
  id: number,
) {
  try {
    return await req.payload.findByID({ collection, id, depth: 0, overrideAccess: false, user: req.user, req })
  } catch (error) {
    if (error instanceof Error && 'status' in error && error.status === 404) {
      throw new ContentError('Связанный материал не найден. Обновите страницу и выберите его заново', 404)
    }
    throw error
  }
}

function relation(value: unknown): number | undefined {
  if (typeof value === 'number') return value
  if (value && typeof value === 'object' && 'id' in value && typeof value.id === 'number') return value.id
  return undefined
}

async function validateRelations(req: PayloadRequest, collection: ContentCollection, data: Record<string, unknown>, id?: number) {
  const published = data.isPublished === true
  if (collection === 'courses') {
    const roadmapId = contentId(data.roadmap, 'Роадмап')
    const roadmap = await related(req, 'roadmaps', roadmapId)
    if (published && !('isPublished' in roadmap && roadmap.isPublished)) {
      throw new ContentError('Сначала опубликуйте роадмап, затем курс')
    }
    if (data.roadmapNode !== undefined && data.roadmapNode !== null) {
      const node = await related(req, 'roadmap-nodes', contentId(data.roadmapNode))
      if (!('roadmap' in node) || relation(node.roadmap) !== roadmapId) throw new ContentError('Узел должен принадлежать роадмапу курса')
    }
    if (Array.isArray(data.prerequisites)) {
      const ids = data.prerequisites as number[]
      if (id !== undefined && ids.includes(id)) throw new ContentError('Курс не может быть своим пререквизитом')
      if (new Set(ids).size !== ids.length) throw new ContentError('Курсы-пререквизиты не должны повторяться')
      if (ids.length) {
        const found = await req.payload.find({ collection: 'courses', where: { id: { in: ids } }, limit: ids.length, depth: 0, overrideAccess: false, user: req.user, req })
        if (found.totalDocs !== ids.length) throw new ContentError('Один из курсов-пререквизитов не найден', 404)
      }
    }
  } else {
    const courseId = contentId(data.course, 'Курс')
    const course = await related(req, 'courses', courseId)
    if (published) {
      if (!('isPublished' in course && course.isPublished)) throw new ContentError('Сначала опубликуйте курс, затем его разделы и уроки')
      const roadmap = await related(req, 'roadmaps', contentId('roadmap' in course ? relation(course.roadmap) : undefined))
      if (!('isPublished' in roadmap && roadmap.isPublished)) throw new ContentError('Сначала опубликуйте роадмап курса')
    }
    if (collection === 'lessons' && data.section !== undefined && data.section !== null) {
      const section = await related(req, 'sections', contentId(data.section))
      if (!('course' in section) || relation(section.course) !== courseId) throw new ContentError('Раздел должен принадлежать курсу урока')
      if (published && !('isPublished' in section && section.isPublished)) throw new ContentError('Сначала опубликуйте раздел, затем урок')
    }
  }
}

async function validateMedia(req: PayloadRequest, data: Record<string, unknown>): Promise<void> {
  const ids = new Set<number>()
  if (typeof data.coverImage === 'number') ids.add(data.coverImage)
  function collect(value: unknown): void {
    if (!value || typeof value !== 'object') return
    if (Array.isArray(value)) {
      for (const child of value) collect(child)
      return
    }
    const node = value as Record<string, unknown>
    if (node.type === 'upload' && node.relationTo === 'media' && typeof node.value === 'number') ids.add(node.value)
    if (node.blockType === 'image' && typeof node.image === 'number') ids.add(node.image)
    if (node.blockType === 'file' && typeof node.file === 'number') ids.add(node.file)
    for (const key of ['root', 'children', 'content']) collect(node[key])
  }
  collect(data.description)
  collect(data.content)
  if (!ids.size) return
  const media = await req.payload.find({
    collection: 'media', where: { id: { in: [...ids] } }, limit: ids.size,
    depth: 0, overrideAccess: false, user: req.user, req,
  })
  if (media.totalDocs !== ids.size) throw new ContentError('Один из файлов не найден. Загрузите его в медиатеку заново', 404)
}

function errorResponse(error: unknown): Response {
  if (error instanceof ContentError) return Response.json({ error: error.message }, { status: error.status })
  const status = error instanceof Error && 'status' in error && typeof error.status === 'number' ? error.status : 500
  if (status === 404) return Response.json({ error: 'Материал не найден' }, { status: 404 })
  if (status === 403 || status === 401) return Response.json({ error: 'Недостаточно прав для изменения контента' }, { status })
  if (status === 400) return Response.json({ error: 'Не удалось сохранить данные. Проверьте поля и уникальность адреса (slug)' }, { status: 400 })
  return Response.json({ error: 'Не удалось сохранить материал. Повторите попытку' }, { status: 500 })
}

export async function mutateContent(request: Request, rawCollection: string, rawId?: string): Promise<Response> {
  const payload = await getPayload({ config })
  const authHeaders = new Headers(request.headers)
  const authorization = authHeaders.get('Authorization')
  if (authorization !== null) {
    if (!/^(?:JWT|Bearer) \S+$/.test(authorization)) return Response.json({ error: 'Неверный заголовок авторизации' }, { status: 401 })
    // An invalid explicit token must never fall back to a valid session cookie.
    authHeaders.delete('Cookie')
  }
  const { user } = await payload.auth({ headers: authHeaders })
  if (!user) return Response.json({ error: 'Требуется авторизация' }, { status: 401 })
  if (user.role !== 'admin') return Response.json({ error: 'Управление контентом доступно только администратору' }, { status: 403 })
  let req: PayloadRequest | undefined
  try {
    if (request.headers.get('Content-Type')?.split(';')[0]?.trim().toLowerCase() !== 'application/json') {
      throw new ContentError('Для сохранения требуется Content-Type: application/json')
    }
    if (authorization === null) {
      const requestUrl = new URL(request.url)
      const origins = new Set([requestUrl.origin])
      if (process.env.NEXT_PUBLIC_SERVER_URL) origins.add(new URL(process.env.NEXT_PUBLIC_SERVER_URL).origin)
      const host = request.headers.get('Host')
      const forwardedProtocol = request.headers.get('X-Forwarded-Proto')?.split(',')[0]?.trim()
      const protocol = forwardedProtocol === 'https' || forwardedProtocol === 'http'
        ? `${forwardedProtocol}:`
        : requestUrl.protocol
      // Next can canonicalize request.url to localhost behind a proxy. Host is
      // the browser's actual destination; do not trust client X-Forwarded-Host.
      if (host && /^[a-z0-9.:[\]-]+$/i.test(host)) {
        const publicUrl = new URL(`${protocol}//${host}`)
        origins.add(publicUrl.origin)
      }
      const origin = request.headers.get('Origin')
      const fetchSite = request.headers.get('Sec-Fetch-Site')
      if (!origin || !origins.has(origin) || fetchSite === 'cross-site' || fetchSite === 'same-site') {
        throw new ContentError('Сохранение доступно только со страницы платформы', 403)
      }
    }
    const collection = contentCollection(rawCollection)
    const id = rawId === undefined ? undefined : contentId(/^\d+$/.test(rawId) ? Number(rawId) : undefined)
    let input: unknown
    try {
      const raw = await request.text()
      if (raw.length > 1_000_000) throw new ContentError('Слишком большой объём контента')
      input = JSON.parse(raw)
    } catch (error) {
      if (error instanceof ContentError) throw error
      throw new ContentError('Невалидный JSON')
    }
    const { data, expectedUpdatedAt } = validateContentInput(collection, input, id !== undefined, { deferStructuredValidation: id !== undefined })
    req = await createLocalReq({ user, req: { headers: request.headers } }, payload)
    if (!await initTransaction(req)) throw new Error('Could not start content transaction')
    let merged = data
    if (id !== undefined) {
      await lockDocument(req, collection, id)
      const current = await payload.findByID({ collection, id, depth: 0, overrideAccess: false, user, req })
      if (Date.parse(current.updatedAt) !== Date.parse(expectedUpdatedAt ?? '')) {
        throw new ContentError('Материал уже изменён. Обновите страницу перед сохранением', 409)
      }
      const parent = collection === 'courses' ? 'roadmap' : 'course'
      const previous = current as unknown as Record<string, unknown>
      validateContentInput(collection, input, true, { existing: previous })
      if (data[parent] !== undefined && data[parent] !== relation(previous[parent])) {
        throw new ContentError('Перенос материала в другой курс или роадмап недоступен')
      }
      if (data.slug === undefined) data.slug = current.slug
      merged = { ...previous, ...data }
    } else {
      const key = request.headers.get('Idempotency-Key')
      if (key !== null) {
        const replay = await replayCreation(req, collection, data, key)
        if (replay) {
          await commitTransaction(req)
          return Response.json({ doc: replay }, { status: 200 })
        }
      } else if (data.slug === undefined) data.slug = uniqueSlug(String(data.title))
    }
    await validateRelations(req, collection, merged, id)
    await validateMedia(req, data)
    const doc = id === undefined
      ? await payload.create({ collection, data: data as RequiredDataFromCollectionSlug<ContentCollection>, depth: 0, overrideAccess: false, user, req })
      : await payload.update({ collection, id, data, depth: 0, overrideAccess: false, user, req })
    await commitTransaction(req)
    return Response.json({ doc }, { status: id === undefined ? 201 : 200 })
  } catch (error) {
    if (req) await killTransaction(req)
    if (!(error instanceof ContentError) && !(error instanceof Error && 'status' in error && typeof error.status === 'number' && error.status < 500)) {
      // Do not log request bodies: video links may contain signed access tokens.
      payload.logger.error({ msg: 'Content management write failed', error: error instanceof Error ? error.name : 'UnknownError' })
    }
    return errorResponse(error)
  }
}
