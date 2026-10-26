import { createHash } from 'node:crypto'
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'
import sharp from 'sharp'

import { authSessionHash } from '@/payload/hooks/authSessionRevocations'
import { cleanupStudentAnalytics } from '@/server/student-analytics'
import { cleanupWebVitals, webVitalReportKey } from '@/server/web-vitals'
import type { SiteSetting, User } from '@/payload-types'
import { createStudent, getTestPayload, uid, type TestUser } from '../helpers/payload'

/**
 * Права загрузки аватара по сигнатуре файла, проверка ссылок в настройках сайта
 * и откат фоновых очисток телеметрии при сбое на одном из владельцев.
 */
let payload: Payload
let settings: SiteSetting
const created: number[] = []

const asUser = (user: TestUser): Promise<User> => payload.findByID({ collection: 'users', id: user.id, depth: 0, overrideAccess: true })
const OLD = () => new Date(Date.now() - 91 * 86_400_000).toISOString()

beforeAll(async () => {
  payload = await getTestPayload()
  settings = await payload.findGlobal({ slug: 'site-settings', depth: 0 })
})
afterEach(() => { vi.restoreAllMocks() })
afterAll(async () => {
  await payload.updateGlobal({ slug: 'site-settings', data: { contacts: settings.contacts }, depth: 0 })
  for (const id of created) await payload.delete({ collection: 'media', id })
})

describe('загрузка аватара учеником', () => {
  async function upload(user: TestUser | null, data: Buffer, mimetype: string, extension: string, size = data.length) {
    const doc = await payload.create({
      collection: 'media', overrideAccess: false, ...(user ? { user: await asUser(user) } : {}), data: { alt: 'Аватар' },
      file: { data, mimetype, name: `${uid('avatar')}.${extension}`, size },
    })
    created.push(doc.id)
    return doc
  }
  const uploadedBy = async (user: TestUser) => (await payload.count({ collection: 'media', where: { uploadedBy: { equals: user.id } }, overrideAccess: true })).totalDocs

  it.each([
    ['PNG', 'image/png', 'png', () => sharp({ create: { width: 8, height: 8, channels: 3, background: '#0a0' } }).png().toBuffer()],
    ['JPEG', 'image/jpeg', 'jpg', () => sharp({ create: { width: 8, height: 8, channels: 3, background: '#00a' } }).jpeg().toBuffer()],
    ['GIF', 'image/gif', 'gif', () => sharp({ create: { width: 8, height: 8, channels: 3, background: '#a00' } }).gif().toBuffer()],
    ['WebP', 'image/webp', 'webp', () => sharp({ create: { width: 8, height: 8, channels: 3, background: '#aa0' } }).webp().toBuffer()],
  ])('настоящий %s принимается и записывается на ученика', async (_, mime, extension, make) => {
    const student = await createStudent(payload)
    const doc = await upload(student, await make(), mime, extension)
    expect(doc.mimeType).toBe(mime)
    expect(await uploadedBy(student)).toBe(1)
  })

  it.each([
    ['HTML под видом PNG', Buffer.from('<html><script>alert(document.cookie)</script></html>'), 'image/png', 'png'],
    ['SVG со скриптом', Buffer.from('<svg xmlns="http://www.w3.org/2000/svg"><script>alert(1)</script></svg>'), 'image/svg+xml', 'svg'],
    ['PDF под видом JPEG', Buffer.from('%PDF-1.4\n%âãÏÓ\n1 0 obj'), 'image/jpeg', 'jpg'],
    ['RIFF без WEBP', Buffer.concat([Buffer.from('RIFF'), Buffer.alloc(4), Buffer.from('WAVEfmt ')]), 'image/webp', 'webp'],
    ['обрывок короче 12 байт', Buffer.from([0x89, 0x50, 0x4e, 0x47, 0x0d, 0x0a]), 'image/png', 'png'],
  ])('%s — отказ, файл не сохраняется', async (_, data, mime, extension) => {
    const student = await createStudent(payload)
    await expect(upload(student, data, mime, extension)).rejects.toMatchObject({ status: 403 })
    expect(await uploadedBy(student)).toBe(0)
  })

  it('картинка больше 2 МБ и загрузка гостем — отказ', async () => {
    const student = await createStudent(payload)
    const png = await sharp({ create: { width: 8, height: 8, channels: 3, background: '#000' } }).png().toBuffer()
    const big = Buffer.concat([png, Buffer.alloc(2 * 1024 * 1024)])
    await expect(upload(student, big, 'image/png', 'png')).rejects.toMatchObject({ status: 403 })
    await expect(upload(null, png, 'image/png', 'png')).rejects.toMatchObject({ status: 403 })
    expect(await uploadedBy(student)).toBe(0)
  })

  it('ученик не загружает учебные материалы: PDF и ZIP закрыты', async () => {
    const student = await createStudent(payload)
    await expect(upload(student, Buffer.from('504b05060000000000000000000000000000000000000000', 'hex'), 'application/zip', 'zip')).rejects.toMatchObject({ status: 403 })
    expect(await uploadedBy(student)).toBe(0)
  })
})

