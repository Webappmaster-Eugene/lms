import { beforeAll, describe, expect, it } from 'vitest'
import { createLocalReq, type Payload } from 'payload'

import { getGuideAccess } from '@/server/guide-access'
import { notificationLinkIsVisible } from '@/server/notification-visibility'
import { createAdmin, createStudent, getTestPayload, login, rest, uid, type TestUser } from './helpers/payload'

let payload: Payload
let admin: TestUser
beforeAll(async () => { payload = await getTestPayload(); admin = await createAdmin(payload) })

// Без рассылки: уведомления о гайдах проверяет свой блок, остальным тестам они только мешают.
async function guide(isPublished = true) {
  return payload.create({ collection: 'guides', context: { skipHooks: true }, data: { title: uid('Гайд'), slug: uid('guide'), summary: 'Кратко', markdown: 'Текст', isPublished } })
}
async function grant(userId: number, guideId: number, effect: 'allow' | 'deny' = 'allow', extra: { expiresAt?: string } = {}) {
  return payload.create({ collection: 'learning-access-grants', req: await createLocalReq({ user: admin }, payload), data: { user: userId, target: { relationTo: 'guides', value: guideId }, effect, ruleKey: 'server-generated', ...extra } })
}
async function setGuidesMode(user: TestUser, guidesAccessMode: 'all' | 'assigned') {
  await payload.update({ collection: 'users', id: user.id, data: { guidesAccessMode }, req: await createLocalReq({ user: admin }, payload) })
}
async function visibleIds(token: string, ids: number[]) {
  const response = await rest('GET', `/guides?depth=0&limit=100&where[id][in]=${ids.join(',')}`, { token })
  expect(response.status).toBe(200)
  return (response.json.docs as { id: number }[]).map((doc) => doc.id).sort((a, b) => a - b)
}

describe('выборочный доступ к гайдам', () => {
  it('доступ ко всем курсам не открывает гайды: без назначения ученик не видит ни одного', async () => {
    const student = await createStudent(payload, { learningAccessMode: 'all', trainerAccessMode: 'all', learningCatalogVisibility: 'catalog' })
    const token = await login(payload, student)
    const published = await guide()
    expect(await visibleIds(token, [published.id])).toEqual([])
    expect((await rest('GET', `/guides/${published.id}`, { token })).status).toBe(404)
    expect((await getGuideAccess(payload, student)).hasAccess).toBe(false)
    expect((await rest('GET', `/users/${student.id}`, { token })).json.guidesAccessMode).toBe('assigned')
  })

  it('назначение открывает один гайд; черновик закрыт даже с назначением; истёкшее не действует', async () => {
    const student = await createStudent(payload)
    const token = await login(payload, student)
    const [open, other, draft, expired] = [await guide(), await guide(), await guide(false), await guide()]
    await grant(student.id, open.id)
    await grant(student.id, draft.id)
    await grant(student.id, expired.id, 'allow', { expiresAt: '2026-01-01T00:00:00.000Z' })
    expect(await visibleIds(token, [open.id, other.id, draft.id, expired.id])).toEqual([open.id])
    expect((await rest('GET', `/guides/${draft.id}`, { token })).status).toBe(404)
  })

  it('режим «все гайды» открывает опубликованные, запрет закрывает отдельный; смену видно в аудите', async () => {
    const student = await createStudent(payload)
    const token = await login(payload, student)
    const [first, second] = [await guide(), await guide()]
    await setGuidesMode(student, 'all')
    expect(await visibleIds(token, [first.id, second.id])).toEqual([first.id, second.id].sort((a, b) => a - b))
    await grant(student.id, second.id, 'deny')
    expect(await visibleIds(token, [first.id, second.id])).toEqual([first.id])
    const policy = await payload.find({ collection: 'learning-access-policies', where: { user: { equals: student.id } }, limit: 1, depth: 0 })
    expect(policy.docs[0]?.guidesMode).toBe('all')
    const audit = await payload.find({ collection: 'learning-access-audit', where: { and: [{ userId: { equals: student.id } }, { targetType: { equals: 'users.guidesAccessMode' } }] }, limit: 1, depth: 0 })
    expect(audit.docs[0]).toMatchObject({ actorId: admin.id, effect: 'allow', current: { guidesAccessMode: 'all' } })
  })

  it('ученик не открывает себе гайды правкой своего профиля', async () => {
    const student = await createStudent(payload)
    const token = await login(payload, student)
    const published = await guide()
    const response = await rest('PATCH', `/users/${student.id}`, { token, body: { guidesAccessMode: 'all', bio: 'обновлено' } })
    expect(response.status).toBe(200)
    expect(await visibleIds(token, [published.id])).toEqual([])
    const policy = await payload.find({ collection: 'learning-access-policies', where: { user: { equals: student.id } }, limit: 1, depth: 0 })
    expect(policy.docs[0]?.guidesMode ?? 'assigned').toBe('assigned')
  })

  it('удаление гайда удаляет назначения на него', async () => {
    const student = await createStudent(payload)
    const removed = await guide()
    await grant(student.id, removed.id)
    await payload.delete({ collection: 'guides', id: removed.id, req: await createLocalReq({ user: admin }, payload) })
    const left = await payload.find({ collection: 'learning-access-grants', where: { user: { equals: student.id } }, depth: 0 })
    expect(left.totalDocs).toBe(0)
  })

  it('администратор видит все гайды, включая черновики', async () => {
    const token = await login(payload, admin)
    const [published, draft] = [await guide(), await guide(false)]
    expect(await visibleIds(token, [published.id, draft.id])).toEqual([published.id, draft.id].sort((a, b) => a - b))
  })
})

