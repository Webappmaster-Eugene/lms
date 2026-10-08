import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

const mocks = vi.hoisted(() => ({ find: vi.fn(), findByID: vi.fn(), auth: vi.fn(), policy: vi.fn(), req: { user: { id: 7, role: 'student' } } }))
vi.mock('@/lib/payload', () => ({ getPayload: async () => mocks }))
vi.mock('next/headers', () => ({ headers: async () => new Headers() }))
vi.mock('next/navigation', () => ({ notFound: () => { throw new Error('not-found') }, redirect: () => { throw new Error('redirect') } }))
vi.mock('payload', () => ({ createLocalReq: async () => mocks.req }))
vi.mock('next/link', async () => (await import('../helpers/component-mocks')).linkMock())
vi.mock('@/server/learning-access', () => ({ getLearningAccess: (...args: unknown[]) => mocks.policy(...args) }))
vi.mock('@payloadcms/richtext-lexical/react', () => ({ RichText: () => <p>Описание назначенного курса</p> }))

const { default: CourseDetailPage } = await import('@/app/(frontend)/courses/[slug]/page')

const lessons = [
  { id: 1, title: 'Закрытая тема', slug: 'closed-topic', course: 10, section: null, isPublished: true, order: 0 },
  { id: 2, title: 'Назначенная тема', slug: 'assigned-topic', course: 10, section: null, isPublished: true, order: 1 },
]
const page = (docs: unknown[]) => ({ docs, hasNextPage: false, page: 1, totalPages: 1, totalDocs: docs.length })

beforeEach(() => {
  vi.clearAllMocks()
  mocks.auth.mockResolvedValue({ user: mocks.req.user })
  mocks.find.mockImplementation(async ({ collection }: { collection: string }) => {
    if (collection === 'courses') return page([{ id: 10, title: 'Node.js', slug: 'node', roadmap: null }])
    if (collection === 'lessons') return page(lessons)
    return page([])
  })
  mocks.findByID.mockResolvedValue({ id: 10, description: null })
})

describe('серверная программа курса', () => {
  it('показывает только метаданные неназначенных уроков и не читает описание курса', async () => {
    mocks.policy.mockResolvedValue({ canBrowseCourse: () => true, canBrowseLessonMetadata: () => true, canAccessCourse: () => false, canAccessLessonMetadata: () => false })
    render(await CourseDetailPage({ params: Promise.resolve({ slug: 'node' }) }))
    expect(screen.getByText('Закрытая тема')).toBeInTheDocument()
    expect(screen.getAllByText('Доступ к этому уроку не назначен')).toHaveLength(2)
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
    expect(mocks.findByID).not.toHaveBeenCalled()
    const query = mocks.find.mock.calls.find(([args]) => args.collection === 'lessons')?.[0]
    expect(query).toMatchObject({ depth: 0, overrideAccess: true, req: mocks.req })
    expect(query.select).not.toHaveProperty('content')
    expect(query.select).not.toHaveProperty('description')
  })

  it('начинает с назначенного урока, сохраняя общий знаменатель прогресса', async () => {
    mocks.policy.mockResolvedValue({ canBrowseCourse: () => true, canBrowseLessonMetadata: () => true, canAccessCourse: () => true, canAccessLessonMetadata: ({ id }: { id: number }) => id === 2 })
    render(await CourseDetailPage({ params: Promise.resolve({ slug: 'node' }) }))
    expect(screen.getByText('0/2 (0%)')).toBeInTheDocument()
    expect(screen.getByText(/Вам назначено 1 из 2 уроков/)).toBeInTheDocument()
    expect(screen.getAllByRole('link').every((link) => link.getAttribute('href') === '/lessons/assigned-topic')).toBe(true)
    expect(screen.queryByText('Курс пройден.')).not.toBeInTheDocument()
    expect(mocks.policy).toHaveBeenCalledTimes(1)
  })

  it('проверяет настоящую сессию до чтения программы', async () => {
    mocks.auth.mockResolvedValue({ user: null })
    await expect(CourseDetailPage({ params: Promise.resolve({ slug: 'node' }) })).rejects.toThrow('redirect')
    expect(mocks.find).not.toHaveBeenCalled()
    expect(mocks.policy).not.toHaveBeenCalled()
  })

  it('скрывает опубликованный курс в неопубликованном роадмапе', async () => {
    mocks.policy.mockResolvedValue({ canBrowseCourse: () => false })
    await expect(CourseDetailPage({ params: Promise.resolve({ slug: 'node' }) })).rejects.toThrow('not-found')
    expect(mocks.findByID).not.toHaveBeenCalled()
    expect(mocks.find).toHaveBeenCalledTimes(1)
  })

  it('не показывает метаданные урока из скрытой секции', async () => {
    mocks.policy.mockResolvedValue({ canBrowseCourse: () => true, canBrowseLessonMetadata: ({ id }: { id: number }) => id === 2, canAccessCourse: () => false, canAccessLessonMetadata: () => false })
    render(await CourseDetailPage({ params: Promise.resolve({ slug: 'node' }) }))
    expect(screen.queryByText('Закрытая тема')).not.toBeInTheDocument()
    expect(screen.getByText('Назначенная тема')).toBeInTheDocument()
    expect(screen.getByText('0/1 (0%)')).toBeInTheDocument()
  })

  it('старый полный прогресс не объявляет закрытый курс пройденным', async () => {
    mocks.policy.mockResolvedValue({ canBrowseCourse: () => true, canBrowseLessonMetadata: () => true, canAccessCourse: () => false, canAccessLessonMetadata: () => false })
    mocks.find.mockImplementation(async ({ collection }: { collection: string }) => {
      if (collection === 'courses') return page([{ id: 10, title: 'Node.js', slug: 'node', roadmap: null }])
      if (collection === 'lessons') return page(lessons)
      if (collection === 'user-progress') return page([{ id: 20, lesson: 1 }, { id: 21, lesson: 2 }])
      return page([])
    })
    render(await CourseDetailPage({ params: Promise.resolve({ slug: 'node' }) }))
    expect(screen.getByText('2/2 (100%)')).toBeInTheDocument()
    expect(screen.queryByText(/Курс пройден/)).not.toBeInTheDocument()
    expect(screen.queryByRole('link', { name: 'Сертификаты' })).not.toBeInTheDocument()
  })
})
