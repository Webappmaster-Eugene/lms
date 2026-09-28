import { beforeAll, describe, expect, it } from 'vitest'
import type { CollectionSlug, Field, Payload } from 'payload'

import type { Course, Lesson, Roadmap } from '@/payload-types'

import { getTestPayload, uid } from '../helpers/payload'
import { buildFixtureContext, INTERNAL_COLLECTIONS, makeValid, VALID, type Data, type FixtureContext } from '../helpers/fixtures'

/**
 * Схема каждой коллекции проверяется по её собственному конфигу: обязательные
 * поля, уникальность, варианты select, ограничения длины и диапазона, дефолты,
 * существование связанных документов. Новая коллекция без фабрики валидных
 * данных роняет первый тест — добавить её в VALID обязательно.
 */
let payload: Payload
let ctx: FixtureContext

/** Media проверяется отдельным блоком: ей нужен файл. */
const SKIP_COLLECTIONS = new Set(['media'])

type NamedField = Field & { name: string; required?: boolean; unique?: boolean; defaultValue?: unknown; hidden?: boolean }

function topLevelFields(slug: string): NamedField[] {
  const fields = payload.collections[slug as CollectionSlug].config.fields as Field[]
  return fields.filter(
    (f): f is NamedField =>
      'name' in f && f.type !== 'ui' && !(f as NamedField).hidden && !['createdAt', 'updatedAt', 'id'].includes(f.name),
  )
}

async function makeValidDoc(slug: string): Promise<Data> {
  return makeValid(payload, slug, ctx)
}

async function createAs<T extends object = Data & { id: number }>(slug: string, data: Data): Promise<T> {
  const doc = await payload.create({ collection: slug as CollectionSlug, data: data as never, context: { skipHooks: true } })
  return doc as unknown as T
}

/** Ошибки валидации Payload: `ValidationError.data.errors[].path`. */
async function validationPaths(promise: Promise<unknown>): Promise<string[]> {
  try {
    await promise
  } catch (error) {
    const errors = (error as { data?: { errors?: { path: string }[] } }).data?.errors
    if (errors) return errors.map((e) => e.path)
    return [`<${(error as Error).message}>`]
  }
  return []
}

beforeAll(async () => {
  payload = await getTestPayload()
  ctx = await buildFixtureContext(payload)
})

describe('покрытие коллекций', () => {
  it('у каждой коллекции конфига есть фабрика валидных данных', () => {
    const slugs = payload.config.collections.map((c) => c.slug).filter((s) => !INTERNAL_COLLECTIONS.has(s) && !SKIP_COLLECTIONS.has(s))
    expect(slugs.filter((s) => !VALID[s])).toEqual([])
    expect(slugs.length).toBe(22)
  })

  it('локализация не включена — у полей нет localized-вариантов', () => {
    expect(payload.config.localization).toBeFalsy()
  })
})

describe.each(Object.keys(VALID))('коллекция %s', (slug) => {
  it('валидный документ создаётся и читается обратно', async () => {
    const doc = await createAs(slug, await makeValidDoc(slug))
    const read = await payload.findByID({ collection: slug as CollectionSlug, id: doc.id, depth: 0 })
    expect(read.id).toBe(doc.id)
  })

  it('каждое обязательное поле без дефолта отвергается при отсутствии', async () => {
    // slug заполняет хук generateSlug из title — его обязательность проверена отдельно.
    const required = topLevelFields(slug).filter((f) => f.required && f.defaultValue === undefined && f.name !== 'slug')
    for (const field of required) {
      const data = await makeValidDoc(slug)
      delete data[field.name]
      const paths = await validationPaths(createAs(slug, data))
      // Slug генерируется хуком из title — без title пропадают оба поля.
      expect(paths, `${slug}.${field.name}`).toContain(field.name)
    }
  })

  it('обязательные поля с дефолтом получают дефолт, остальные дефолты тоже применяются', async () => {
    const withDefault = topLevelFields(slug).filter(
      (f) => f.defaultValue !== undefined && typeof f.defaultValue !== 'function',
    )
    const data = await makeValidDoc(slug)
    for (const field of withDefault) delete data[field.name]
    const doc = (await createAs(slug, data)) as unknown as Data
    for (const field of withDefault) {
      expect(doc[field.name], `${slug}.${field.name}`).toEqual(field.defaultValue)
    }
  })

  it('уникальные поля не допускают дубликатов', async () => {
    const unique = topLevelFields(slug).filter((f) => f.unique)
    for (const field of unique) {
      const first = await makeValidDoc(slug)
      const doc = (await createAs(slug, first)) as unknown as Data
      const second = await makeValidDoc(slug)
      second[field.name] = doc[field.name] && typeof doc[field.name] === 'object'
        ? (doc[field.name] as { id: number }).id
        : doc[field.name]
      const paths = await validationPaths(createAs(slug, second))
      expect(paths.length, `${slug}.${field.name}: дубликат принят`).toBeGreaterThan(0)
    }
  })

  it('select принимает только значения из списка', async () => {
    const selects = topLevelFields(slug).filter((f) => f.type === 'select')
    for (const field of selects) {
      const data = await makeValidDoc(slug)
      data[field.name] = (field as { hasMany?: boolean }).hasMany ? ['__нет_такого__'] : '__нет_такого__'
      expect(await validationPaths(createAs(slug, data)), `${slug}.${field.name}`).toContain(field.name)
    }
  })

  it('ограничения maxLength и min/max соблюдаются', async () => {
    for (const field of topLevelFields(slug)) {
      const f = field as NamedField & { maxLength?: number; min?: number; max?: number }
      if ((f.type === 'text' || f.type === 'textarea') && f.maxLength) {
        const data = await makeValidDoc(slug)
        data[f.name] = 'я'.repeat(f.maxLength + 1)
        expect(await validationPaths(createAs(slug, data)), `${slug}.${f.name} maxLength`).toContain(f.name)
      }
      if (f.type === 'number' && typeof f.min === 'number') {
        const data = await makeValidDoc(slug)
        data[f.name] = f.min - 1
        expect(await validationPaths(createAs(slug, data)), `${slug}.${f.name} min`).toContain(f.name)
      }
      if (f.type === 'number' && typeof f.max === 'number') {
        const data = await makeValidDoc(slug)
        data[f.name] = f.max + 1
        expect(await validationPaths(createAs(slug, data)), `${slug}.${f.name} max`).toContain(f.name)
      }
    }
  })

  it('связь с несуществующим документом отвергается', async () => {
    const relations = topLevelFields(slug).filter(
      (f) => (f.type === 'relationship' || f.type === 'upload') && typeof (f as { relationTo?: unknown }).relationTo === 'string',
    )
    for (const field of relations) {
      const data = await makeValidDoc(slug)
      data[field.name] = (field as { hasMany?: boolean }).hasMany ? [987654321] : 987654321
      const paths = await validationPaths(createAs(slug, data))
      expect(paths.length, `${slug}.${field.name}: висячая ссылка принята`).toBeGreaterThan(0)
    }
  })
})