describe('гайд в Markdown', () => {
  it('файл целиком: шапка раскладывается по полям, в тексте остаётся Markdown, минуты и срок пересмотра считает сервер', async () => {
    const slug = uid('md-guide')
    const words = Array.from({ length: 480 }, (_, i) => `слово${i}`).join(' ')
    const markdown = `---\ntitle: Гайд из файла\nsummary: Описание из шапки\nslug: ${slug}\norder: 4\npublished: false\ncategory: ai\nreviewed: 2026-10-22\n---\n\nВступление.\n\n## Раздел\n\n${words}\n`
    const created = await payload.create({ collection: 'guides', data: { markdown } as never, req: await createLocalReq({ user: admin }, payload) })
    expect(created).toMatchObject({
      title: 'Гайд из файла', summary: 'Описание из шапки', slug, order: 4, isPublished: false,
      reviewedAt: '2026-10-22T12:00:00.000Z', reviewBy: '2027-01-20T12:00:00.000Z', readingMinutes: 3,
    })
    // category из шапки («ai») разложился в связь: сервер нашёл категорию по slug.
    const aiCategory = (await payload.find({ collection: 'guide-categories', where: { slug: { equals: 'ai' } }, limit: 1, depth: 0 })).docs[0]
    expect(aiCategory).toBeTruthy()
    expect(typeof created.category === 'object' && created.category ? created.category.id : created.category).toBe(aiCategory.id)
    expect(created.markdown?.startsWith('Вступление.\n\n## Раздел')).toBe(true)
    expect(created.announcedAt ?? null).toBeNull()
  })

  it('повторная загрузка файла без slug меняет текст, но не адрес гайда; минуты пересчитываются только от текста', async () => {
    const existing = await payload.create({ collection: 'guides', data: { title: 'Старое название', slug: uid('keep'), summary: 'Кратко', markdown: 'Старый текст' } })
    expect(existing.readingMinutes).toBe(1)
    const long = Array.from({ length: 800 }, (_, i) => `слово${i}`).join(' ')
    const updated = await payload.update({ collection: 'guides', id: existing.id, data: { markdown: `---\ntitle: Новое название\n---\n${long}` }, req: await createLocalReq({ user: admin }, payload) })
    expect(updated).toMatchObject({ title: 'Новое название', slug: existing.slug, readingMinutes: 5 })
    const renamed = await payload.update({ collection: 'guides', id: existing.id, data: { title: 'Ещё название' } })
    expect(renamed.readingMinutes).toBe(5)
  })

  it('новая дата проверки без срока сбрасывает старый срок', async () => {
    const created = await payload.create({ collection: 'guides', data: { title: uid('Гайд'), slug: uid('review'), summary: 'Кратко', markdown: '---\nreviewed: 2026-01-10\nreview_by: 2026-02-01\n---\nТекст' } as never })
    expect(created.reviewBy).toBe('2026-02-01T12:00:00.000Z')
    const updated = await payload.update({ collection: 'guides', id: created.id, data: { markdown: '---\nreviewed: 2026-10-22\n---\nТекст' } })
    expect(updated).toMatchObject({ reviewedAt: '2026-10-22T12:00:00.000Z', reviewBy: '2027-01-20T12:00:00.000Z' })
  })

  it('пустой текст и непонятная шапка не сохраняются — с понятной ошибкой у поля текста', async () => {
    const empty = await payload.create({ collection: 'guides', data: { title: uid('Пустой'), slug: uid('empty'), summary: 'Кратко', markdown: '  ' } }).catch((reason: unknown) => reason)
    expect(empty).toMatchObject({ data: { errors: [expect.objectContaining({ path: 'markdown', message: 'Добавьте текст гайда' })] } })
    const header = await payload.create({ collection: 'guides', data: { title: uid('Гайд'), slug: uid('bad'), summary: 'Кратко', markdown: '---\ncategory: финансы\n---\nТекст' } }).catch((reason: unknown) => reason)
    expect(header).toMatchObject({ data: { errors: [expect.objectContaining({ path: 'markdown', message: expect.stringContaining('category: «финансы» — такой категории нет') })] } })
  })
})

