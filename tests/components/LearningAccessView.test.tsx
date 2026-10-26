import type { ReactNode } from 'react'
import { describe, expect, it, vi } from 'vitest'
import { render, screen } from '@testing-library/react'

vi.mock('next/link', async () => (await import('../helpers/component-mocks')).linkMock())
vi.mock('next/navigation', () => ({ redirect: (href: string) => { throw new Error(`redirect:${href}`) } }))
vi.mock('@payloadcms/next/templates', () => ({ DefaultTemplate: ({ children }: { children: ReactNode }) => <div data-testid="payload-template">{children}</div> }))
vi.mock('@/components/learning-access/LearningAccessManager', () => ({
  LearningAccessManager: ({ initialUserId }: { initialUserId: number | null }) => <p>Ученик: {initialUserId ?? 'не выбран'}</p>,
}))

const { LearningAccessView } = await import('@/components/learning-access/LearningAccessView')
const { UserLearningAccessLink } = await import('@/components/learning-access/UserLearningAccessLink')

type ViewProps = Parameters<typeof LearningAccessView>[0]
type LinkProps = Parameters<typeof UserLearningAccessLink>[0]

function viewProps(user: unknown, searchParams: Record<string, unknown> = {}) {
  return { params: { segments: ['learning-access'] }, searchParams, initPageResult: { req: { user, payload: {}, i18n: {} }, permissions: {}, visibleEntities: { collections: [], globals: [] } } } as unknown as ViewProps
}

const admin = { id: 1, role: 'admin' }

describe('страница назначения обучения в админке', () => {
  it('открывается админу в оболочке Payload с учеником из адреса', () => {
    render(LearningAccessView(viewProps(admin, { user: '34' })))
    expect(screen.getByTestId('payload-template')).toBeInTheDocument()
    expect(screen.getByText('Ученик: 34')).toBeInTheDocument()
  })

  it.each([
    ['не число', 'abc'],
    ['дробь', '3.5'],
    ['отрицательное', '-4'],
    ['за пределами безопасного целого', '9007199254740993'],
    ['несколько значений', ['34', '35']],
  ])('ученик в адресе «%s» не выбирается', (_name, user) => {
    render(LearningAccessView(viewProps(admin, { user })))
    expect(screen.getByText('Ученик: не выбран')).toBeInTheDocument()
  })

  it('без параметра ученик не выбран', () => {
    render(LearningAccessView(viewProps(admin)))
    expect(screen.getByText('Ученик: не выбран')).toBeInTheDocument()
  })

  it('ученика и анонима уводит на главную', () => {
    expect(() => LearningAccessView(viewProps({ id: 2, role: 'student' }, { user: '34' }))).toThrow('redirect:/')
    expect(() => LearningAccessView(viewProps(null))).toThrow('redirect:/')
  })
})

describe('ссылка «Назначить обучение» в карточке пользователя', () => {
  const props = (id: number | string | undefined, data: Record<string, unknown> = { role: 'student' }, user: unknown = admin) => ({ id, data, req: { user } }) as unknown as LinkProps

  it('ведёт админа на страницу назначений с выбранным учеником', () => {
    render(UserLearningAccessLink(props(34)))
    expect(screen.getByRole('link', { name: 'Назначить обучение этому ученику' })).toHaveAttribute('href', '/admin/learning-access?user=34')
  })

  it('у ещё не созданного ученика просит сначала сохранить его', () => {
    render(UserLearningAccessLink(props(undefined)))
    expect(screen.getByText('Сохраните ученика, чтобы назначить ему обучение.')).toBeInTheDocument()
    expect(screen.queryByRole('link')).not.toBeInTheDocument()
  })

  it('не показывается в карточке админа и не-админу', () => {
    expect(UserLearningAccessLink(props(1, { role: 'admin' }))).toBeNull()
    expect(UserLearningAccessLink(props(34, { role: 'student' }, { id: 2, role: 'student' }))).toBeNull()
    expect(UserLearningAccessLink(props(34, { role: 'student' }, null))).toBeNull()
  })
})
