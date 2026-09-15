import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'

import {
  createCourse,
  createLessonsForSection,
  createSection,
  createStubCourse,
  findOrCreateCourse,
  findOrCreateRoadmap,
} from '@/lib/seed-helpers'

/**
 * Сиды запускаются по несколько раз подряд и в произвольном порядке, поэтому
 * проверяется в первую очередь идемпотентность: повторный прогон обязан
 * возвращать существующие записи, а не падать на уникальности slug.
 */

type Created = { collection: string; data: Record<string, unknown> }

function makePayload(found: Record<string, unknown[]> = {}) {
  const created: Created[] = []
  let nextId = 100

  const find = vi.fn(async ({ collection }: { collection: string }) => ({
    docs: found[collection] ?? [],
  }))

  const create = vi.fn(async ({ collection, data }: Created) => {
    created.push({ collection, data })
    return { id: (nextId += 1), ...data }
  })

  const update = vi.fn(async ({ id, data }: { id: number; data: Record<string, unknown> }) => ({
    id,
    ...data,
  }))

  const payload = { find, create, update } as unknown as Payload
  return { payload, find, create, update, created }
}

const lastCreate = (created: Created[], collection: string) =>
  [...created].reverse().find((entry) => entry.collection === collection)?.data ?? {}

describe('сид-хелперы', () => {
  beforeEach(() => {
    vi.clearAllMocks()
  })

  describe('роадмап', () => {
    const input = { title: 'Frontend', slug: 'frontend', order: 1 }

    it('создаётся, когда его нет', async () => {
      const { payload, created } = makePayload()

      await findOrCreateRoadmap(payload, input)

      expect(lastCreate(created, 'roadmaps')).toMatchObject({ slug: 'frontend', order: 1 })
    })

    it('создаётся сразу опубликованным — иначе сид не виден на сайте', async () => {
      const { payload, created } = makePayload()

      await findOrCreateRoadmap(payload, input)

      expect(lastCreate(created, 'roadmaps').isPublished).toBe(true)
    })

    it('ищется строго по slug', async () => {
      const { payload, find } = makePayload()

      await findOrCreateRoadmap(payload, input)

      expect(find).toHaveBeenCalledWith(
        expect.objectContaining({ collection: 'roadmaps', where: { slug: { equals: 'frontend' } } }),
      )
    })

    it('существующий возвращается без повторного создания', async () => {
      const existing = { id: 7, slug: 'frontend' }
      const { payload, create } = makePayload({ roadmaps: [existing] })

      await expect(findOrCreateRoadmap(payload, input)).resolves.toBe(existing)
      expect(create).not.toHaveBeenCalled()
    })

    it('пустой miroEmbedUrl в базу не пишется', async () => {
      const { payload, created } = makePayload()

      await findOrCreateRoadmap(payload, input)

      expect(lastCreate(created, 'roadmaps')).not.toHaveProperty('miroEmbedUrl')
    })

    it('изменившийся miroEmbedUrl обновляется — старые записи хранят неработающий /app/board/', async () => {
      const { payload, update } = makePayload({ roadmaps: [{ id: 7, miroEmbedUrl: '/app/board/x' }] })

      await findOrCreateRoadmap(payload, { ...input, miroEmbedUrl: '/live-embed/x' })

      expect(update).toHaveBeenCalledWith(
        expect.objectContaining({ collection: 'roadmaps', id: 7, data: { miroEmbedUrl: '/live-embed/x' } }),
      )
    })

    it('совпадающий miroEmbedUrl лишней записи не вызывает', async () => {
      const { payload, update } = makePayload({ roadmaps: [{ id: 7, miroEmbedUrl: '/same' }] })

      await findOrCreateRoadmap(payload, { ...input, miroEmbedUrl: '/same' })

      expect(update).not.toHaveBeenCalled()
    })
  })

  describe('курс', () => {
    const input = { title: 'React', slug: 'react', roadmapId: 3, order: 2, estimatedHours: 10 }

    it('существующий возвращается, повторно не создаётся', async () => {
      const existing = { id: 11, slug: 'react' }
      const { payload, create } = makePayload({ courses: [existing] })

      await expect(findOrCreateCourse(payload, input)).resolves.toBe(existing)
      expect(create).not.toHaveBeenCalled()
    })

    it('привязывается к роадмапу и получает порядок', async () => {
      const { payload, created } = makePayload()

      await findOrCreateCourse(payload, input)

      expect(lastCreate(created, 'courses')).toMatchObject({
        roadmap: 3,
        order: 2,
        estimatedHours: 10,
        isPublished: true,
      })
    })

    it('пустой список предусловий полем не становится', async () => {
      const { payload, created } = makePayload()

      await findOrCreateCourse(payload, { ...input, prerequisites: [] })

      expect(lastCreate(created, 'courses')).not.toHaveProperty('prerequisites')
    })

    it('заданные предусловия сохраняются', async () => {
      const { payload, created } = makePayload()

      await findOrCreateCourse(payload, { ...input, prerequisites: [1, 2] })

      expect(lastCreate(created, 'courses').prerequisites).toEqual([1, 2])
    })

    it('createCourse не ищет существующий — это осознанно безусловное создание', async () => {
      const { payload, find, create } = makePayload({ courses: [{ id: 11 }] })

      await createCourse(payload, input)

      expect(find).not.toHaveBeenCalled()
      expect(create).toHaveBeenCalled()
    })
  })

  describe('slug секции', () => {
    const slugOf = async (title: string) => {
      const { payload, created } = makePayload()
      await createSection(payload, { title, courseId: 1, order: 1 })
      return String(lastCreate(created, 'sections').slug)
    }

    it('нумерация раздела в slug не попадает', async () => {
      expect(await slugOf('1. Основы')).toMatch(/^основы-/)
    })

    it('пробелы становятся дефисами', async () => {
      expect(await slugOf('Основы языка')).toMatch(/^основы-языка-/)
    })

    it('знаки препинания отбрасываются', async () => {
      expect(await slugOf('Типы: что, зачем?')).toMatch(/^типы-что-зачем-/)
    })

    it('кириллица сохраняется — slug не должен схлопнуться в пустую строку', async () => {
      expect(await slugOf('Асинхронность')).toMatch(/^асинхронность-/)
    })

    it('slug оканчивается уникальным суффиксом — секции с одним названием не конфликтуют', async () => {
      expect(await slugOf('Введение')).toMatch(/^введение-\d+-\d+$/)
    })

    it('секция создаётся опубликованной и привязанной к курсу', async () => {
      const { payload, created } = makePayload()

      await createSection(payload, { title: 'Введение', courseId: 42, order: 3 })

      expect(lastCreate(created, 'sections')).toMatchObject({
        course: 42,
        order: 3,
        isPublished: true,
      })
    })
  })

  describe('уроки секции', () => {
    const lessons = [
      { title: 'Первый урок', estimatedMinutes: 5 },
      { title: 'Второй урок', estimatedMinutes: 15 },
    ]

    it('создаются все переданные уроки', async () => {
      const { payload, created } = makePayload()

      await createLessonsForSection(payload, 1, 2, lessons)

      expect(created.filter((entry) => entry.collection === 'lessons')).toHaveLength(2)
    })

    it('порядок нумеруется с единицы', async () => {
      const { payload, created } = makePayload()

      await createLessonsForSection(payload, 1, 2, lessons)

      expect(created.map((entry) => entry.data.order)).toEqual([1, 2])
    })

    it('уроки привязаны и к курсу, и к секции', async () => {
      const { payload, created } = makePayload()

      await createLessonsForSection(payload, 7, 9, lessons.slice(0, 1))

      expect(lastCreate(created, 'lessons')).toMatchObject({ course: 7, section: 9 })
    })

    it('слаги уроков одной секции различаются', async () => {
      const { payload, created } = makePayload()

      await createLessonsForSection(payload, 1, 2, [
        { title: 'Урок', estimatedMinutes: 5 },
        { title: 'Урок', estimatedMinutes: 5 },
      ])

      const slugs = created.map((entry) => entry.data.slug)
      expect(new Set(slugs).size).toBe(2)
    })

    it('пустой список уроков ничего не создаёт', async () => {
      const { payload, create } = makePayload()

      await createLessonsForSection(payload, 1, 2, [])

      expect(create).not.toHaveBeenCalled()
    })

    it('заготовка содержимого — валидный документ Lexical внутри текстового блока', async () => {
      const { payload, created } = makePayload()

      await createLessonsForSection(payload, 1, 2, lessons.slice(0, 1))

      const content = lastCreate(created, 'lessons').content as Array<{
        blockType: string
        content: { root: { type: string; version: number; children: unknown[] } }
      }>
      expect(content[0].blockType).toBe('text')
      expect(content[0].content.root).toMatchObject({ type: 'root', version: 1 })
      expect(content[0].content.root.children.length).toBeGreaterThan(0)
    })

    it('заголовок урока попадает в заготовку содержимого', async () => {
      const { payload, created } = makePayload()

      await createLessonsForSection(payload, 1, 2, lessons.slice(0, 1))

      expect(JSON.stringify(lastCreate(created, 'lessons').content)).toContain('Первый урок')
    })
  })

  describe('курс-заглушка для узла роадмапа', () => {
    const params = { title: 'HTTP', slug: 'http', roadmapId: 3, order: 1 }

    it('создаёт курс, секцию и урок — узел графа должен быть кликабельным', async () => {
      const { payload, created } = makePayload()

      await createStubCourse(payload, params)

      expect(created.map((entry) => entry.collection)).toEqual(['courses', 'sections', 'lessons'])
    })

    it('курс без часов — содержимого в нём ещё нет', async () => {
      const { payload, created } = makePayload()

      await createStubCourse(payload, params)

      expect(lastCreate(created, 'courses').estimatedHours).toBe(0)
    })

    it('у курса с секциями содержимое не пересоздаётся', async () => {
      const { payload, created } = makePayload({
        courses: [{ id: 11, slug: 'http' }],
        sections: [{ id: 21 }],
      })

      await createStubCourse(payload, params)

      expect(created).toHaveLength(0)
    })

    it('существующий курс возвращается как есть', async () => {
      const existing = { id: 11, slug: 'http' }
      const { payload } = makePayload({ courses: [existing], sections: [{ id: 21 }] })

      await expect(createStubCourse(payload, params)).resolves.toBe(existing)
    })

    it('курс без секций достраивается, а не дублируется', async () => {
      const { payload, created } = makePayload({ courses: [{ id: 11, slug: 'http' }] })

      await createStubCourse(payload, params)

      expect(created.map((entry) => entry.collection)).toEqual(['sections', 'lessons'])
      expect(lastCreate(created, 'sections').course).toBe(11)
    })
  })
})