describe('версии гайда', () => {
  it('каждое сохранение пишет версию, к ней можно откатиться', async () => {
    const created = await payload.create({ collection: 'guides', data: { title: uid('Гайд'), slug: uid('versions'), summary: 'Кратко', markdown: 'Первый текст' } })
    await payload.update({ collection: 'guides', id: created.id, data: { markdown: 'Ошибочно перезалитый текст' } })
    const versions = await payload.findVersions({ collection: 'guides', where: { parent: { equals: created.id } }, sort: 'createdAt', depth: 0 })
    expect(versions.docs.map((version) => version.version.markdown)).toEqual(['Первый текст', 'Ошибочно перезалитый текст'])
    const restored = await payload.restoreVersion({ collection: 'guides', id: versions.docs[0].id, depth: 0 })
    expect(restored.markdown).toBe('Первый текст')
  })

  it('версии читает только администратор: в них черновики и закрытые гайды', async () => {
    const student = await createStudent(payload)
    const open = await guide()
    await grant(student.id, open.id)
    await payload.update({ collection: 'guides', id: open.id, data: { markdown: 'Правка' } })
    const studentToken = await login(payload, student)
    expect((await rest('GET', `/guides/versions?where[parent][equals]=${open.id}`, { token: studentToken })).status).toBe(403)
    const adminVersions = await rest('GET', `/guides/versions?where[parent][equals]=${open.id}`, { token: await login(payload, admin) })
    expect(adminVersions.status).toBe(200)
    expect(adminVersions.json.totalDocs).toBeGreaterThan(0)
  })
})