describe('частные правила полей', () => {
  it('generateSlug транслитерирует кириллицу и не трогает заданный вручную slug', async () => {
    const key = Date.now().toString(36)
    const auto = await createAs<Course>('courses', { title: `Щука и ёж: JS 101 ${key}`, roadmap: ctx.roadmapId })
    expect(auto.slug).toBe(`shchuka-i-yozh-js-101-${key}`)
    const manual = await createAs<Course>('courses', { title: 'Любой', slug: `manual-${key}`, roadmap: ctx.roadmapId })
    expect(manual.slug).toBe(`manual-${key}`)
  })

  it('смена title не меняет slug ни при полной, ни при частичной правке — публичный URL стабилен', async () => {
    const key = Date.now().toString(36)
    const doc = await createAs<Lesson>('lessons', { title: `Старый ${key}`, course: ctx.courseId })
    const full = await payload.update({ collection: 'lessons', id: doc.id, data: { title: `Новый ${key}`, slug: doc.slug } })
    expect(full.slug).toBe(doc.slug)
    const partial = await payload.update({ collection: 'lessons', id: doc.id, data: { title: `Совсем новый ${key}` } })
    expect(partial.slug).toBe(doc.slug)
  })

  it.each([
    ['https://miro.com/app/live-embed/uXjVJ=/', true],
    ['https://miro.com/app/embed/uXjVJ=/', true],
    ['', true],
    ['https://miro.com/app/board/uXjVJ=/', false],
    ['http://miro.com/app/live-embed/x/', false],
    ['https://evil.example/app/live-embed/x/', false],
    ['не ссылка', false],
  ])('Roadmaps.miroEmbedUrl «%s» → валиден: %s', async (url, ok) => {
    const paths = await validationPaths(
      createAs('roadmaps', { title: `Miro ${uid()}`, miroEmbedUrl: url }),
    )
    expect(paths.includes('miroEmbedUrl')).toBe(!ok)
  })

  it('Roadmaps.description: строка превращается в Lexical-документ, мусор — в null', async () => {
    const fromString = await createAs<Roadmap>('roadmaps', { title: `Lexical ${uid()}`, description: 'Просто текст' })
    expect(fromString.description?.root.type).toBe('root')
    expect(JSON.stringify(fromString.description)).toContain('Просто текст')

    const fromNumber = await createAs<Roadmap>('roadmaps', { title: `Lexical ${uid()}`, description: 42 })
    expect(fromNumber.description ?? null).toBeNull()
  })

  it('Roadmaps.description: скаляр, записанный в БД в обход приложения, лечится при чтении', async () => {
    const doc = await createAs<Roadmap>('roadmaps', { title: `Legacy ${uid()}` })
    const adapter = payload.db as unknown as { drizzle: unknown; execute: (a: { drizzle: unknown; raw: string }) => Promise<unknown> }
    await adapter.execute({ drizzle: adapter.drizzle, raw: `update roadmaps set description = '"сырой текст"'::jsonb where id = ${doc.id}` })
    const read = await payload.findByID({ collection: 'roadmaps', id: doc.id })
    expect(read.description?.root.type).toBe('root')
    expect(JSON.stringify(read.description)).toContain('сырой текст')
  })

  it('TrainerTasks: вложенные обязательные поля табличных тестов проверяются с путём строки', async () => {
    // В режиме stdout поле testCases скрыто условием, и Payload его не валидирует.
    const paths = await validationPaths(
      createAs('trainer-tasks', {
        title: `Кейсы ${uid()}`, topic: ctx.topicId, starterCode: '//', checkMode: 'unit',
        testCases: [{ argsCode: '1', compare: 'deep' }],
      }),
    )
    expect(paths).toEqual(expect.arrayContaining(['testCases.0.name', 'testCases.0.expectedCode']))
  })

  it('TrainerTasks: новая задача по умолчанию черновик в режиме stdout на JS за 10 баллов', async () => {
    const task = await createAs('trainer-tasks', { title: `Дефолты ${uid()}`, topic: ctx.topicId, starterCode: '//' })
    expect(task).toMatchObject({ isPublished: false, checkMode: 'stdout', languages: ['js'], pointsReward: 10, timeLimitMs: 5000, difficulty: 'easy' })
  })

  it('RoadmapNodes.bullets: не больше 20 пунктов', async () => {
    const bullets = Array.from({ length: 21 }, (_, i) => ({ text: `пункт ${i}` }))
    const paths = await validationPaths(
      createAs('roadmap-nodes', { nodeId: uid('b'), label: 'Узел', roadmap: ctx.roadmapId, bullets }),
    )
    expect(paths).toContain('bullets')
  })

  it('Lessons: блок Miro требует заголовок и ссылку, высота по умолчанию 600', async () => {
    const bad = await validationPaths(
      createAs('lessons', { title: `Блоки ${uid()}`, course: ctx.courseId, content: [{ blockType: 'miro' }] }),
    )
    expect(bad).toEqual(expect.arrayContaining(['content.0.title', 'content.0.embedUrl']))

    const ok = await createAs<Lesson>('lessons', {
      title: `Блоки ${uid()}`, course: ctx.courseId,
      content: [{ blockType: 'miro', title: 'Доска', embedUrl: 'https://miro.com/app/live-embed/x/' }],
    })
    expect((ok.content?.[0] as { height?: number }).height).toBe(600)
  })

  it('Users: email уникален без учёта регистра, пароль не возвращается', async () => {
    const email = `${uid('case')}@lms.test`
    const user = await payload.create({
      collection: 'users',
      data: { email, password: 'Case-Pass-1', firstName: 'А', lastName: 'Б', role: 'student' },
      context: { skipHooks: true },
    })
    expect(user).not.toHaveProperty('password')
    expect(user).not.toHaveProperty('hash')
    const paths = await validationPaths(
      payload.create({
        collection: 'users',
        data: { email: email.toUpperCase(), password: 'Case-Pass-1', firstName: 'А', lastName: 'Б', role: 'student' },
        context: { skipHooks: true },
      }),
    )
    expect(paths).toContain('email')
  })
})

