import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'
import type { ReactNode } from 'react'
import { StudentAnalyticsView } from '@/components/student-analytics/StudentAnalyticsView'
import { UserStudentAnalyticsLink } from '@/components/student-analytics/UserStudentAnalyticsLink'

const { getLearningAccess } = vi.hoisted(() => ({ getLearningAccess: vi.fn(async () => ({ admin: true })) }))
vi.mock('@/server/learning-access', () => ({ getLearningAccess }))
vi.mock('@payloadcms/next/templates', () => ({ DefaultTemplate: ({ children }: { children: ReactNode }) => <div data-testid="payload-template">{children}</div> }))
vi.mock('@/components/student-analytics/StudentAnalyticsManager', () => ({ StudentAnalyticsManager: ({ initialUserId }: { initialUserId: number | null }) => <p>Ученик: {initialUserId ?? 'Не выбран'}</p> }))
vi.mock('next/navigation', () => ({ redirect: (href: string) => { throw new Error(`redirect:${href}`) } }))
vi.mock('next/link', async () => (await import('../helpers/component-mocks')).linkMock())
const props = { params: { segments: ['student-analytics'] }, searchParams: { user: '34' }, initPageResult: { req: { user: { id: 1, role: 'admin' }, payload: {}, i18n: {} }, permissions: {}, visibleEntities: { collections: [], globals: [] } } } as unknown as Parameters<typeof StudentAnalyticsView>[0]

beforeEach(() => { getLearningAccess.mockClear(); getLearningAccess.mockResolvedValue({ admin: true }) })

describe('аналитика встроена в защищённую админку Payload', () => {
  it('показывает меню Payload и выбранного ученика после проверки реальной политики', async () => {
    render(await StudentAnalyticsView(props))
    expect(screen.getByTestId('payload-template')).toBeInTheDocument()
    expect(screen.getByText('Ученик: 34')).toBeInTheDocument()
    expect(getLearningAccess).toHaveBeenCalledWith(props.initPageResult.req.payload, props.initPageResult.req.user, props.initPageResult.req)
  })
  it('старое поле role=admin не обходит актуальную серверную роль', async () => {
    getLearningAccess.mockResolvedValue({ admin: false })
    await expect(StudentAnalyticsView(props)).rejects.toThrow('redirect:/')
  })
  it('не открывается без действительного пользователя', async () => {
    const anonymous = { ...props, initPageResult: { ...props.initPageResult, req: { ...props.initPageResult.req, user: null } } } as Parameters<typeof StudentAnalyticsView>[0]
    await expect(StudentAnalyticsView(anonymous)).rejects.toThrow('redirect:/')
    expect(getLearningAccess).not.toHaveBeenCalled()
  })
})

describe('ссылка на активность в карточке пользователя', () => {
  type LinkProps = Parameters<typeof UserStudentAnalyticsLink>[0]
  const props = (id: number | undefined, user: unknown = { id: 1, role: 'admin' }) => ({ id, req: { user } }) as unknown as LinkProps

  it('ведёт админа на аналитику выбранного пользователя', () => {
    render(UserStudentAnalyticsLink(props(34)))
    expect(screen.getByRole('link', { name: 'Посмотреть активность этого пользователя' })).toHaveAttribute('href', '/admin/student-analytics?user=34')
  })

  it('не показывается до сохранения пользователя и не-админу', () => {
    expect(UserStudentAnalyticsLink(props(undefined))).toBeNull()
    expect(UserStudentAnalyticsLink(props(34, { id: 2, role: 'student' }))).toBeNull()
    expect(UserStudentAnalyticsLink(props(34, null))).toBeNull()
  })
})
