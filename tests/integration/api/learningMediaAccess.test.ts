import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { commitTransaction, createLocalReq, handleEndpoints, initTransaction, killTransaction, type CollectionBeforeChangeHook, type Payload } from 'payload'
import config from '@payload-config'

import { GET as fileGET, HEAD as fileHEAD } from '@/app/api/media/file/[filename]/route'
import { GET as stream } from '@/app/api/yandex-disk/stream/route'
import { resolveLessonVideoSource } from '@/server/lesson-video-access'
import { createAdmin, createCourseTree, createStudent, getTestPayload, login, rest, uid, type CourseTree, type TestUser } from '../helpers/payload'
import type { Media } from '@/payload-types'
import { POST as backfill } from '@/app/api/manage/media-references/route'
import { sql } from '@payloadcms/db-postgres'
import { writeFile, unlink } from 'node:fs/promises'
import path from 'node:path'
import sharp from 'sharp'

let payload: Payload
let admin: TestUser
let student: TestUser
let other: TestUser
let token: string
let otherToken: string
let tree: CourseTree
let denied: CourseTree
let sharedImage: Media
let cover: Media
let pdf: Media
let orphan: Media
let video: Media
let avatar: Media
let richImage: Media
let grantId: number
const createdMedia: number[] = []
const createdLessons: number[] = []

const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')
const VIDEO = Buffer.from('000000186674797069736f6d0000020069736f6d6d703432000000086d646174', 'hex')
function blankPDF(): Buffer {
  const objects = ['<< /Type /Catalog /Pages 2 0 R >>', '<< /Type /Pages /Kids [3 0 R] /Count 1 >>', '<< /Type /Page /Parent 2 0 R /MediaBox [0 0 100 100] >>']
  let text = '%PDF-1.4\n'
  const offsets = objects.map((object, index) => { const offset = Buffer.byteLength(text); text += `${index + 1} 0 obj\n${object}\nendobj\n`; return offset })
  const start = Buffer.byteLength(text)
  text += `xref\n0 4\n0000000000 65535 f \n${offsets.map((offset) => `${String(offset).padStart(10, '0')} 00000 n \n`).join('')}trailer\n<< /Size 4 /Root 1 0 R >>\nstartxref\n${start}\n%%EOF\n`
  return Buffer.from(text)
}

async function upload(mime: string, extension: string, bytes: Buffer, owner?: TestUser): Promise<Media> {
  const req = await createLocalReq({ user: owner ?? admin }, payload)
  const doc = await payload.create({ collection: 'media', req, overrideAccess: true, data: { alt: 'Проверка границы учебных файлов' },
    file: { data: bytes, mimetype: mime, name: `${uid('asset')}.${extension}`, size: bytes.length } })
  createdMedia.push(doc.id)
  return doc
}

function request(filename: string, jwt?: string, range?: string, method = 'GET'): Request {
  const headers = new Headers()
  if (jwt) headers.set('Authorization', `JWT ${jwt}`)
  if (range) headers.set('Range', range)
  return new Request(`http://lms.test/api/media/file/${encodeURIComponent(filename)}`, { method, headers })
}
async function get(doc: Media, jwt?: string, range?: string, filename = doc.filename ?? '') {
  return fileGET(request(filename, jwt, range), { params: Promise.resolve({ filename }) })
}

