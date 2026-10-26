import { mkdir, readFile, rmdir, unlink, writeFile } from 'node:fs/promises'
import path from 'node:path'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'

import { GET as assetGET, HEAD as assetHEAD } from '@/app/api/learning-assets/route'
import { GET as fileGET } from '@/app/api/media/file/[filename]/route'
import { POST as backfill } from '@/app/api/manage/media-references/route'
import type { Media } from '@/payload-types'
import { createAdmin, createCourseTree, createStudent, getTestPayload, login, uid, type CourseTree, type TestUser } from '../helpers/payload'

/**
 * Материалы урока через /api/learning-assets и собственные файлы медиатеки:
 * права, отказ хранилища, квота одновременных потоков и сбои базы.
 * Яндекс.Диск подменён на уровне fetch — реальной сети нет.
 */
const ROOT = `https://disk.yandex.com/d/${uid('assets')}`
const PNG = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==', 'base64')

let payload: Payload
let admin: TestUser
let adminToken: string
let tree: CourseTree
let image: Media
const disk = vi.fn(async (input: unknown) => {
  const url = new URL(String(input))
  if (url.hostname === 'cloud-api.yandex.net') {
    const file = url.searchParams.get('path') ?? ''
    if (file.endsWith('missing.zip')) return new Response('{}', { status: 404 })
    if (file.endsWith('forbidden.zip')) return new Response('{}', { status: 403 })
    return Response.json({ href: `https://downloader.disk.yandex.ru/disk${file}?signature=secret` })
  }
  if (url.hostname === 'downloader.disk.yandex.ru') {
    // Хранилище отвечает «активным» типом: сервер обязан не довериться ему.
    return new Response(new Uint8Array([80, 75, 5, 6]), { headers: { 'Content-Type': 'text/html', 'Content-Length': '4' } })
  }
  throw new Error(`Внешняя сеть в тестах запрещена: ${url.href}`)
})

const asset = (block: string, token?: string, extra = '', method = 'GET') => {
  const request = new Request(`http://lms.test/api/learning-assets?lesson=${tree.lessons[0].id}&block=${block}${extra}`, { method, headers: token ? { Authorization: `JWT ${token}` } : {} })
  return method === 'HEAD' ? assetHEAD(request) : assetGET(request)
}
const file = (filename: string, token: string) => fileGET(new Request(`http://lms.test/api/media/file/${filename}`, { headers: { Authorization: `JWT ${token}` } }), { params: Promise.resolve({ filename }) })

async function viewer(overrides: Parameters<typeof createStudent>[1] = {}) {
  const user = await createStudent(payload, overrides)
  return { user, token: await login(payload, user) }
}

beforeAll(async () => {
  payload = await getTestPayload()
  admin = await createAdmin(payload)
  adminToken = await login(payload, admin)
  tree = await createCourseTree(payload, { lessons: 1 })
  await payload.update({ collection: 'lessons', id: tree.lessons[0].id, data: { content: [
    { id: 'zip-1', blockType: 'link', title: 'Исходники', url: `${ROOT}/source.zip` },
    { id: 'pdf-1', blockType: 'link', title: 'Конспект', url: `${ROOT}/notes.pdf` },
    { id: 'root-1', blockType: 'link', title: 'Вся папка', url: ROOT },
    { id: 'missing-1', blockType: 'link', title: 'Удалённый файл', url: `${ROOT}/missing.zip` },
    { id: 'forbidden-1', blockType: 'link', title: 'Закрытый файл', url: `${ROOT}/forbidden.zip` },
  ] } })
  image = await payload.create({ collection: 'media', data: { alt: 'Квота потоков' }, file: { data: PNG, mimetype: 'image/png', name: `${uid('quota')}.png`, size: PNG.length } })
  vi.stubGlobal('fetch', disk)
})
afterEach(() => { vi.restoreAllMocks() })
afterAll(async () => {
  vi.unstubAllGlobals()
  if (image) await payload.delete({ collection: 'media', id: image.id })
})

describe('GET /api/learning-assets — материалы урока', () => {
  it('гость — 401, ученик без назначения — 403, ни одного обращения к Диску', async () => {
    disk.mockClear()
    expect((await asset('zip-1')).status).toBe(401)
    const { token } = await viewer({ learningAccessMode: 'assigned' })
    const denied = await asset('zip-1', token)
    expect(denied.status).toBe(403)
    expect(denied.headers.get('Cache-Control')).toBe('private, no-store')
    expect(disk).not.toHaveBeenCalled()
  })

  it('ученик с доступом получает файл байтами: тип по расширению, скачивание, без подписанной ссылки', async () => {
    const { token } = await viewer()
    const response = await asset('zip-1', token)
    expect(response.status).toBe(200)
    expect(response.headers.get('Content-Type')).toBe('application/zip')
    expect(response.headers.get('Content-Disposition')).toBe("attachment; filename*=UTF-8''source.zip")
    expect(response.headers.get('Location')).toBeNull()
    expect(Array.from(new Uint8Array(await response.arrayBuffer()))).toEqual([80, 75, 5, 6])
    const pdf = await asset('pdf-1', token, '', 'HEAD')
    expect(pdf.status).toBe(200)
    expect(pdf.headers.get('Content-Type')).toBe('application/pdf')
    expect(pdf.body).toBeNull()
  })

  it('папка целиком, неизвестный блок и испорченный идентификатор материала не выдаются', async () => {
    const { token } = await viewer()
    expect((await asset('root-1', token)).status).toBe(404)
    expect((await asset('no-such-block', token)).status).toBe(404)
    expect((await asset('zip-1', token, '&asset=../../etc')).status).toBe(400)
  })

  it('удалённый на Диске файл — 404, отказ Диска — 502, текст ошибки без адресов', async () => {
    const { token } = await viewer()
    const missing = await asset('missing-1', token)
    expect(missing.status).toBe(404)
    const forbidden = await asset('forbidden-1', token)
    expect(forbidden.status).toBe(502)
    for (const body of [await missing.json(), await forbidden.json()]) {
      expect(body).toEqual({ error: 'Не удалось открыть файл. Попробуйте ещё раз' })
    }
  })

  it('седьмой одновременный поток — 429 с Retry-After, после закрытия потоков доступ возвращается', async () => {
    const { token } = await viewer()
    const open = await Promise.all(Array.from({ length: 6 }, () => asset('zip-1', token)))
    expect(open.map((response) => response.status)).toEqual([200, 200, 200, 200, 200, 200])
    const limited = await asset('zip-1', token)
    expect(limited.status).toBe(429)
    expect(limited.headers.get('Retry-After')).toBe('60')
    await Promise.all(open.map((response) => response.body?.cancel()))
    const again = await asset('zip-1', token)
    expect(again.status).toBe(200)
    await again.arrayBuffer()
  })
})

