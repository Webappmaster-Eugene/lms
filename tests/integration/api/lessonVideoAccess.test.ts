import { afterAll, beforeAll, describe, expect, it } from 'vitest'
import { handleEndpoints, type Payload } from 'payload'
import config from '@payload-config'

import { GET as stream } from '@/app/api/yandex-disk/stream/route'
import { resolveLessonVideoSource } from '@/server/lesson-video-access'
import { createAdmin, createCourseTree, createStudent, getTestPayload, login, rest, uid, type CourseTree, type TestUser } from '../helpers/payload'

const ROOT = 'https://disk.yandex.com/d/library-fixture'
const VIDEO = `${ROOT}/lesson.mp4`
let payload: Payload
let tree: CourseTree
let student: TestUser
let admin: TestUser
let studentToken: string
let adminToken: string
let mediaId: number
let filename: string

beforeAll(async () => {
  payload = await getTestPayload()
  student = await createStudent(payload)
  admin = await createAdmin(payload)
  studentToken = await login(payload, student)
  adminToken = await login(payload, admin)
  tree = await createCourseTree(payload, { lessons: 1 })
  const file = Buffer.from('000000186674797069736f6d0000020069736f6d6d703432000000086d646174', 'hex')
  const media = await payload.create({
    collection: 'media', data: { alt: 'Видео доступа' },
    file: { data: file, mimetype: 'video/mp4', name: `${uid('protected')}.mp4`, size: file.length },
  })
  mediaId = media.id
  filename = media.filename ?? ''
  await payload.update({ collection: 'lessons', id: tree.lessons[0].id, data: {
    description: `Видео ${VIDEO}`,
    content: [
      { id: 'video-1', blockType: 'video', title: 'Видео', videoUrl: VIDEO, displayMode: 'link' },
      { id: 'media-1', blockType: 'video', title: 'Repaired', videoUrl: media.url ?? '', displayMode: 'embed' },
      { id: 'root-1', blockType: 'link', title: 'Открыть папку программы', url: ROOT },
      { id: 'zip-1', blockType: 'link', title: 'Исходники', url: `${ROOT}/source.zip` },
    ],
  } })
  await payload.update({ collection: 'courses', id: tree.course.id, data: {
    description: { root: { type: 'root', direction: 'ltr', format: '', indent: 0, version: 1, children: [
      { type: 'paragraph', version: 1, children: [{ type: 'link', version: 3, fields: { linkType: 'custom', url: ROOT, newTab: true }, children: [{ type: 'text', text: 'Открыть весь курс', version: 1 }] }] },
    ] } },
  } })
})

afterAll(async () => {
  if (mediaId) await payload.delete({ collection: 'media', id: mediaId })
})

describe('источники видео в REST и Media Range', () => {
  it('ученик получает внутренние video URLs, администрация сохраняет оригиналы', async () => {
    const path = `/lessons/${tree.lessons[0].id}?depth=0`
    const learner = await rest('GET', path, { token: studentToken })
    expect(learner.status).toBe(200)
    expect(JSON.stringify(learner.json)).not.toContain(VIDEO)
    expect(JSON.stringify(learner.json)).toContain(`/api/yandex-disk/stream?lesson=${tree.lessons[0].id}`)
    expect(JSON.stringify(learner.json)).toContain(`${ROOT}/source.zip`)
    expect(learner.json.content).toEqual(expect.arrayContaining([expect.objectContaining({ id: 'root-1', blockType: 'text' })]))
    const editor = await rest('GET', path, { token: adminToken })
    expect(JSON.stringify(editor.json)).toContain(VIDEO)
    expect(JSON.stringify(editor.json)).toContain('"displayMode":"link"')
    const server = await payload.findByID({ collection: 'lessons', id: tree.lessons[0].id, depth: 0, overrideAccess: true })
    expect(server.content?.[0]).toMatchObject({ videoUrl: VIDEO })
  })

  it('клиентские параметры не включают серверный override redaction', async () => {
    const read = await rest('GET', `/lessons/${tree.lessons[0].id}?overrideAccess=true&context[keepVideoSources]=true`, { token: studentToken })
    expect(read.status).toBe(200)
    expect(JSON.stringify(read.json)).not.toContain(VIDEO)
  })

  it('каталог источников скрыт также при depth/populate и чтении курса напрямую', async () => {
    const read = await rest('GET', `/courses/${tree.course.id}?depth=0`, { token: studentToken })
    expect(read.status).toBe(200)
    expect(JSON.stringify(read.json)).not.toContain(ROOT)
    expect(JSON.stringify(read.json)).toContain('Материалы курса доступны в уроках LMS')
    const nested = await rest('GET', `/lessons/${tree.lessons[0].id}?depth=2`, { token: studentToken })
    const course = nested.json.course
    expect(JSON.stringify(course)).not.toContain(ROOT)
  })

  it('Media video недоступно гостю, нативные Range доступны ученику', async () => {
    const guest = await handleEndpoints({ config, request: new Request(`http://lms.test/api/media/file/${filename}`, { headers: { Range: 'bytes=0-7' } }) })
    expect(guest.status).toBe(403)
    const allowed = await handleEndpoints({ config, request: new Request(`http://lms.test/api/media/file/${filename}`, { headers: { Range: 'bytes=0-7', Authorization: `JWT ${studentToken}` } }) })
    expect(allowed.status).toBe(206)
    expect((await allowed.arrayBuffer()).byteLength).toBe(8)
    expect(allowed.headers.get('Content-Range')).toMatch(/^bytes 0-7\//)
    expect(allowed.headers.get('Cache-Control')).toBe('private, no-store')
    const list = await rest('GET', `/media/${mediaId}`)
    expect(list.status).toBe(404)
  })

  it('ID-видео Media продолжает работать после redaction без обращения к Яндексу', async () => {
    const url = `http://lms.test/api/yandex-disk/stream?lesson=${tree.lessons[0].id}&block=media-1`
    const response = await stream(new Request(url, { headers: { Authorization: `JWT ${studentToken}` } }))
    expect(response.status).toBe(302)
    expect(response.headers.get('Location')).toBe(`/api/media/file/${filename}`)
    expect(response.headers.get('Cache-Control')).toBe('private, no-store')
    expect((await stream(new Request(url))).status).toBe(401)
  })

  it('серверный resolver получает реальный исходник после student-response redaction', async () => {
    const params = new URLSearchParams({ lesson: String(tree.lessons[0].id), block: 'video-1' })
    expect(await resolveLessonVideoSource(payload, student, params)).toMatchObject({ kind: 'yandex', ref: { publicKey: ROOT } })
    await payload.update({ collection: 'sections', id: tree.section.id, data: { isPublished: false } })
    await expect(resolveLessonVideoSource(payload, student, params)).rejects.toMatchObject({ status: 404 })
    await payload.update({ collection: 'sections', id: tree.section.id, data: { isPublished: true } })
    await payload.update({ collection: 'courses', id: tree.course.id, data: { isPublished: false } })
    await expect(resolveLessonVideoSource(payload, student, params)).rejects.toMatchObject({ status: 404 })
    expect(await resolveLessonVideoSource(payload, admin, params)).toMatchObject({ kind: 'yandex' })
    await payload.update({ collection: 'courses', id: tree.course.id, data: { isPublished: true } })
  })
})