beforeAll(async () => {
  payload = await getTestPayload()
  admin = await createAdmin(payload)
  student = await createStudent(payload, { learningAccessMode: 'assigned' })
  other = await createStudent(payload, { learningAccessMode: 'assigned' })
  token = await login(payload, student)
  otherToken = await login(payload, other)
  tree = await createCourseTree(payload, { lessons: 1 })
  denied = await createCourseTree(payload, { lessons: 1 })
  createdLessons.push(...tree.lessons.map((lesson) => lesson.id), ...denied.lessons.map((lesson) => lesson.id))
  const image = await sharp({ create: { width: 800, height: 600, channels: 4, background: { r: 12, g: 90, b: 70, alpha: 1 } } }).png().toBuffer()
  sharedImage = await upload('image/png', 'png', image)
  cover = await upload('image/png', 'png', PNG)
  avatar = await upload('image/png', 'png', PNG, student)
  pdf = await upload('application/pdf', 'pdf', blankPDF())
  orphan = await upload('application/zip', 'zip', Buffer.from('504b05060000000000000000000000000000000000000000', 'hex'))
  video = await upload('video/mp4', 'mp4', VIDEO)
  richImage = await upload('image/png', 'png', PNG)
  await payload.update({ collection: 'lessons', id: tree.lessons[0].id, data: { content: [
    { blockType: 'image', image: sharedImage.id, id: 'image' },
    { blockType: 'file', file: pdf.id, title: 'Учебный PDF', id: 'file' },
    { blockType: 'video', videoUrl: video.url ?? '', title: 'Нативное видео', id: 'video' },
    { blockType: 'text', id: 'rich', content: { root: { type: 'root', direction: 'ltr', format: '', indent: 0, version: 1, children: [
      { type: 'paragraph', version: 1, children: [{ type: 'link', version: 3, fields: { linkType: 'custom', url: richImage.url, newTab: false }, children: [{ type: 'text', text: 'Материал', version: 1 }] }] },
    ] } } },
  ] } })
  await payload.update({ collection: 'lessons', id: denied.lessons[0].id, data: { content: [{ blockType: 'image', image: sharedImage.id }] } })
  await payload.update({ collection: 'courses', id: tree.course.id, data: { coverImage: cover.id } })
  const req = await createLocalReq({ user: admin }, payload)
  const grant = await payload.create({ collection: 'learning-access-grants', req, data: { user: student.id, target: { relationTo: 'courses', value: tree.course.id }, effect: 'allow', ruleKey: 'server-generated' } })
  grantId = grant.id
})

afterAll(async () => {
  for (const id of createdLessons) await payload.delete({ collection: 'lessons', id })
  for (const id of createdMedia) await payload.delete({ collection: 'media', id })
})

