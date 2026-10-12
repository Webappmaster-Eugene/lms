import { describe, expect, it } from 'vitest'
import type { PayloadRequest } from 'payload'

import { denyLessonSourceQueries, withLessonSourceGuard } from '@/payload/hooks/denyLessonSourceQueries'

type Role = 'admin' | 'student' | null
// Связи с уроком под разными именами и на разной глубине: защита обязана найти их сама.
const config = {
  collections: [
    { slug: 'notes', fields: [{ name: 'lesson', type: 'relationship', relationTo: 'lessons' }] },
    { slug: 'notifications', fields: [{ name: 'comment', type: 'relationship', relationTo: 'comments' }] },
    { slug: 'learning-access-grants', fields: [{ name: 'target', type: 'relationship', relationTo: ['courses', 'lessons'] }] },
    { slug: 'courses', fields: [
      { type: 'tabs', tabs: [{ label: 'Программа', fields: [{ name: 'program', type: 'array', fields: [{ name: 'firstLesson', type: 'relationship', relationTo: 'lessons' }] }] }] },
      { name: 'materials', type: 'join', collection: 'lessons', on: 'course' },
    ] },
    { slug: 'roadmap-edges', fields: [{ name: 'source', type: 'relationship', relationTo: 'roadmap-nodes' }] },
  ],
  globals: [{ slug: 'site-settings', fields: [{ name: 'welcomeLesson', type: 'relationship', relationTo: 'lessons' }] }],
}
const run = (slug: string, args: Record<string, unknown>, role: Role = 'student', overrideAccess = false) => denyLessonSourceQueries({
  args, operation: 'read', overrideAccess,
  collection: { slug } as never, context: {},
  req: { user: role ? { id: 1, role } : null, payload: { config } } as unknown as PayloadRequest,
} as unknown as Parameters<typeof denyLessonSourceQueries>[0])

describe('запросы по содержимому урока', () => {
  it.each<[string, string, Record<string, unknown>]>([
    ['поле блока урока', 'lessons', { where: { 'content.videoUrl': { contains: 'disk' } } }],
    ['само поле content', 'lessons', { where: { content: { exists: true } } }],
    ['вложенная запись пути', 'lessons', { where: { content: { folderUrl: { contains: 'disk' } } } }],
    ['глубоко в and/or', 'lessons', { where: { and: [{ title: { equals: 'a' } }, { OR: [{ 'content.items.url': { like: 'x' } }] }] } }],
    ['сортировка строкой', 'lessons', { sort: 'title, -content.videoUrl' }],
    ['сортировка массивом', 'lessons', { sort: ['-content.url'] }],
    ['поле для distinct', 'lessons', { field: 'content.folderUrl' }],
    ['через связь из заметок', 'notes', { where: { 'lesson.content.videoUrl': { contains: 'disk' } } }],
    ['через две связи', 'notifications', { where: { 'comment.lesson.content.url': { contains: 'disk' } } }],
    ['связь вложенной записью', 'user-progress', { where: { lesson: { 'content.videoUrl': { contains: 'disk' } } } }],
    ['сортировка через связь', 'bookmarks', { sort: '-lesson.content.videoUrl' }],
    ['связь с несколькими коллекциями', 'learning-access-grants', { where: { 'target.value.content.videoUrl': { contains: 'disk' } } }],
    ['связь внутри массива', 'courses', { where: { 'program.firstLesson.content.url': { contains: 'disk' } } }],
    ['обратная связь курса с уроками', 'courses', { where: { 'materials.content.folderUrl': { contains: 'disk' } } }],
    ['связь из глобальных настроек', 'notes', { sort: 'welcomeLesson.content.videoUrl' }],
    ['путь с двойным подчёркиванием', 'lessons', { where: { content__videoUrl: { contains: 'disk' } } }],
    ['связь с двойным подчёркиванием', 'notes', { where: { lesson__content__folderUrl: { contains: 'disk' } } }],
    ['сортировка с двойным подчёркиванием', 'lessons', { sort: '-content__items__url' }],
    ['условие обратной связи', 'courses', { joins: { materials: { where: { 'content.videoUrl': { contains: 'disk' } } } } }],
    ['сортировка обратной связи', 'courses', { joins: { materials: { sort: '-content.videoUrl' } } }],
  ])('ученику закрыто: %s', (_label, slug, args) => {
    expect(() => run(slug, args)).toThrow(expect.objectContaining({ status: 403 }))
    expect(() => run(slug, args, null)).toThrow(expect.objectContaining({ status: 403 }))
  })

  it.each<[string, string, Record<string, unknown>]>([
    ['название и курс урока', 'lessons', { where: { and: [{ title: { contains: 'React' } }, { course: { equals: 3 } }] }, sort: '-order' }],
    ['текст своей заметки', 'notes', { where: { content: { contains: 'конспект' } }, sort: 'content' }],
    ['заметки урока', 'notes', { where: { 'lesson.title': { contains: 'React' } } }],
    ['текст комментария', 'comments', { where: { or: [{ content: { like: 'вопрос' } }, { lesson: { equals: 5 } }] } }],
    ['значение с похожим словом', 'lessons', { where: { title: { equals: 'content.videoUrl' } } }],
    ['поле content по связи не с уроком', 'roadmap-edges', { where: { 'source.content': { contains: 'узел' } } }],
    ['обратная связь без условий по содержимому', 'courses', { joins: { materials: { where: { title: { contains: 'React' } }, sort: '-order', limit: 5 } } }],
    ['обратная связь отключена', 'courses', { joins: false }],
    ['без условий', 'lessons', {}],
  ])('обычные запросы ученика проходят: %s', (_label, slug, args) => {
    expect(() => run(slug, args)).not.toThrow()
  })

  it('администратор и серверный код фильтруют по источникам', () => {
    const args = { where: { 'content.videoUrl': { contains: 'disk' } }, sort: 'content.videoUrl' }
    expect(() => run('lessons', args, 'admin')).not.toThrow()
    expect(() => run('lessons', args, 'student', true)).not.toThrow()
    expect(() => run('notes', { where: { 'lesson.content.url': { contains: 'x' } } }, null, true)).not.toThrow()
  })

  it('защита встаёт первой и сохраняет хуки коллекции', () => {
    const own = () => undefined
    const guarded = withLessonSourceGuard({ slug: 'notes', fields: [], hooks: { beforeOperation: [own], afterRead: [] } })
    expect(guarded.hooks?.beforeOperation).toEqual([denyLessonSourceQueries, own])
    expect(guarded.hooks?.afterRead).toEqual([])
    expect(withLessonSourceGuard({ slug: 'faq', fields: [] }).hooks?.beforeOperation).toEqual([denyLessonSourceQueries])
  })
})
