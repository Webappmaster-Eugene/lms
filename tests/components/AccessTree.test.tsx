import { beforeEach, describe, expect, it, vi } from 'vitest'
import { render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { useEffect, useState } from 'react'
import { AccessTree } from '@/components/learning-access/AccessTree'
import type { AssignmentRule } from '@/components/learning-access/contracts'
import type { AccessCatalog, AccessMode, CatalogLesson } from '@/lib/learning-access-edit'

const catalog: AccessCatalog = {
  roadmaps: [{ id: 1, title: 'Backend', isPublished: true }, { id: 2, title: 'Frontend', isPublished: true }],
  nodes: [{ id: 10, label: 'Основы', roadmap: 1, course: null, nodeType: 'topic', sharedCourses: [] }],
  courses: [
    { id: 11, title: 'Node.js', roadmap: 1, roadmapNode: 10, isPublished: true, assignedOnly: false, isBootcamp: false },
    { id: 12, title: 'Express', roadmap: 1, roadmapNode: null, isPublished: true, assignedOnly: false, isBootcamp: false },
    { id: 13, title: 'SQL', roadmap: 1, roadmapNode: null, isPublished: true, assignedOnly: true, isBootcamp: false },
    { id: 14, title: 'Буткемп', roadmap: 1, roadmapNode: null, isPublished: true, assignedOnly: true, isBootcamp: true },
    { id: 15, title: 'Черновик курса', roadmap: 1, roadmapNode: null, isPublished: false, assignedOnly: false, isBootcamp: false },
    { id: 21, title: 'React', roadmap: 2, roadmapNode: null, isPublished: true, assignedOnly: false, isBootcamp: false },
  ],
  sections: [{ id: 110, title: 'Первый раздел', course: 11, isPublished: true }],
}
const lessons: CatalogLesson[] = [{ id: 1100, title: 'Первый урок', course: 11, section: 110, isPublished: true }, { id: 1101, title: 'Второй урок', course: 11, section: 110, isPublished: true }]

let catalogFails = false
let lessonsFail = false
const fetchMock = vi.fn(async (url: string | URL | Request) => {
  const address = new URL(String(url), 'http://localhost')
  if (address.searchParams.get('kind') === 'catalog') return catalogFails ? Response.json({ error: 'Каталог недоступен' }, { status: 500 }) : Response.json(catalog)
  if (address.searchParams.get('kind') === 'lessons') return lessonsFail ? Response.json({ error: 'Уроки недоступны' }, { status: 500 }) : Response.json({ docs: lessons })
  throw new Error(`Неожиданный запрос ${String(url)}`)
})
let latest: AssignmentRule[] = []

function Harness({ initial = [], mode = 'assigned', known = [] }: { initial?: AssignmentRule[]; mode?: AccessMode; known?: CatalogLesson[] }) {
  const [rules, setRules] = useState(initial)
  useEffect(() => { latest = rules }, [rules])
  return <AccessTree rules={rules} mode={mode} knownLessons={known} disabled={false} onChange={setRules} />
}
const rule = (relationTo: AssignmentRule['target']['relationTo'], value: number, effect: 'allow' | 'deny' = 'allow', extra: Partial<AssignmentRule> = {}): AssignmentRule => ({ target: { relationTo, value }, effect, startsAt: null, expiresAt: null, note: '', ...extra })
const summary = () => latest.map((item) => `${item.effect} ${item.target.relationTo}:${item.target.value}`)
const mark = (name: string) => screen.findByRole('checkbox', { name })
async function expand(user: ReturnType<typeof userEvent.setup>, name: string) { await user.click(await screen.findByRole('button', { name: `Раскрыть: ${name}` })) }

beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockClear(); catalogFails = false; lessonsFail = false; latest = [] })

