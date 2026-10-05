import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Link from 'next/link'

import { CourseForm } from '@/components/content-management/CourseForm'
import { SectionForm } from '@/components/content-management/SectionForm'
import { LessonForm } from '@/components/content-management/LessonForm'
import type { Course, Lesson, Roadmap, RoadmapNode, Section } from '@/payload-types'

const navigation = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => navigation }))
vi.mock('next/link', async () => (await import('../helpers/component-mocks')).linkMock())
vi.mock('@/components/content-management/RichTextEditor', () => ({ RichTextEditor: () => <div>Редактор описания</div> }))
vi.mock('@/components/content-management/MediaPicker', () => ({ MediaPicker: () => <div>Обложка</div> }))
vi.mock('@/components/content-management/LessonBlocks', () => ({ LessonBlocks: () => <div>Материалы</div> }))

const timestamp = '2026-10-04T10:00:00.000Z'
const roadmap: Roadmap = { id: 1, title: 'Backend Node.js', slug: 'backend-nodejs', isPublished: true, updatedAt: timestamp, createdAt: timestamp }
const course: Course = { id: 5, title: 'Node.js', slug: 'nodejs', roadmap: 1, isPublished: true, updatedAt: timestamp, createdAt: timestamp }
const section: Section = { id: 8, title: 'Начало', slug: 'start', course: 5, isPublished: true, updatedAt: timestamp, createdAt: timestamp }
const content: Lesson['content'] = [{ blockType: 'video', id: 'video-1', title: 'Введение', videoUrl: 'https://example.com/video', displayMode: 'link' }]
const lesson: Lesson = { id: 15, title: 'Установка Node', slug: 'install-node', course: 5, section: 8, description: 'Подготовка окружения', content, updatedAt: timestamp, createdAt: timestamp }

function mockSaved(doc: Course | Lesson | Section) {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ doc }), { status: 200 }))
}

function requestBody() {
  const [url, init] = vi.mocked(fetch).mock.calls.at(-1) ?? []
  return { url, method: init?.method, body: JSON.parse(String(init?.body)) as Record<string, unknown> }
}