describe('уведомления о гайдах', () => {
  async function notes(userId: number) {
    const result = await payload.find({ collection: 'notifications', where: { user: { equals: userId } }, sort: 'id', depth: 0 })
    return result.docs.map((note) => ({ title: note.title, link: note.link }))
  }
  async function draft() {
    return payload.create({ collection: 'guides', data: { title: uid('Гайд'), slug: uid('announce'), summary: 'Кратко', markdown: 'Текст', isPublished: false } })
  }
  async function publish(id: number) {
    return payload.update({ collection: 'guides', id, data: { isPublished: true }, req: await createLocalReq({ user: admin }, payload) })
  }

  it('первая публикация — уведомление тем, кому гайд открыт; повторная публикация не рассылает заново', async () => {
    const [everything, assigned, denied, closed] = [await createStudent(payload), await createStudent(payload), await createStudent(payload), await createStudent(payload)]
    await setGuidesMode(everything, 'all')
    await setGuidesMode(denied, 'all')
    const item = await draft()
    await grant(assigned.id, item.id)
    await grant(denied.id, item.id, 'deny')
    const published = await publish(item.id)
    expect(published.announcedAt).toBeTruthy()
    const expected = [{ title: 'Новый гайд', link: `/guides/${item.slug}` }]
    expect(await notes(everything.id)).toEqual(expect.arrayContaining(expected))
    expect(await notes(assigned.id)).toEqual(expected)
    expect(await notes(denied.id)).not.toEqual(expect.arrayContaining(expected))
    expect(await notes(closed.id)).toEqual([])
    expect(await notes(admin.id)).not.toEqual(expect.arrayContaining(expected))

    await payload.update({ collection: 'guides', id: item.id, data: { isPublished: false } })
    await publish(item.id)
    expect(await notes(assigned.id)).toEqual(expected)
  })

  it('публикация из CMS (REST администратора) тоже рассылает, а дату первой публикации подделать нельзя', async () => {
    const student = await createStudent(payload)
    const item = await draft()
    await grant(student.id, item.id)
    const token = await login(payload, admin)
    expect((await rest('PATCH', `/guides/${item.id}`, { token, body: { announcedAt: '2020-01-01T00:00:00.000Z' } })).status).toBe(200)
    expect((await payload.findByID({ collection: 'guides', id: item.id, depth: 0 })).announcedAt ?? null).toBeNull()
    expect((await rest('PATCH', `/guides/${item.id}`, { token, body: { isPublished: true } })).status).toBe(200)
    const published = await payload.findByID({ collection: 'guides', id: item.id, depth: 0 })
    expect(Date.parse(published.announcedAt ?? '')).toBeGreaterThan(Date.now() - 60_000)
    expect(await notes(student.id)).toEqual([{ title: 'Новый гайд', link: `/guides/${item.slug}` }])
  })

  it('назначение опубликованного гайда — «Вам открыт гайд», если раньше он был закрыт', async () => {
    const [student, everything] = [await createStudent(payload), await createStudent(payload)]
    await setGuidesMode(everything, 'all')
    const item = await draft()
    await publish(item.id)
    const before = (await notes(everything.id)).length
    await grant(student.id, item.id)
    await grant(everything.id, item.id)
    expect(await notes(student.id)).toEqual([{ title: 'Вам открыт гайд', link: `/guides/${item.slug}` }])
    // Режим «все гайды» уже открывал его — второго уведомления нет.
    expect(await notes(everything.id)).toHaveLength(before)
  })

  it('назначение черновика молчит до публикации; отложенное назначение не уведомляет заранее', async () => {
    const [student, later] = [await createStudent(payload), await createStudent(payload)]
    const item = await draft()
    await grant(student.id, item.id)
    expect(await notes(student.id)).toEqual([])
    await publish(item.id)
    expect(await notes(student.id)).toEqual([{ title: 'Новый гайд', link: `/guides/${item.slug}` }])
    await payload.create({ collection: 'learning-access-grants', req: await createLocalReq({ user: admin }, payload), data: { user: later.id, target: { relationTo: 'guides', value: item.id }, effect: 'allow', startsAt: '2099-01-01T00:00:00.000Z', ruleKey: 'server-generated' } })
    expect(await notes(later.id)).toEqual([])
  })

  it('включённый режим «все гайды» — одно уведомление со ссылкой на раздел', async () => {
    const student = await createStudent(payload)
    await guide()
    await setGuidesMode(student, 'all')
    expect(await notes(student.id)).toEqual([{ title: 'Вам открыты все гайды', link: '/guides' }])
    await setGuidesMode(student, 'all')
    expect(await notes(student.id)).toHaveLength(1)
  })

  it('уведомление о гайде скрывается, когда доступ к нему закрыли', async () => {
    const student = await createStudent(payload)
    const item = await guide()
    const allow = await grant(student.id, item.id)
    expect(await notificationLinkIsVisible(payload, student.id, `/guides/${item.slug}`)).toBe(true)
    await payload.delete({ collection: 'learning-access-grants', id: allow.id, req: await createLocalReq({ user: admin }, payload) })
    expect(await notificationLinkIsVisible(payload, student.id, `/guides/${item.slug}`)).toBe(false)
    expect(await notificationLinkIsVisible(payload, student.id, '/guides')).toBe(true)
  })
})