describe('Media references, entitlement, aliases and orphan rejection', () => {
  it('private PDF, images and video have no guest metadata or byte access', async () => {
    for (const doc of [sharedImage, pdf, video, orphan]) {
      expect((await rest('GET', `/media/${doc.id}`)).status).toBe(404)
      const response = await get(doc)
      expect(response.status).toBe(401)
      expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    }
  })
  it('published covers are explicitly public; unknown raster uploads are private', async () => {
    expect((await rest('GET', `/media/${cover.id}`)).status).toBe(200)
    const response = await get(cover)
    expect(response.status).toBe(200)
    expect((await response.arrayBuffer()).byteLength).toBeGreaterThan(0)
    expect((await rest('GET', `/media/${sharedImage.id}`, { token: otherToken })).status).toBe(404)
    expect((await get(sharedImage, otherToken)).status).toBe(404)
  })
  it('a public cover cannot publish an image or thumbnail referenced by a private lesson', async () => {
    await payload.update({ collection: 'courses', id: tree.course.id, data: { coverImage: sharedImage.id } })
    expect((await get(sharedImage)).status).toBe(401)
    expect((await rest('GET', `/media/${sharedImage.id}`)).status).toBe(404)
    const filename = sharedImage.sizes?.thumbnail?.filename
    if (!filename) throw new Error('Fixture thumbnail is missing')
    expect((await get(sharedImage, undefined, undefined, filename)).status).toBe(401)
    const allowed = await get(sharedImage, token)
    expect(allowed.status).toBe(200)
    await allowed.arrayBuffer()
    await payload.update({ collection: 'courses', id: tree.course.id, data: { coverImage: cover.id } })
  })
  it('a student cannot publish a guessed private or entitled course image through avatar PATCH', async () => {
    const deniedAvatar = await rest('PATCH', `/users/${student.id}`, { token, body: { avatar: sharedImage.id } })
    expect(deniedAvatar.status).toBe(403)
    expect((await get(sharedImage)).status).toBe(401)
    const filename = sharedImage.sizes?.thumbnail?.filename
    if (!filename) throw new Error('Fixture thumbnail is missing')
    expect((await get(sharedImage, undefined, undefined, filename)).status).toBe(401)
    const profile = await payload.findByID({ collection: 'users', id: student.id, depth: 0 })
    expect(profile.avatar).not.toBe(sharedImage.id)
  })
  it('an allowed lesson reference opens a reused image, an unrelated student cannot open it', async () => {
    expect((await rest('GET', `/media/${sharedImage.id}`, { token })).status).toBe(200)
    const response = await get(sharedImage, token)
    expect(response.status).toBe(200)
    await response.arrayBuffer()
    const deniedResponse = await get(sharedImage, otherToken)
    expect(deniedResponse.status).toBe(404)
  })
  it('thumbnail aliases resolve to the same Media document and permission', async () => {
    const filename = sharedImage.sizes?.thumbnail?.filename
    expect(filename).toBeTruthy()
    if (!filename) throw new Error('Fixture thumbnail is missing')
    const allowed = await get(sharedImage, token, undefined, filename)
    expect(allowed.status).toBe(200)
    await allowed.arrayBuffer()
    expect((await get(sharedImage, otherToken, undefined, filename)).status).toBe(404)
    const fallback = await handleEndpoints({ config, request: request(filename, otherToken) })
    expect(fallback.status).toBe(403)
  })
  it('derived index includes real rich text URLs and cannot be spoofed by an admin PATCH', async () => {
    const response = await get(richImage, token)
    expect(response.status).toBe(200)
    await response.arrayBuffer()
    await payload.update({ collection: 'lessons', id: tree.lessons[0].id, data: { mediaReferences: [orphan.id], mediaReferencesResolved: true } })
    expect((await get(orphan, token)).status).toBe(404)
    const read = await payload.findByID({ collection: 'lessons', id: tree.lessons[0].id, depth: 0 })
    expect(read.mediaReferences).toContain(richImage.id)
    expect(read.mediaReferences).not.toContain(orphan.id)
  })
  it('real admin REST creates and patches derive references despite field access denial for client values', async () => {
    const adminToken = await login(payload, admin)
    const created = await rest('POST', '/lessons', { token: adminToken, body: {
      title: uid('rest-reference'), slug: uid('rest-reference'), course: tree.course.id, section: tree.section.id, isPublished: true,
      content: [{ blockType: 'file', title: 'Материал', file: pdf.id }], mediaReferences: [orphan.id], mediaReferencesResolved: false,
    } })
    expect(created.status).toBe(201)
    const responseDoc = created.json.doc as { id: number }
    createdLessons.push(responseDoc.id)
    const doc = await payload.findByID({ collection: 'lessons', id: responseDoc.id, depth: 0 })
    expect(doc.mediaReferencesResolved).toBe(true)
    expect(doc.mediaReferences).toContain(pdf.id)
    expect(doc.mediaReferences).not.toContain(orphan.id)
    const patched = await rest('PATCH', `/lessons/${doc.id}`, { token: adminToken, body: {
      content: [{ blockType: 'image', image: sharedImage.id }], mediaReferences: [orphan.id], mediaReferencesResolved: false,
    } })
    expect(patched.status).toBe(200)
    const next = await payload.findByID({ collection: 'lessons', id: doc.id, depth: 0 })
    expect(next.mediaReferencesResolved).toBe(true)
    expect(next.mediaReferences).toContain(sharedImage.id)
    expect(next.mediaReferences).not.toContain(pdf.id)
    expect(next.mediaReferences).not.toContain(orphan.id)
  })
  it('owner can preview a new avatar before linking it; other users cannot', async () => {
    expect((await rest('GET', `/media/${avatar.id}`, { token })).status).toBe(200)
    expect((await rest('GET', `/media/${avatar.id}`, { token: otherToken })).status).toBe(404)
    expect((await get(avatar)).status).toBe(401)
    expect((await rest('PATCH', `/users/${student.id}`, { token, body: { avatar: avatar.id } })).status).toBe(200)
    const publicAvatar = await get(avatar)
    expect(publicAvatar.status).toBe(200)
    await publicAvatar.arrayBuffer()
  })
  it('legacy unchanged avatar survives profile edits and access-mode changes; clearing remains allowed', async () => {
    const adminReq = await createLocalReq({ user: admin }, payload)
    await payload.update({ collection: 'users', id: student.id, req: adminReq, data: { avatar: cover.id } })
    expect((await rest('PATCH', `/users/${student.id}`, { token, body: { firstName: 'Ученик', avatar: cover.id } })).status).toBe(200)
    await payload.update({ collection: 'users', id: student.id, req: await createLocalReq({ user: admin }, payload), data: { learningAccessMode: 'all' } })
    expect((await rest('PATCH', `/users/${student.id}`, { token, body: { firstName: 'Ученик Александр' } })).status).toBe(200)
    const legacy = await payload.findByID({ collection: 'users', id: student.id, depth: 0 })
    expect(legacy.avatar).toBe(cover.id)
    await payload.update({ collection: 'users', id: student.id, req: await createLocalReq({ user: admin }, payload), data: { learningAccessMode: 'assigned' } })
    expect((await rest('PATCH', `/users/${student.id}`, { token, body: { avatar: null } })).status).toBe(200)
  })
  it('denies known orphan metadata and filesystem files even to logged-in students', async () => {
    expect((await rest('GET', `/media/${orphan.id}`, { token })).status).toBe(404)
    expect((await get(orphan, token)).status).toBe(404)
    const filename = `${uid('unregistered')}.mp4`
    const upload = payload.collections.media.config.upload
    if (!upload) throw new Error('Fixture upload directory is missing')
    const physicalPath = path.resolve(upload.staticDir || 'media', filename)
    await writeFile(physicalPath, VIDEO)
    try {
      const response = await fileGET(request(filename, token), { params: Promise.resolve({ filename }) })
      expect(response.status).toBe(404)
      const fallback = await handleEndpoints({ config, request: request(filename, token) })
      expect(fallback.status).toBe(403)
    } finally { await unlink(physicalPath) }
  })
  it('HEAD and Range use actual size; 416 keeps file size with no-store', async () => {
    const head = await fileHEAD(request(video.filename ?? '', token, undefined, 'HEAD'), { params: Promise.resolve({ filename: video.filename ?? '' }) })
    expect(head.status).toBe(200)
    expect(head.body).toBeNull()
    expect(head.headers.get('Content-Length')).toBe(String(VIDEO.length))
    const partial = await get(video, token, 'bytes=8-15')
    expect(partial.status).toBe(206)
    expect(partial.headers.get('Content-Range')).toBe(`bytes 8-15/${VIDEO.length}`)
    expect(Buffer.from(await partial.arrayBuffer())).toEqual(VIDEO.subarray(8, 16))
    const invalid = await get(video, token, 'bytes=999-')
    expect(invalid.status).toBe(416)
    expect(invalid.headers.get('Content-Range')).toBe(`bytes */${VIDEO.length}`)
    expect(invalid.headers.get('Cache-Control')).toBe('private, no-store')
  })
  it('opaque native stream rechecks entitlement and never redirects or exposes a source', async () => {
    const url = `http://lms.test/api/yandex-disk/stream?lesson=${tree.lessons[0].id}&block=video`
    const response = await stream(new Request(url, { headers: { Authorization: `JWT ${token}`, Range: 'bytes=0-7' } }))
    expect(response.status).toBe(206)
    expect(response.headers.get('Location')).toBeNull()
    expect((await response.arrayBuffer()).byteLength).toBe(8)
    expect((await stream(new Request(url, { headers: { Authorization: `JWT ${otherToken}` } }))).status).toBe(403)
    expect((await stream(new Request(url, { headers: { Cookie: 'payload-token=expired.invalid.jwt' } }))).status).toBe(401)
    expect((await stream(new Request(url))).status).toBe(401)
  })
  it('revocation takes effect on the very next metadata, bytes and resolver request', async () => {
    const req = await createLocalReq({ user: admin }, payload)
    await payload.update({ collection: 'learning-access-grants', id: grantId, req, data: { effect: 'deny' } })
    expect((await rest('GET', `/media/${video.id}`, { token })).status).toBe(404)
    expect((await get(video, token)).status).toBe(404)
    await expect(resolveLessonVideoSource(payload, student, new URLSearchParams({ lesson: String(tree.lessons[0].id), block: 'video' }))).rejects.toMatchObject({ status: 403 })
    await payload.update({ collection: 'learning-access-grants', id: grantId, req: await createLocalReq({ user: admin }, payload), data: { effect: 'allow' } })
  })
  it('unpublishing the parent closes media despite an existing course assignment', async () => {
    await payload.update({ collection: 'courses', id: tree.course.id, data: { isPublished: false } })
    expect((await get(video, token)).status).toBe(404)
    await payload.update({ collection: 'courses', id: tree.course.id, data: { isPublished: true } })
  })
  it('legacy fallback includes rich text, while admin dry-run and idempotent backfill preserve material', async () => {
    const adapter = payload.db as unknown as { drizzle: { execute: (query: ReturnType<typeof sql>) => Promise<unknown> } }
    await adapter.drizzle.execute(sql`update lessons set media_references_resolved = false where id = ${tree.lessons[0].id}`)
    const legacy = await get(richImage, token)
    expect(legacy.status).toBe(200)
    await legacy.arrayBuffer()
    const original = await payload.findByID({ collection: 'lessons', id: tree.lessons[0].id, depth: 0 })
    const adminToken = await login(payload, admin)
    const run = (jwt: string, apply?: boolean) => backfill(new Request('http://lms.test/api/manage/media-references', {
      method: 'POST', headers: { Authorization: `JWT ${jwt}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ cursor: tree.lessons[0].id - 1, limit: 1, ...(apply === undefined ? {} : { apply }) }),
    }))
    expect((await run(token, true)).status).toBe(403)
    expect(await (await run(adminToken)).json()).toMatchObject({ dryRun: true, scanned: 1, resolved: 0 })
    const afterDry = await payload.findByID({ collection: 'lessons', id: tree.lessons[0].id, depth: 0 })
    expect(afterDry.mediaReferencesResolved).toBe(false)
    expect(await (await run(adminToken, true)).json()).toMatchObject({ dryRun: false, scanned: 1, resolved: 1 })
    const after = await payload.findByID({ collection: 'lessons', id: tree.lessons[0].id, depth: 0 })
    expect(after.mediaReferencesResolved).toBe(true)
    expect(after.content).toEqual(original.content)
    expect(after.description).toEqual(original.description)
    expect(await (await run(adminToken, true)).json()).toMatchObject({ dryRun: false, scanned: 0, resolved: 0 })
  })
  it('backfill rejects malformed authorization cookie fallback, CSRF, wrong content type and an oversized streamed body', async () => {
    const adminToken = await login(payload, admin)
    const run = (headers: Record<string, string>, body: string | ReadableStream<Uint8Array> = '{}') => backfill(new Request('http://lms.test/api/manage/media-references', {
      method: 'POST', headers, body, ...(typeof body === 'string' ? {} : { duplex: 'half' }),
    } as RequestInit & { duplex?: 'half' }))
    expect((await run({ Authorization: 'broken', Cookie: `payload-token=${adminToken}`, 'Content-Type': 'application/json' })).status).toBe(401)
    expect((await run({ Authorization: 'JWT invalid', Cookie: `payload-token=${adminToken}`, 'Content-Type': 'application/json' })).status).toBe(401)
    expect((await run({ Cookie: `payload-token=${adminToken}`, 'Content-Type': 'application/json' })).status).toBe(401)
    expect((await run({ Cookie: `payload-token=${adminToken}`, Origin: 'https://evil.example', 'Content-Type': 'application/json' })).status).toBe(401)
    expect((await run({ Authorization: `JWT ${adminToken}`, 'Content-Type': 'text/plain' })).status).toBe(415)
    const body = new ReadableStream<Uint8Array>({ start(controller) { controller.enqueue(new Uint8Array(3000)); controller.enqueue(new Uint8Array(3000)); controller.close() } })
    expect((await run({ Authorization: `JWT ${adminToken}`, 'Content-Type': 'application/json' }, body)).status).toBe(413)
    expect((await run({ Cookie: `payload-token=${adminToken}`, Origin: 'http://lms.test', 'Content-Type': 'application/json' })).status).toBe(200)
  })
  it('a concurrent backfill cannot resurrect a removed rich text asset reference', async () => {
    const writer = await createLocalReq({ user: admin }, payload)
    await initTransaction(writer)
    const adapter = payload.db as unknown as { sessions: Record<string | number, { db: { execute: (query: ReturnType<typeof sql>) => Promise<unknown> } } | undefined> }
    const transaction = await writer.transactionID
    const db = transaction === undefined ? undefined : adapter.sessions[transaction]?.db
    if (!db) throw new Error('Fixture transaction is unavailable')
    await db.execute(sql`select id from lessons where id = ${tree.lessons[0].id} for update`)
    const observed = Promise.withResolvers<void>()
    const hook: CollectionBeforeChangeHook = ({ req, data }) => {
      if (req.context.referenceRaceGate) observed.resolve()
      return data
    }
    const hooks = payload.collections.lessons.config.hooks.beforeChange
    hooks.unshift(hook)
    let concurrent: Promise<unknown> | undefined
    try {
      const reader = await createLocalReq({ user: admin, context: { referenceRaceGate: true } }, payload)
      concurrent = payload.update({ collection: 'lessons', id: tree.lessons[0].id, req: reader, data: {} })
      await observed.promise
      const current = await payload.findByID({ collection: 'lessons', id: tree.lessons[0].id, req: writer, depth: 0 })
      await payload.update({ collection: 'lessons', id: current.id, req: writer, data: { content: current.content?.filter((block) => block.id !== 'rich') } })
      await commitTransaction(writer)
      await concurrent
      const after = await payload.findByID({ collection: 'lessons', id: current.id, depth: 0 })
      expect(after.content?.some((block) => block.id === 'rich')).toBe(false)
      expect(after.mediaReferences).not.toContain(richImage.id)
      expect((await get(richImage, token)).status).toBe(404)
    } finally {
      hooks.splice(hooks.indexOf(hook), 1)
      await killTransaction(writer)
      await concurrent
    }
  })
})
