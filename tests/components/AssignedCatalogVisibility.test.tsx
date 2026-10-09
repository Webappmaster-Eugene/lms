import { beforeEach, describe, expect, it, vi } from 'vitest'
import { renderToStaticMarkup } from 'react-dom/server'

const fixture = vi.hoisted(() => ({
  user: { id: 9, role: 'student', firstName: 'Ученик' },
  visibility: 'assigned',
  find: vi.fn(),
  findByID: vi.fn(),
  courseAllowed: true,
}))

vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('next/navigation', () => ({
  notFound: () => { throw new Error('NOT_FOUND') },
  redirect: () => { throw new Error('REDIRECT') },
}))
vi.mock('next/link', async () => (await import('../helpers/component-mocks')).linkMock())
vi.mock('payload', async (original) => ({ ...await original<typeof import('payload')>(), createLocalReq: async () => ({ user: fixture.user }) }))
vi.mock('@/lib/payload', () => ({ getPayload: async () => ({ auth: async () => ({ user: fixture.user }), find: fixture.find, findByID: fixture.findByID }) }))
vi.mock('@/server/learning-access', () => ({ getLearningAccess: async () => ({
  catalogVisibility: fixture.visibility,
  browseLessonWhere: fixture.visibility === 'assigned' ? { id: { in: [11] } } : { isPublished: { equals: true } },
  canBrowseCourse: (id: number) => fixture.courseAllowed && id === 1,
  canAccessCourse: (id: number) => fixture.courseAllowed && id === 1,
  canBrowseSection: (id: number) => fixture.visibility === 'catalog' || id === 10,
  canBrowseLessonMetadata: (lesson: { id: number }) => fixture.visibility === 'catalog' || lesson.id === 11,
  canAccessLessonMetadata: (lesson: { id: number }) => lesson.id === 11,
}) }))
vi.mock('@/components/ui/ShareButton', () => ({ ShareButton: () => null }))
vi.mock('@/components/course/CourseLessonItem', () => ({ CourseLessonItem: ({ lesson }: { lesson: { title: string } }) => <span>{lesson.title}</span> }))

const { default: CoursePage, generateMetadata } = await import('@/app/(frontend)/courses/[slug]/page')
const params = { params: Promise.resolve({ slug: 'course' }) }

describe('назначенная программа не раскрывает соседние уроки в серверном HTML', () => {
  beforeEach(() => {
    fixture.visibility = 'assigned'
    fixture.courseAllowed = true
    fixture.find.mockReset()
    fixture.findByID.mockReset()
    fixture.findByID.mockResolvedValue({ description: null })
    fixture.find.mockImplementation(async ({ collection }: { collection: string }) => {
      const docs = collection === 'courses' ? [{ id: 1, title: 'Назначенный курс', slug: 'course', roadmap: 2, estimatedHours: 50 }]
        : collection === 'sections' ? [{ id: 10, title: 'Раздел назначенного урока', order: 1 }, { id: 12, title: 'Секретный раздел', order: 2 }]
          : collection === 'lessons' ? [{ id: 11, title: 'Назначенный урок', slug: 'allowed', course: 1, section: 10, isPublished: true }, { id: 13, title: 'Секретный урок', slug: 'secret', course: 1, section: 12, isPublished: true }]
            : collection === 'roadmaps' ? [{ id: 2, title: 'Родительский роадмап', slug: 'roadmap' }] : []
      return { docs, totalDocs: docs.length, hasNextPage: false }
    })
  })

  it('выдаёт один урок, минимальный путь и только назначенный раздел', async () => {
    const html = renderToStaticMarkup(await CoursePage(params))
    expect(html).toContain('Назначенный курс')
    expect(html).toContain('Назначенный урок')
    expect(html).toContain('Раздел назначенного урока')
    expect(html).toContain('Родительский роадмап')
    expect(html).not.toContain('Секретный раздел')
    expect(html).not.toContain('Секретный урок')
    expect(html).not.toContain('50ч')
    expect(html).toContain('Прогресс назначенных уроков')
    expect(fixture.findByID).not.toHaveBeenCalled()
  })

  it('загружает названия курса с проверкой прав и минимальной проекцией', async () => {
    expect(await generateMetadata(params)).toEqual({ title: 'Назначенный курс' })
    expect(fixture.find).toHaveBeenCalledWith(expect.objectContaining({ collection: 'courses', overrideAccess: false, select: { title: true }, depth: 0, req: expect.objectContaining({ user: fixture.user }) }))
  })

  it('при отсутствии назначения возвращает 404 до загрузки программы', async () => {
    fixture.courseAllowed = false
    await expect(CoursePage(params)).rejects.toThrow('NOT_FOUND')
    expect(fixture.find.mock.calls.map(([arg]) => arg.collection)).toEqual(['courses'])
  })

  it('скрытый курс не попадает в заголовок документа', async () => {
    fixture.courseAllowed = false
    expect(await generateMetadata(params)).toEqual({ title: 'Курс' })
  })

  it('в режиме общего каталога сохраняет закрытую программу для обсуждения с ментором', async () => {
    fixture.visibility = 'catalog'
    const html = renderToStaticMarkup(await CoursePage(params))
    expect(html).toContain('Секретный урок')
    expect(html).toContain('Секретный раздел')
    expect(fixture.findByID).toHaveBeenCalledOnce()
  })
})