describe('прочтения и отзывы о гайдах', () => {
  type ReadDoc = { id: number; user: number; helpful: string | null; comment: string | null; feedbackAt?: string | null }
  const readDoc = (response: { json: { doc?: unknown } }) => response.json.doc as ReadDoc

  it('ученик отмечает прочтение выданного гайда и оставляет отзыв; закрытый гайд — 403, дубль — 400', async () => {
    const student = await createStudent(payload)
    const token = await login(payload, student)
    const [open, closed] = [await guide(), await guide()]
    await grant(student.id, open.id)
    const created = await rest('POST', '/guide-reads?depth=0', { token, body: { guide: open.id } })
    expect(created.status).toBe(201)
    expect(readDoc(created)).toMatchObject({ user: student.id, helpful: null })
    expect(readDoc(created).feedbackAt ?? null).toBeNull()
    expect((await rest('POST', '/guide-reads?depth=0', { token, body: { guide: open.id } })).status).toBe(400)
    expect((await rest('POST', '/guide-reads?depth=0', { token, body: { guide: closed.id } })).status).toBe(403)

    const id = readDoc(created).id
    const voted = await rest('PATCH', `/guide-reads/${id}?depth=0`, { token, body: { helpful: 'no', comment: '  Где взять прокси?  ', feedbackAt: '2000-01-01T00:00:00.000Z' } })
    expect(voted.status).toBe(200)
    expect(readDoc(voted)).toMatchObject({ helpful: 'no', comment: 'Где взять прокси?' })
    expect(Date.parse(readDoc(voted).feedbackAt ?? '')).toBeGreaterThan(Date.now() - 60_000)
  })

  it('чужие отзывы не видны и не правятся; отзыв не переносится на другой гайд и не пишется на чужое имя', async () => {
    const [author, other] = [await createStudent(payload), await createStudent(payload)]
    const [first, second] = [await guide(), await guide()]
    for (const user of [author, other]) for (const item of [first, second]) await grant(user.id, item.id)
    const authorToken = await login(payload, author)
    const otherToken = await login(payload, other)
    const created = await rest('POST', '/guide-reads?depth=0', { token: authorToken, body: { guide: first.id, user: other.id, helpful: 'yes' } })
    expect(readDoc(created)).toMatchObject({ user: author.id, helpful: 'yes' })
    const id = readDoc(created).id
    expect((await rest('GET', '/guide-reads?depth=0', { token: otherToken })).json.docs).toEqual([])
    expect((await rest('PATCH', `/guide-reads/${id}?depth=0`, { token: otherToken, body: { helpful: 'no' } })).status).toBe(403)
    expect((await payload.findByID({ collection: 'guide-reads', id, depth: 0 })).helpful).toBe('yes')
    expect((await rest('PATCH', `/guide-reads/${id}?depth=0`, { token: authorToken, body: { guide: second.id } })).status).toBe(400)
    expect((await rest('DELETE', `/guide-reads/${id}`, { token: authorToken })).status).toBe(403)
  })

  it('после закрытия гайда своя запись и закладка не дают прочитать его текст фильтром по связи', async () => {
    const student = await createStudent(payload)
    const token = await login(payload, student)
    const item = await payload.create({ collection: 'guides', context: { skipHooks: true }, data: { title: uid('Гайд'), slug: uid('oracle'), summary: 'Кратко', markdown: 'СЕКРЕТНЫЙ-ТЕКСТ', isPublished: true } })
    const allow = await grant(student.id, item.id)
    expect((await rest('POST', '/guide-reads?depth=0', { token, body: { guide: item.id } })).status).toBe(201)
    expect((await rest('POST', '/bookmarks?depth=0', { token, body: { guide: item.id } })).status).toBe(201)
    const probe = `where[guide.markdown][contains]=${encodeURIComponent('СЕКРЕТНЫЙ')}&depth=0`
    expect((await rest('GET', `/guide-reads?${probe}`, { token })).json.totalDocs).toBe(1)

    await payload.delete({ collection: 'learning-access-grants', id: allow.id, req: await createLocalReq({ user: admin }, payload) })
    for (const collection of ['guide-reads', 'bookmarks']) {
      expect((await rest('GET', `/${collection}?${probe}`, { token })).json.totalDocs).toBe(0)
      const patch = await rest('PATCH', `/${collection}?${probe}`, { token, body: {} })
      expect(patch.json).toMatchObject({ docs: [], errors: [] })
      const removed = await rest('DELETE', `/${collection}?${probe}`, { token })
      expect(removed.json.docs ?? []).toEqual([])
    }
    // Запись цела: вернут доступ — вернётся и отзыв.
    expect((await payload.count({ collection: 'guide-reads', where: { user: { equals: student.id } } })).totalDocs).toBe(1)
  })

  it('удаление гайда удаляет прочтения и отзывы о нём', async () => {
    const student = await createStudent(payload)
    const removed = await guide()
    await grant(student.id, removed.id)
    expect((await rest('POST', '/guide-reads?depth=0', { token: await login(payload, student), body: { guide: removed.id } })).status).toBe(201)
    await payload.delete({ collection: 'guides', id: removed.id, req: await createLocalReq({ user: admin }, payload) })
    expect((await payload.count({ collection: 'guide-reads', where: { user: { equals: student.id } } })).totalDocs).toBe(0)
  })
})