describe('дерево доступа', () => {
  it('отмечает роадмап целиком одним правилом и показывает число открытых курсов', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.click(await mark('Backend'))
    expect(summary()).toEqual(['allow roadmaps:1'])
    expect(await mark('Backend')).toBeChecked()
    expect(screen.getByText('Открыто обычных курсов: 2 из 3')).toBeInTheDocument()
  })

  it('отдельный курс: карта становится частичной, снятая отметка в открытой карте становится запретом', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await expand(user, 'Backend')
    await user.click(await mark('Express'))
    expect(summary()).toEqual(['allow courses:12'])
    const backend = await mark('Backend') as HTMLInputElement
    expect(backend.indeterminate).toBe(true)
    await user.click(backend)
    expect(summary()).toEqual(['allow roadmaps:1'])
    await user.click(await mark('Express'))
    expect(summary()).toEqual(['allow roadmaps:1', 'deny courses:12'])
  })

  it('уроки подгружаются при раскрытии, отдельный урок открывается своим правилом', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await expand(user, 'Backend')
    await expand(user, 'Node.js')
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('kind=lessons&course=11'))).toBe(true))
    await expand(user, 'Первый раздел')
    await user.click(await mark('Первый урок'))
    expect(summary()).toEqual(['allow lessons:1100'])
    expect((await mark('Первый раздел') as HTMLInputElement).indeterminate).toBe(true)
    expect((await mark('Node.js') as HTMLInputElement).indeterminate).toBe(true)
    expect(await mark('Второй урок')).not.toBeChecked()
  })

  it('частичную строку можно закрыть целиком отдельной кнопкой', async () => {
    const user = userEvent.setup()
    render(<Harness initial={[rule('lessons', 1100)]} known={lessons} />)
    await user.click(await screen.findByRole('button', { name: 'Закрыть целиком: Backend' }))
    expect(summary()).toEqual([])
  })

  it('карта, частичная только из-за платного курса, не предлагает пустое «Закрыть»', async () => {
    render(<Harness initial={[rule('courses', 13)]} />)
    expect((await mark('Backend') as HTMLInputElement).indeterminate).toBe(true)
    expect(screen.queryByRole('button', { name: 'Закрыть целиком: Backend' })).not.toBeInTheDocument()
  })

  it('сбой загрузки уроков виден и в раскрытом разделе, можно повторить', async () => {
    lessonsFail = true
    const user = userEvent.setup()
    render(<Harness />)
    await expand(user, 'Backend')
    await expand(user, 'Node.js')
    await expand(user, 'Первый раздел')
    expect((await screen.findAllByText(/Уроки недоступны/)).length).toBeGreaterThan(0)
    expect(screen.queryByText('Загружаем уроки…')).not.toBeInTheDocument()
    lessonsFail = false
    await user.click(screen.getAllByRole('button', { name: 'Повторить' })[0])
    expect(await mark('Первый урок')).toBeInTheDocument()
  })

  it('буткемп без раскрытия, платный курс помечен, черновик заблокирован', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await expand(user, 'Backend')
    await screen.findByRole('checkbox', { name: 'Буткемп' })
    expect(screen.queryByRole('button', { name: 'Раскрыть: Буткемп' })).not.toBeInTheDocument()
    expect(screen.getByText('Буткемп, только целиком')).toBeInTheDocument()
    expect(screen.getByText('Только по назначению')).toBeInTheDocument()
    expect(await mark('Черновик курса')).toBeDisabled()
    expect(screen.getByText('Закрытых курсов отдельно: 2')).toBeInTheDocument()
  })

  it('перед удалением правила со сроком спрашивает, при отказе ничего не меняет', async () => {
    const user = userEvent.setup()
    const dated = rule('courses', 12, 'deny', { title: 'Express', expiresAt: '2030-01-01T00:00:00Z' })
    render(<Harness initial={[rule('roadmaps', 1), dated]} />)
    await user.click(await mark('Backend'))
    const alert = await screen.findByRole('alert')
    expect(within(alert).getByText('Express')).toBeInTheDocument()
    await user.click(within(alert).getByRole('button', { name: 'Отмена' }))
    expect(summary()).toEqual(['allow roadmaps:1', 'deny courses:12'])
    await user.click(await mark('Backend'))
    await user.click(within(await screen.findByRole('alert')).getByRole('button', { name: 'Удалить правила и продолжить' }))
    expect(summary()).toEqual(['allow roadmaps:1'])
  })

  it('поиск оставляет подходящие курсы и раскрывает их карту', async () => {
    const user = userEvent.setup()
    render(<Harness />)
    await user.type(await screen.findByLabelText('Поиск по роадмапам и курсам'), 'react')
    expect(await mark('React')).toBeInTheDocument()
    expect(screen.queryByRole('checkbox', { name: 'Backend' })).not.toBeInTheDocument()
  })

  it('при ошибке каталога показывает причину и даёт повторить', async () => {
    catalogFails = true
    const user = userEvent.setup()
    render(<Harness />)
    expect(await screen.findByText('Каталог недоступен')).toBeInTheDocument()
    catalogFails = false
    await user.click(screen.getByRole('button', { name: 'Загрузить снова' }))
    expect(await mark('Backend')).toBeInTheDocument()
  })
})