describe('GET /api/media/file — квота и сбои', () => {
  it('седьмой одновременный поток файла — 429 с Retry-After', async () => {
    const quotaAdmin = await createAdmin(payload)
    const token = await login(payload, quotaAdmin)
    const open = await Promise.all(Array.from({ length: 6 }, () => file(image.filename ?? '', token)))
    expect(open.map((response) => response.status)).toEqual([200, 200, 200, 200, 200, 200])
    const limited = await file(image.filename ?? '', token)
    expect(limited.status).toBe(429)
    expect(limited.headers.get('Retry-After')).toBe('60')
    await Promise.all(open.map((response) => response.body?.cancel()))
    expect((await file(image.filename ?? '', token)).status).toBe(200)
  })

  it('сбой базы при проверке прав — 500 без деталей, сбой авторизации — 503', async () => {
    const find = payload.find.bind(payload)
    vi.spyOn(payload, 'find').mockImplementation(((args: Parameters<Payload['find']>[0]) => args.collection === 'media'
      ? Promise.reject(new Error('relation "media" is locked'))
      : find(args)) as Payload['find'])
    const failed = await file(image.filename ?? '', adminToken)
    expect(failed.status).toBe(500)
    expect(await failed.json()).toEqual({ error: 'Не удалось открыть файл' })
    vi.restoreAllMocks()

    vi.spyOn(payload, 'auth').mockRejectedValueOnce(new Error('connection terminated'))
    const unavailable = await file(image.filename ?? '', adminToken)
    expect(unavailable.status).toBe(503)
    expect(await unavailable.json()).toEqual({ error: 'Сервис файлов временно недоступен' })
  })

  it('файл, который не удалось прочитать на диске, обрывает поток и освобождает слот', async () => {
    const quotaAdmin = await createAdmin(payload)
    const token = await login(payload, quotaAdmin)
    const broken = await payload.create({ collection: 'media', data: { alt: 'Сломанный файл' }, file: { data: PNG, mimetype: 'image/png', name: `${uid('broken')}.png`, size: PNG.length } })
    const location = path.resolve('media', broken.filename ?? '')
    const original = await readFile(location)
    // Каталог вместо файла: stat проходит, а чтение падает с EISDIR — и под root тоже.
    await unlink(location)
    await mkdir(location)
    try {
      const response = await file(broken.filename ?? '', token)
      expect(response.status).toBe(200)
      await expect(response.arrayBuffer()).rejects.toThrow()
      const open = await Promise.all(Array.from({ length: 6 }, () => file(image.filename ?? '', token)))
      expect(open.map((item) => item.status)).toEqual([200, 200, 200, 200, 200, 200])
      await Promise.all(open.map((item) => item.body?.cancel()))
    } finally {
      await rmdir(location)
      await writeFile(location, original)
      await payload.delete({ collection: 'media', id: broken.id })
    }
  })
})

describe('POST /api/manage/media-references — сбои', () => {
  const run = (body: unknown) => backfill(new Request('http://lms.test/api/manage/media-references', { method: 'POST', headers: { Authorization: `JWT ${adminToken}`, 'Content-Type': 'application/json' }, body: JSON.stringify(body) }))

  it('сбой чтения уроков — 500 с подсказкой, что повтор безопасен', async () => {
    const find = payload.find.bind(payload)
    vi.spyOn(payload, 'find').mockImplementation(((args: Parameters<Payload['find']>[0]) => args.collection === 'lessons'
      ? Promise.reject(new Error('statement timeout'))
      : find(args)) as Payload['find'])
    const response = await run({ limit: 5 })
    expect(response.status).toBe(500)
    expect(await response.json()).toEqual({ error: 'Не удалось построить индекс файлов. Повторный запрос безопасен' })
  })

  it('сбой авторизации — 503', async () => {
    vi.spyOn(payload, 'auth').mockRejectedValueOnce(new Error('connection terminated'))
    const response = await run({ limit: 5 })
    expect(response.status).toBe(503)
    expect(await response.json()).toEqual({ error: 'Сервис файлов временно недоступен' })
  })

  it.each([
    ['cursor отрицательный', { cursor: -1 }],
    ['limit больше 50', { limit: 51 }],
    ['apply не логический', { apply: 'yes' }],
    ['тело — строка', 'apply'],
  ])('%s — 400', async (_, body) => {
    expect((await run(body)).status).toBe(400)
  })
})