describe('картинки гайда из медиатеки', () => {
  it('картинку видит тот, кому открыт гайд, и не видит остальной ученик', async () => {
    const [reader, outsider] = [await createStudent(payload), await createStudent(payload)]
    const bytes = Buffer.from('89504e470d0a1a0a0000000d49484452000000010000000108060000001f15c4890000000d49444154789c636000000000050001a5f645400000000049454e44ae426082', 'hex')
    const image = await payload.create({ collection: 'media', data: { alt: 'Шаг' }, file: { data: bytes, mimetype: 'image/png', name: `${uid('step')}.png`, size: bytes.length } })
    const item = await payload.create({ collection: 'guides', context: { skipHooks: true }, data: { title: uid('Гайд'), slug: uid('image'), summary: 'Кратко', markdown: `Шаг:\n\n![Шаг](/api/media/file/${image.filename})`, isPublished: true } })
    await grant(reader.id, item.id)
    const seen = async (user: TestUser) => (await payload.find({ collection: 'media', where: { id: { equals: image.id } }, overrideAccess: false, user, depth: 0 })).totalDocs
    expect(await seen(reader)).toBe(1)
    expect(await seen(outsider)).toBe(0)
  })
})

describe('закладки на гайды', () => {
  async function bookmark(token: string, guideId: number) {
    return rest('POST', '/bookmarks', { token, body: { guide: guideId } })
  }
  async function savedGuideIds(token: string) {
    const response = await rest('GET', '/bookmarks?depth=0&limit=100', { token })
    expect(response.status).toBe(200)
    return (response.json.docs as { guide?: number | null }[]).flatMap((doc) => (doc.guide ? [doc.guide] : []))
  }

  it('ученик сохраняет выданный гайд, а закрытый — нет', async () => {
    const student = await createStudent(payload)
    const token = await login(payload, student)
    const [open, closed] = [await guide(), await guide()]
    await grant(student.id, open.id)
    expect((await bookmark(token, open.id)).status).toBe(201)
    expect((await bookmark(token, closed.id)).status).toBe(403)
    expect(await savedGuideIds(token)).toEqual([open.id])
  })

  it('повторное сохранение того же гайда не создаёт дубль', async () => {
    const student = await createStudent(payload)
    const token = await login(payload, student)
    const open = await guide()
    await grant(student.id, open.id)
    expect((await bookmark(token, open.id)).status).toBe(201)
    expect((await bookmark(token, open.id)).status).toBe(400)
    expect(await savedGuideIds(token)).toEqual([open.id])
  })

  it('закрытый доступ прячет закладку, снова выданный — возвращает', async () => {
    const student = await createStudent(payload)
    const token = await login(payload, student)
    const open = await guide()
    const allow = await grant(student.id, open.id)
    expect((await bookmark(token, open.id)).status).toBe(201)
    await payload.delete({ collection: 'learning-access-grants', id: allow.id, req: await createLocalReq({ user: admin }, payload) })
    expect(await savedGuideIds(token)).toEqual([])
    await grant(student.id, open.id)
    expect(await savedGuideIds(token)).toEqual([open.id])
  })

  it('закладка не переносится на другой гайд и не ведёт сразу на урок и гайд', async () => {
    const student = await createStudent(payload)
    const token = await login(payload, student)
    const [first, second] = [await guide(), await guide()]
    await grant(student.id, first.id)
    await grant(student.id, second.id)
    const created = await bookmark(token, first.id)
    const id = (created.json.doc as { id: number }).id
    expect((await rest('PATCH', `/bookmarks/${id}`, { token, body: { guide: second.id } })).status).toBe(400)
    expect((await rest('POST', '/bookmarks', { token, body: { guide: first.id, task: 1 } })).status).toBe(400)
  })

  it('удаление гайда удаляет закладки на него', async () => {
    const student = await createStudent(payload)
    const token = await login(payload, student)
    const removed = await guide()
    await grant(student.id, removed.id)
    expect((await bookmark(token, removed.id)).status).toBe(201)
    await payload.delete({ collection: 'guides', id: removed.id, req: await createLocalReq({ user: admin }, payload) })
    const left = await payload.find({ collection: 'bookmarks', where: { user: { equals: student.id } }, depth: 0 })
    expect(left.totalDocs).toBe(0)
  })
})