describe('ссылки контактов в настройках сайта', () => {
  const save = (url: unknown) => payload.updateGlobal({ slug: 'site-settings', depth: 0, data: { contacts: { ...settings.contacts, links: [{ title: 'Канал', url: url as string }] } } })

  it.each([
    ['javascript:', 'javascript:alert(1)', 'Используйте ссылку http или https без пароля'],
    ['ссылка с паролем', 'https://user:secret@t.me/channel', 'Используйте ссылку http или https без пароля'],
    ['ftp', 'ftp://files.example/channel', 'Используйте ссылку http или https без пароля'],
    ['не ссылка', 'просто текст', 'Введите корректную ссылку'],
  ])('%s — ошибка у поля ссылки, настройки не меняются', async (_, url, message) => {
    const error = await save(url).catch((caught: unknown) => caught)
    expect(error).toMatchObject({ data: { errors: [expect.objectContaining({ message })] } })
    expect((await payload.findGlobal({ slug: 'site-settings', depth: 0 })).contacts?.links ?? []).not.toEqual(expect.arrayContaining([expect.objectContaining({ url })]))
  })

  it('пустая ссылка — просьба ввести ссылку', async () => {
    const error = await payload.updateGlobal({ slug: 'site-settings', depth: 0, data: { contacts: { ...settings.contacts, links: [{ title: 'Канал' } as never] } } }).catch((caught: unknown) => caught)
    expect(error).toMatchObject({ data: { errors: [expect.objectContaining({ message: 'Введите ссылку' })] } })
  })

  it('https и http без учётных данных сохраняются', async () => {
    for (const url of ['https://t.me/mentorcareer', 'http://example.com/path?x=1']) {
      const saved = await save(url)
      expect(saved.contacts?.links?.[0]).toMatchObject({ title: 'Канал', url })
    }
  })
})

describe('журнал назначений доступа неизменяем', () => {
  it('запись аудита нельзя удалить и изменить даже серверным вызовом с overrideAccess', async () => {
    const student = await createStudent(payload)
    const audit = await payload.create({ collection: 'learning-access-audit', overrideAccess: true, data: { actorId: student.id, userId: student.id, targetType: 'lessons', targetId: 1, effect: 'allow', operation: 'create' } })
    await expect(payload.delete({ collection: 'learning-access-audit', id: audit.id, overrideAccess: true })).rejects.toMatchObject({ status: 403 })
    await expect(payload.update({ collection: 'learning-access-audit', id: audit.id, overrideAccess: true, data: { effect: 'deny' } })).rejects.toMatchObject({ status: 403 })
    expect(await payload.findByID({ collection: 'learning-access-audit', id: audit.id, overrideAccess: true })).toMatchObject({ effect: 'allow' })
  })
})

