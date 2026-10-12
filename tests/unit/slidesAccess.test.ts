import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'

import { lessonAssetToken } from '@/lib/lesson-asset-source'
import { protectLessonVideoSources } from '@/lib/lesson-video-source'
import { resolveLessonVideoSource } from '@/server/lesson-video-access'
import type { Lesson } from '@/payload-types'

const { canAccessLesson } = vi.hoisted(() => ({ canAccessLesson: vi.fn(async () => true) }))
vi.mock('@/server/learning-access', () => ({ canAccessLesson }))

const KEY = 'https://disk.yandex.com/d/vElPjy8GncYsUg'
const FOLDER = `${KEY}/${encodeURIComponent('Гайд (2025)')}`
const IMAGE = `${FOLDER}/${encodeURIComponent('Слайд 1.png')}`
const PDF = `${FOLDER}/${encodeURIComponent('гайд.pdf')}`
const findByID = vi.fn()
const payload = { findByID } as unknown as Payload
const student = { id: 1, role: 'student' as const }

const lesson = () => ({
  id: 42, isPublished: true, description: null,
  course: { id: 2, isPublished: true }, section: null,
  content: [{
    id: 'deck-1', blockType: 'slides', title: 'Гайд', folderUrl: FOLDER,
    items: [
      { id: 'i1', url: IMAGE, fileName: 'Слайд 1.png', caption: 'Начало' },
      { id: 'i2', url: PDF, fileName: 'гайд.pdf' },
      { id: 'i3', url: '/api/media/file/scheme.png', fileName: 'scheme.png' },
    ],
  }],
}) as unknown as Lesson

beforeEach(() => {
  findByID.mockReset()
  findByID.mockResolvedValue(lesson())
  canAccessLesson.mockResolvedValue(true)
})

describe('презентация в уроке ученика', () => {
  it('ученик не получает ни папку, ни ссылки Диска — только адреса прокси урока', () => {
    const seen = protectLessonVideoSources(lesson())
    expect(JSON.stringify(seen)).not.toContain('disk.yandex')
    const block = seen.content?.[0]
    if (block?.blockType !== 'slides') throw new Error('блок презентации потерян')
    expect(block.folderUrl).toBeNull()
    expect(block.items?.map((item) => [item.fileName, item.caption ?? null])).toEqual([['Слайд 1.png', 'Начало'], ['гайд.pdf', null], ['scheme.png', null]])
    expect(block.items?.[0].url).toMatch(/^\/api\/learning-assets\?lesson=42&block=deck-1&asset=[a-z\d]+$/)
    expect(block.items?.[1].url).toMatch(/^\/api\/learning-assets\?lesson=42&block=deck-1&asset=[a-z\d]+$/)
    expect(block.items?.[0].url).not.toBe(block.items?.[1].url)
    // Файл медиатеки и так отдаётся по правам урока.
    expect(block.items?.[2].url).toBe('/api/media/file/scheme.png')
  })

  it('по адресу из блока сервер находит именно этот файл Диска', async () => {
    const block = protectLessonVideoSources(lesson()).content?.[0]
    if (block?.blockType !== 'slides') throw new Error('блок презентации потерян')
    const first = new URL(block.items?.[0].url ?? '', 'https://lms.test').searchParams
    const second = new URL(block.items?.[1].url ?? '', 'https://lms.test').searchParams
    expect(await resolveLessonVideoSource(payload, student, first, true)).toEqual({ kind: 'yandex', ref: { publicKey: KEY, path: '/Гайд (2025)/Слайд 1.png' } })
    expect(await resolveLessonVideoSource(payload, student, second, true)).toEqual({ kind: 'yandex', ref: { publicKey: KEY, path: '/Гайд (2025)/гайд.pdf' } })
  })

  it('чужой идентификатор файла и папка презентации не отдаются', async () => {
    const unknown = new URLSearchParams({ lesson: '42', block: 'deck-1', asset: 'zzzzzz' })
    await expect(resolveLessonVideoSource(payload, student, unknown, true)).rejects.toMatchObject({ status: 404 })
    const doc = lesson()
    const block = doc.content?.[0]
    if (block?.blockType !== 'slides') throw new Error('блок презентации потерян')
    block.items = []
    findByID.mockResolvedValue(doc)
    // Без файлов в блоке остаётся только адрес папки: по нему ученик ничего получить не должен.
    await expect(resolveLessonVideoSource(payload, student, new URLSearchParams({ lesson: '42', block: 'deck-1' }), true)).rejects.toMatchObject({ status: 404 })
  })

  it('папка с точкой в названии не выдаётся за файл: без идентификатора и по её адресу — отказ', async () => {
    const folder = `${KEY}/Node.js`
    const doc = lesson()
    const block = doc.content?.[0]
    if (block?.blockType !== 'slides') throw new Error('блок презентации потерян')
    block.folderUrl = folder
    findByID.mockResolvedValue(doc)
    await expect(resolveLessonVideoSource(payload, student, new URLSearchParams({ lesson: '42', block: 'deck-1' }), true)).rejects.toMatchObject({ status: 404 })
    const guessed = new URLSearchParams({ lesson: '42', block: 'deck-1', asset: lessonAssetToken(folder) })
    await expect(resolveLessonVideoSource(payload, student, guessed, true)).rejects.toMatchObject({ status: 404 })
  })

  it('без доступа к уроку файл презентации не отдаётся', async () => {
    canAccessLesson.mockResolvedValue(false)
    const block = protectLessonVideoSources(lesson()).content?.[0]
    if (block?.blockType !== 'slides') throw new Error('блок презентации потерян')
    const params = new URL(block.items?.[0].url ?? '', 'https://lms.test').searchParams
    await expect(resolveLessonVideoSource(payload, student, params, true)).rejects.toMatchObject({ status: 403 })
  })
})