describe('Media (upload)', () => {
  // 1×1 PNG: достаточно, чтобы sharp построил миниатюры.
  const PNG = Buffer.from(
    'iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNk+M9QDwADhgGAWjR9awAAAABJRU5ErkJggg==',
    'base64',
  )

  it('картинка загружается, получает размеры thumbnail и card, файл удаляется вместе с документом', async () => {
    const doc = await payload.create({
      collection: 'media',
      data: { alt: 'Пиксель' },
      file: { data: PNG, mimetype: 'image/png', name: `${uid('px')}.png`, size: PNG.length },
    })
    expect(doc.mimeType).toBe('image/png')
    expect(doc.url).toMatch(/^\/api\/media\/file\//)
    expect(Object.keys(doc.sizes ?? {})).toEqual(expect.arrayContaining(['thumbnail', 'card']))
    await payload.delete({ collection: 'media', id: doc.id })
    await expect(payload.findByID({ collection: 'media', id: doc.id })).rejects.toThrow()
  })

  it('недопустимый MIME-тип отвергается', async () => {
    const text = Buffer.from('#!/bin/sh\necho pwned\n')
    await expect(
      payload.create({
        collection: 'media',
        data: { alt: 'скрипт' },
        file: { data: text, mimetype: 'text/x-shellscript', name: `${uid('sh')}.sh`, size: text.length },
      }),
    ).rejects.toThrow()
  })
})

describe('глобал site-settings', () => {
  it('на чистой базе отдаёт дефолты баллов и название платформы', async () => {
    const settings = await payload.findGlobal({ slug: 'site-settings' })
    expect(settings.platformName).toBe('MentorCareer LMS')
    expect(settings.points).toMatchObject({ lessonCompleted: 10, courseCompleted: 50, roadmapCompleted: 200, trainerTaskCompleted: 10 })
  })

  it('обязательное название платформы нельзя стереть', async () => {
    const paths = await validationPaths(payload.updateGlobal({ slug: 'site-settings', data: { platformName: '' } }))
    expect(paths).toContain('platformName')
  })
})