describe('фоновые очистки телеметрии: сбой на одном владельце', () => {
  async function oldReport(user: number) {
    return payload.create({ collection: 'web-vitals-reports', overrideAccess: true, context: { syncWebVitals: true }, data: {
      user, name: 'LCP', value: 1000, reportKey: webVitalReportKey(user, uid('retention'), 'LCP', 'old'), sessionHash: createHash('sha256').update(uid('s')).digest('hex'), routeTemplate: '/', reportedAt: OLD(),
    } })
  }
  const reports = async (user: number) => (await payload.count({ collection: 'web-vitals-reports', where: { user: { equals: user } }, overrideAccess: true })).totalDocs

  it('отчёты Web Vitals: уже очищенный владелец зафиксирован, у сбойного всё на месте', async () => {
    const [first, second] = (await Promise.all([createStudent(payload), createStudent(payload)])).sort((a, b) => a.id - b.id)
    await oldReport(first.id)
    await oldReport(second.id)
    const remove = payload.delete.bind(payload)
    vi.spyOn(payload, 'delete').mockImplementation(((args: { collection: string; where?: { and?: { user?: { equals?: number } }[] } }) =>
      args.collection === 'web-vitals-reports' && args.where?.and?.[0]?.user?.equals === second.id
        ? Promise.reject(new Error('lock timeout'))
        : remove(args as never)) as never)
    await expect(cleanupWebVitals(payload)).rejects.toThrow('lock timeout')
    vi.restoreAllMocks()
    expect(await reports(first.id)).toBe(0)
    expect(await reports(second.id)).toBe(1)
    expect(await cleanupWebVitals(payload)).toBeGreaterThanOrEqual(1)
    expect(await reports(second.id)).toBe(0)
  })

  it('журнал событий ученика: сбой удаления откатывает пакет, старые события остаются', async () => {
    const student = await createStudent(payload)
    await payload.create({ collection: 'student-learning-events', context: { syncStudentAnalytics: true }, data: { user: student.id, eventKey: uid('old-event'), type: 'login', source: 'server', at: OLD() } })
    const remove = payload.delete.bind(payload)
    vi.spyOn(payload, 'delete').mockImplementation(((args: { collection: string }) => args.collection === 'student-learning-events'
      ? Promise.reject(new Error('events delete failed'))
      : remove(args as never)) as never)
    await expect(cleanupStudentAnalytics(payload)).rejects.toThrow('events delete failed')
    vi.restoreAllMocks()
    expect((await payload.count({ collection: 'student-learning-events', where: { user: { equals: student.id } }, overrideAccess: true })).totalDocs).toBe(1)
  })

  it('сессии ученика: сбой удаления истёкших откатывает пакет, следующий запуск их удаляет', async () => {
    const student = await createStudent(payload)
    const session = await payload.create({ collection: 'student-session-telemetry', context: { syncStudentAnalytics: true }, data: {
      user: student.id, sessionHash: authSessionHash(uid('expired')), firstSeenAt: OLD(), lastSeenAt: OLD(), expiresAt: OLD(),
      device: 'Не определено', browser: 'Не определено', os: 'Не определено', geoSource: 'unknown',
    } })
    const remove = payload.delete.bind(payload)
    vi.spyOn(payload, 'delete').mockImplementation(((args: { collection: string }) => args.collection === 'student-session-telemetry'
      ? Promise.reject(new Error('sessions delete failed'))
      : remove(args as never)) as never)
    await expect(cleanupStudentAnalytics(payload)).rejects.toThrow('sessions delete failed')
    vi.restoreAllMocks()
    expect((await payload.findByID({ collection: 'student-session-telemetry', id: session.id, depth: 0, overrideAccess: true })).id).toBe(session.id)
    await cleanupStudentAnalytics(payload)
    await expect(payload.findByID({ collection: 'student-session-telemetry', id: session.id, overrideAccess: true })).rejects.toMatchObject({ status: 404 })
  })
})