describe('формы управления учебным контентом', () => {
  beforeEach(() => {
    vi.clearAllMocks()
    vi.stubGlobal('fetch', vi.fn())
  })

  it('создаёт черновик курса с числовыми связями и автоматически создаваемым адресом', async () => {
    const user = userEvent.setup()
    mockSaved({ ...course, isPublished: false })
    render(<CourseForm roadmaps={[roadmap]} nodes={[]} courses={[]} defaultRoadmap={1} />)
    await user.type(screen.getByLabelText('Название курса'), 'Node.js')
    await user.click(screen.getByRole('button', { name: 'Создать черновик' }))
    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('/manage/courses/5'))
    const request = requestBody()
    expect(request.url).toBe('/api/manage/content/courses')
    expect(request.method).toBe('POST')
    expect(request.body).toMatchObject({ title: 'Node.js', roadmap: 1, roadmapNode: null, isPublished: false, estimatedHours: null, order: 0 })
    expect(request.body).not.toHaveProperty('slug')
    expect(request.body).not.toHaveProperty('expectedUpdatedAt')
    expect(screen.queryByRole('link', { name: 'Открыть сохранённую версию' })).not.toBeInTheDocument()
  })

  it.each(['courses', 'lessons', 'sections'] as const)('%s: повтор создания после потери ответа использует тот же ключ и данные', async (collection) => {
    const user = userEvent.setup()
    vi.mocked(fetch).mockRejectedValueOnce(new TypeError('Failed to fetch'))
    const doc = collection === 'courses' ? { ...course, isPublished: false } : collection === 'lessons' ? lesson : { ...section, isPublished: false }
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ doc }), { status: 200 }))
    render(collection === 'courses'
      ? <CourseForm roadmaps={[roadmap]} nodes={[]} courses={[]} defaultRoadmap={1} />
      : collection === 'lessons' ? <LessonForm course={course} sections={[section]} /> : <SectionForm courseId={5} />)
    const label = collection === 'courses' ? 'Название курса' : collection === 'lessons' ? 'Название урока' : 'Название раздела'
    await user.type(screen.getByLabelText(label), 'Введение')
    expect(screen.queryByLabelText('Адрес курса')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Адрес урока')).not.toBeInTheDocument()
    expect(screen.queryByLabelText('Адрес')).not.toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Создать черновик' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Нет соединения'))
    await user.click(screen.getByRole('button', { name: 'Создать черновик' }))
    await waitFor(() => expect(screen.getByRole('status')).toBeInTheDocument())
    const first = vi.mocked(fetch).mock.calls[0][1]
    const retry = vi.mocked(fetch).mock.calls[1][1]
    const key = new Headers(first?.headers).get('Idempotency-Key')
    expect(key).toMatch(/^[0-9a-f]{8}-[0-9a-f]{4}-4[0-9a-f]{3}-[89ab][0-9a-f]{3}-[0-9a-f]{12}$/)
    expect(new Headers(retry?.headers).get('Idempotency-Key')).toBe(key)
    expect(retry?.body).toBe(first?.body)
    expect(JSON.parse(String(first?.body))).not.toHaveProperty('slug')
  })

  it('фильтрует темы по роадмапу и сбрасывает тему при его смене', async () => {
    const user = userEvent.setup()
    const node: RoadmapNode = { id: 11, nodeId: 'topic-node', label: 'Node.js', nodeType: 'topic', roadmap: 1, positionX: 0, positionY: 0, updatedAt: timestamp, createdAt: timestamp }
    render(<CourseForm roadmaps={[roadmap, { ...roadmap, id: 2, title: 'Другой роадмап' }]} nodes={[node, { ...node, id: 12, roadmap: 2, label: 'Другая тема' }]} courses={[]} defaultRoadmap={1} defaultNode={11} />)
    expect(screen.queryByRole('option', { name: 'Другая тема' })).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Роадмап'), '2')
    expect(screen.getByLabelText('Тема на карте')).toHaveValue('')
    expect(screen.queryByRole('option', { name: 'Node.js' })).not.toBeInTheDocument()
    expect(screen.getByRole('option', { name: 'Другая тема' })).toBeInTheDocument()
  })

  it('не теряет введённый урок при конфликте версий', async () => {
    const user = userEvent.setup()
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: 'Материал изменён в другой вкладке.' }), { status: 409 }))
    render(<LessonForm lesson={lesson} course={course} sections={[section]} />)
    await user.type(screen.getByLabelText('Название урока'), ' — новая версия')
    await user.click(screen.getByRole('button', { name: 'Сохранить черновик' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('другой вкладке'))
    expect(screen.getByLabelText('Название урока')).toHaveValue('Установка Node — новая версия')
    expect(requestBody()).toMatchObject({ url: '/api/manage/content/lessons/15', method: 'PATCH', body: { course: 5, section: 8, expectedUpdatedAt: timestamp, slug: 'install-node', content } })
    expect(new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers).has('Idempotency-Key')).toBe(false)
    expect(navigation.replace).not.toHaveBeenCalled()
    expect(screen.getByText('Есть несохранённые изменения')).toBeInTheDocument()
  })

  it('сохраняет пустую секцию как null и использует новую версию документа при следующем сохранении', async () => {
    const user = userEvent.setup()
    const nextTimestamp = '2026-10-04T10:01:00.000Z'
    mockSaved({ ...lesson, section: null, updatedAt: nextTimestamp })
    render(<LessonForm lesson={lesson} course={course} sections={[section, { ...section, id: 9, course: 99, title: 'Чужой раздел' }]} />)
    expect(screen.queryByRole('option', { name: 'Чужой раздел' })).not.toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Раздел курса'), '')
    await user.click(screen.getByRole('button', { name: 'Сохранить черновик' }))
    await waitFor(() => expect(navigation.refresh).toHaveBeenCalledOnce())
    expect(requestBody().body.section).toBeNull()
    await user.type(screen.getByLabelText('Название урока'), ' 2')
    await user.click(screen.getByRole('button', { name: 'Сохранить черновик' }))
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    expect(requestBody().body.expectedUpdatedAt).toBe(nextTimestamp)
  })

  it('объясняет потерю сети и сохраняет черновик в форме', async () => {
    const user = userEvent.setup()
    vi.mocked(fetch).mockRejectedValue(new TypeError('Failed to fetch'))
    render(<LessonForm lesson={lesson} course={course} sections={[section]} />)
    await user.type(screen.getByLabelText('Краткое описание'), ' и npm')
    await user.click(screen.getByRole('button', { name: 'Сохранить черновик' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('Нет соединения'))
    expect(screen.getByLabelText('Краткое описание')).toHaveValue('Подготовка окружения и npm')
    expect(screen.getByRole('button', { name: 'Сохранить черновик' })).toBeEnabled()
  })

  it('создаёт раздел без перехода и очищает форму для следующего раздела', async () => {
    const user = userEvent.setup()
    mockSaved({ ...section, title: 'HTTP', isPublished: false })
    render(<SectionForm courseId={5} />)
    await user.type(screen.getByLabelText('Название раздела'), 'HTTP')
    await user.click(screen.getByRole('button', { name: 'Создать черновик' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('HTTP'))
    expect(requestBody().body).toMatchObject({ title: 'HTTP', course: 5, isPublished: false })
    expect(screen.getByLabelText('Название раздела')).toHaveValue('')
    expect(navigation.refresh).toHaveBeenCalledOnce()
    expect(navigation.replace).not.toHaveBeenCalled()
  })

  it('следующий новый раздел использует новый ключ создания после успешного сохранения предыдущего', async () => {
    const user = userEvent.setup()
    mockSaved({ ...section, isPublished: false })
    render(<SectionForm courseId={5} />)
    await user.type(screen.getByLabelText('Название раздела'), 'HTTP')
    await user.click(screen.getByRole('button', { name: 'Создать черновик' }))
    await waitFor(() => expect(screen.getByLabelText('Название раздела')).toHaveValue(''))
    await user.type(screen.getByLabelText('Название раздела'), 'Базы данных')
    await user.click(screen.getByRole('button', { name: 'Создать черновик' }))
    await waitFor(() => expect(fetch).toHaveBeenCalledTimes(2))
    const first = new Headers(vi.mocked(fetch).mock.calls[0][1]?.headers).get('Idempotency-Key')
    const second = new Headers(vi.mocked(fetch).mock.calls[1][1]?.headers).get('Idempotency-Key')
    expect(second).toBeTruthy()
    expect(second).not.toBe(first)
    expect(vi.mocked(fetch).mock.calls[1][1]?.method).toBe('POST')
  })

  it('запрашивает подтверждение выхода только при несохранённых изменениях', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<LessonForm lesson={lesson} course={course} sections={[section]} />)
    await user.type(screen.getByLabelText('Название урока'), ' 2')
    await user.click(screen.getByRole('button', { name: 'Назад к программе' }))
    expect(confirm).toHaveBeenCalledOnce()
    expect(navigation.push).not.toHaveBeenCalled()
    const unload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(true)
    confirm.mockReturnValue(true)
    await user.click(screen.getByRole('button', { name: 'Назад к программе' }))
    expect(navigation.push).toHaveBeenCalledWith('/manage/courses/5')
    confirm.mockRestore()
  })

  it('после сохранения снимает предупреждение beforeunload и не предупреждает при выходе', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm')
    mockSaved(lesson)
    render(<LessonForm lesson={lesson} course={course} sections={[section]} />)
    await user.type(screen.getByLabelText('Название урока'), ' 2')
    await user.click(screen.getByRole('button', { name: 'Сохранить черновик' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('сохранён'))
    const unload = new Event('beforeunload', { cancelable: true })
    window.dispatchEvent(unload)
    expect(unload.defaultPrevented).toBe(false)
    await user.click(screen.getByRole('button', { name: 'Назад к программе' }))
    expect(confirm).not.toHaveBeenCalled()
    confirm.mockRestore()
  })

  it('доступ ученикам включается явным действием и родитель курса закрыт для переноса', async () => {
    const user = userEvent.setup()
    mockSaved({ ...course, isPublished: true })
    render(<CourseForm course={{ ...course, isPublished: false }} roadmaps={[roadmap]} nodes={[]} courses={[]} />)
    expect(screen.getByLabelText('Роадмап')).toBeDisabled()
    await user.click(screen.getByLabelText('Опубликовать курс'))
    await user.click(screen.getByRole('button', { name: 'Сохранить и опубликовать' }))
    await waitFor(() => expect(screen.getByRole('status')).toHaveTextContent('опубликован'))
    expect(requestBody().body.isPublished).toBe(true)
    expect(screen.getByRole('link', { name: 'Открыть сохранённую версию' })).toHaveAttribute('href', '/courses/nodejs')
  })

  it('показывает лимиты описаний и блокирует редактирование во время сохранения', async () => {
    render(<LessonForm lesson={lesson} course={course} sections={[section]} />)
    expect(screen.getByLabelText('Краткое описание')).toHaveAttribute('maxlength', '300')
    vi.mocked(fetch).mockImplementation(() => new Promise(() => {}))
    fireEvent.submit(screen.getByRole('form'))
    await waitFor(() => expect(screen.getByRole('button', { name: 'Сохраняем…' })).toBeDisabled())
    expect(screen.getByLabelText('Название урока')).toBeDisabled()
  })

  it('не считает успешным ответ с чужим id и оставляет введённые данные', async () => {
    const user = userEvent.setup()
    mockSaved({ ...lesson, id: 999 })
    render(<LessonForm lesson={lesson} course={course} sections={[section]} />)
    await user.type(screen.getByLabelText('Название урока'), ' 2')
    await user.click(screen.getByRole('button', { name: 'Сохранить черновик' }))
    await waitFor(() => expect(screen.getByRole('alert')).toHaveTextContent('не подтвердил'))
    expect(screen.getByLabelText('Название урока')).toHaveValue('Установка Node 2')
    expect(navigation.replace).not.toHaveBeenCalled()
  })

  it('подтверждает переход по ссылке при двух изменённых inline-разделах один раз', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(true)
    render(<><SectionForm section={section} courseId={5} /><SectionForm section={{ ...section, id: 9, title: 'HTTP' }} courseId={5} /><Link href="/manage" onClick={(event) => event.preventDefault()}>К курсам</Link></>)
    const names = screen.getAllByLabelText('Название раздела')
    await user.type(names[0], ' 2')
    await user.type(names[1], ' 2')
    await user.click(screen.getByRole('link', { name: 'К курсам' }))
    expect(confirm).toHaveBeenCalledOnce()
    confirm.mockRestore()
  })

  it('редактирует раздел с исходным адресом и контрольной версией', async () => {
    const user = userEvent.setup()
    mockSaved(section)
    render(<SectionForm section={section} courseId={5} />)
    await user.type(screen.getByLabelText('Название раздела'), ' 2')
    await user.click(screen.getByRole('button', { name: 'Сохранить и опубликовать' }))
    await waitFor(() => expect(navigation.refresh).toHaveBeenCalledOnce())
    expect(requestBody()).toMatchObject({ url: '/api/manage/content/sections/8', method: 'PATCH', body: { course: 5, slug: 'start', expectedUpdatedAt: timestamp } })
    expect(screen.getByLabelText('Описание раздела')).toHaveAttribute('maxlength', '500')
  })
})
