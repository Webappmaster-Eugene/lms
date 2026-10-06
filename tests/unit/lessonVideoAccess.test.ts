import { beforeEach, describe, expect, it, vi } from 'vitest'
import type { Payload } from 'payload'

import { resolveLessonVideoSource } from '@/server/lesson-video-access'
import { protectCourseSourceLinks, protectLessonVideoSources } from '@/lib/lesson-video-source'
import type { Lesson } from '@/payload-types'

const ROOT = 'https://disk.yandex.com/d/library'
const VIDEO = `${ROOT}/course/lesson.mp4`
const findByID = vi.fn()
const payload = { findByID } as unknown as Payload
const student = { id: 1, role: 'student' as const }
const params = () => new URLSearchParams({ lesson: '42', block: 'video-1' })
const lesson = () => ({
  id: 42, isPublished: true,
  course: { id: 2, isPublished: true },
  section: { id: 3, course: 2, isPublished: true },
  content: [{ id: 'video-1', blockType: 'video', videoUrl: VIDEO, title: 'Видео', displayMode: 'embed' }],
})

beforeEach(() => {
  findByID.mockReset()
  findByID.mockResolvedValue(lesson())
})

describe('источник только из опубликованного урока', () => {
  it('сохраняет публичный ключ только на сервере', async () => {
    expect(await resolveLessonVideoSource(payload, student, params())).toEqual({ kind: 'yandex', ref: { publicKey: ROOT, path: '/course/lesson.mp4' } })
    expect(findByID).toHaveBeenCalledWith({ collection: 'lessons', id: 42, depth: 1, overrideAccess: true })
  })

  it.each(['lesson', 'course', 'section'])('скрытый %s не отдаёт источник', async (scope) => {
    const doc = lesson()
    if (scope === 'lesson') doc.isPublished = false
    else if (scope === 'course') doc.course.isPublished = false
    else doc.section.isPublished = false
    findByID.mockResolvedValue(doc)
    await expect(resolveLessonVideoSource(payload, student, params())).rejects.toMatchObject({ status: 404 })
  })

  it('блок другого урока и неправильная секция не открываются', async () => {
    const wrongBlock = params()
    wrongBlock.set('block', 'other')
    await expect(resolveLessonVideoSource(payload, student, wrongBlock)).rejects.toMatchObject({ status: 404 })
    const doc = lesson()
    doc.section.course = 9
    findByID.mockResolvedValue(doc)
    await expect(resolveLessonVideoSource(payload, student, params())).rejects.toMatchObject({ status: 404 })
  })

  it.each(['0', '-1', '1.5', 'NaN', '9007199254740992'])('невалидный ID %s отклоняется до запроса', async (id) => {
    const invalid = params()
    invalid.set('lesson', id)
    await expect(resolveLessonVideoSource(payload, student, invalid)).rejects.toMatchObject({ status: 400 })
    expect(findByID).not.toHaveBeenCalled()
  })

  it('отказ БД не выдаётся за отсутствующее видео', async () => {
    const failure = new Error('database unavailable')
    findByID.mockRejectedValue(failure)
    await expect(resolveLessonVideoSource(payload, student, params())).rejects.toBe(failure)
  })

  it('Media путь остаётся локальным и сохраняет repaired MP4', async () => {
    const doc = lesson()
    doc.content[0].videoUrl = 'https://learn.mentorcareer.ru/api/media/file/repaired.mp4'
    findByID.mockResolvedValue(doc)
    expect(await resolveLessonVideoSource(payload, student, params())).toEqual({ kind: 'media', path: '/api/media/file/repaired.mp4' })
  })

  it('прямой источник только для администратора', async () => {
    const source = new URLSearchParams({ url: VIDEO })
    await expect(resolveLessonVideoSource(payload, student, source)).rejects.toMatchObject({ status: 403 })
    expect(await resolveLessonVideoSource(payload, { id: 2, role: 'admin' }, source)).toMatchObject({ kind: 'yandex' })
    expect(findByID).not.toHaveBeenCalled()
  })
})

describe('данные, переданные ученику', () => {
  const content = (): NonNullable<Lesson['content']> => [
    { id: 'v1', blockType: 'video', title: 'Первое', displayMode: 'link', videoUrl: VIDEO, description: `Повтор ${VIDEO}` },
    { id: 'v2', blockType: 'video', title: 'TS', displayMode: 'embed', videoUrl: `${ROOT}/course/2.ts` },
    { id: 'l1', blockType: 'link', title: 'Открыть папку программы', url: ROOT },
    { id: 'l2', blockType: 'link', title: 'Отдельное видео', url: `${ROOT}/3.mp4` },
    { id: 'zip', blockType: 'link', title: 'Исходники', url: `${ROOT}/source.zip` },
    { id: 'pdf', blockType: 'link', title: 'Слайды', url: `${ROOT}/slides.pdf` },
  ]

  it('не раскрывает видео, корневую папку и дублирующую ссылку, сохраняет учебные ZIP/PDF', () => {
    const raw = { id: 42, description: `Смотрите ${VIDEO}`, content: content() }
    const protectedDoc = protectLessonVideoSources(raw)
    const video = protectedDoc.content?.[0]
    expect(video?.blockType === 'video' && video.videoUrl).toBe('/api/yandex-disk/stream?lesson=42&block=v1')
    expect(video?.blockType === 'video' && video.displayMode).toBe('embed')
    expect(JSON.stringify(protectedDoc)).not.toContain(VIDEO)
    expect(protectedDoc.content?.[2].blockType).toBe('text')
    expect(protectedDoc.content?.[3].blockType).toBe('video')
    expect(JSON.stringify(protectedDoc)).toContain(`${ROOT}/source.zip`)
    expect(JSON.stringify(protectedDoc)).toContain(`${ROOT}/slides.pdf`)
    expect(raw.content[0]).toMatchObject({ videoUrl: VIDEO, displayMode: 'link' })
    expect(protectedDoc.content?.[1]).toMatchObject({ videoUrl: '/api/yandex-disk/stream?lesson=42&block=v2&format=ts' })
  })

  it('скрывает каталог в Lexical курсового описания с внутренней навигацией', () => {
    const raw = { slug: 'course', description: { root: {
      type: 'root', direction: 'ltr' as const, format: '' as const, indent: 0, version: 1,
      children: [{ type: 'paragraph', version: 1, children: [{ type: 'link', version: 3, fields: { url: ROOT, newTab: true }, children: [{ type: 'text', text: 'Открыть всю программу на Яндекс.Диске', version: 1 }] }] }],
    } } }
    const safe = protectCourseSourceLinks(raw)
    expect(JSON.stringify(safe)).not.toContain(ROOT)
    expect(JSON.stringify(safe)).toContain('/courses/course')
    expect(JSON.stringify(safe)).toContain('Материалы курса доступны в уроках LMS')
    expect(JSON.stringify(raw)).toContain(ROOT)
  })

  it('повторная защита сохраняет стабильные ID и URL', () => {
    const once = protectLessonVideoSources({ id: 42, content: content() })
    expect(protectLessonVideoSources(once)).toEqual(once)
  })
})
