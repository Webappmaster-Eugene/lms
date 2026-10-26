import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import Link from 'next/link'

import type { Course, Lesson, Roadmap, RoadmapNode, Section } from '@/payload-types'

const navigation = vi.hoisted(() => ({ replace: vi.fn(), refresh: vi.fn(), push: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => navigation }))
vi.mock('next/link', async () => (await import('../helpers/component-mocks')).linkMock())
// Lexical и выбор файлов проверяются своими тестами; здесь важны поля формы и запрос.
vi.mock('@/components/content-management/RichTextEditor', () => ({ RichTextEditor: () => <div>Редактор описания</div>, emptyRichText: () => ({ root: { children: [] } }) }))
vi.mock('@/components/content-management/MediaPicker', () => ({ MediaPicker: () => <div>Обложка</div> }))

const { CourseForm } = await import('@/components/content-management/CourseForm')
const { LessonForm } = await import('@/components/content-management/LessonForm')
const { SectionForm } = await import('@/components/content-management/SectionForm')
const { saveContent } = await import('@/components/content-management/form-utils')

const timestamp = '2026-10-04T10:00:00.000Z'
const roadmap: Roadmap = { id: 1, title: 'Backend Node.js', slug: 'backend-nodejs', isPublished: true, updatedAt: timestamp, createdAt: timestamp }
const course: Course = { id: 5, title: 'Node.js', slug: 'nodejs', roadmap: 1, isPublished: true, updatedAt: timestamp, createdAt: timestamp }
const section: Section = { id: 8, title: 'Начало', slug: 'start', course: 5, isPublished: true, updatedAt: timestamp, createdAt: timestamp }
const lesson: Lesson = { id: 15, title: 'Установка Node', slug: 'install-node', course: 5, section: 8, content: [], updatedAt: timestamp, createdAt: timestamp }
const node = (id: number, label: string, nodeType: RoadmapNode['nodeType'], roadmapId = 1): RoadmapNode => ({
  id, nodeId: `node-${id}`, label, nodeType, roadmap: roadmapId, positionX: 0, positionY: 0, updatedAt: timestamp, createdAt: timestamp,
})

function respond(body: unknown, status = 200) {
  vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify(body), { status }))
}

function lastRequest() {
  const [url, init] = vi.mocked(fetch).mock.calls.at(-1) ?? []
  return { url, method: init?.method, body: JSON.parse(String(init?.body)) as Record<string, unknown> }
}

beforeEach(() => {
  vi.clearAllMocks()
  vi.restoreAllMocks()
  vi.stubGlobal('fetch', vi.fn())
})

describe('форма курса', () => {
  it('сохраняет часы, порядок, тему, пререквизиты и новый адрес', async () => {
    const user = userEvent.setup()
    respond({ doc: { ...course, slug: 'node-js' } })
    const nodes = [node(10, 'Основы', 'category'), node(11, 'Node.js', 'topic'), node(12, 'HTTP', 'subtopic'), node(13, 'Чужая тема', 'topic', 2)]
    const others = [{ id: 5, title: 'Node.js' }, { id: 3, title: 'JavaScript' }, { id: 4, title: 'Git' }, { id: 6, title: 'Linux' }]
    render(<CourseForm course={{ ...course, prerequisites: [{ ...course, id: 3, title: 'JavaScript' }, 4] }} roadmaps={[roadmap]} nodes={nodes} courses={others} />)

    const topic = screen.getByLabelText('Тема на карте')
    expect(within(topic).getAllByRole('option').map((option) => option.textContent)).toEqual(['Без привязки к теме', 'Node.js', 'HTTP'])
    await user.selectOptions(topic, '12')
    await user.clear(screen.getByLabelText('Время на курс, часов'))
    await user.type(screen.getByLabelText('Время на курс, часов'), '12.5')
    await user.clear(screen.getByLabelText('Порядок в роадмапе'))
    await user.type(screen.getByLabelText('Порядок в роадмапе'), '2')
    // Сам курс не может быть своим пререквизитом — его в списке нет.
    expect(screen.queryByRole('checkbox', { name: 'Node.js' })).not.toBeInTheDocument()
    await user.click(screen.getByRole('checkbox', { name: 'JavaScript' }))
    await user.click(screen.getByRole('checkbox', { name: 'Linux' }))
    await user.clear(screen.getByLabelText('Адрес курса'))
    await user.type(screen.getByLabelText('Адрес курса'), ' node-js ')
    await user.click(screen.getByRole('button', { name: 'Сохранить и опубликовать' }))

    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('/manage/courses/5'))
    expect(lastRequest()).toMatchObject({
      url: '/api/manage/content/courses/5',
      method: 'PATCH',
      body: { roadmapNode: 12, estimatedHours: 12.5, order: 2, prerequisites: [4, 6], slug: 'node-js', expectedUpdatedAt: timestamp },
    })
    expect(screen.getByText('Изменение адреса нарушит ранее сохранённые ссылки.')).toBeInTheDocument()
  })

  it('категория остаётся в списке тем, только если курс уже к ней привязан', () => {
    render(<CourseForm course={{ ...course, roadmapNode: 10 }} roadmaps={[roadmap]} nodes={[node(10, 'Основы', 'category'), node(14, 'Прочее', 'category')]} courses={[]} />)

    const options = within(screen.getByLabelText('Тема на карте')).getAllByRole('option').map((option) => option.textContent)
    expect(options).toEqual(['Без привязки к теме', 'Основы'])
  })

  it('без других курсов объясняет, что пререквизиты выбрать не из чего', () => {
    render(<CourseForm roadmaps={[roadmap]} nodes={[]} courses={[]} />)

    expect(screen.getByText('Других курсов пока нет.')).toBeInTheDocument()
    expect(screen.getByText('Адрес создастся автоматически. Его можно изменить после первого сохранения.')).toBeInTheDocument()
  })

  it('публикация в черновом роадмапе предупреждает, что ученики курс не увидят', async () => {
    const user = userEvent.setup()
    render(<CourseForm roadmaps={[{ ...roadmap, isPublished: false }]} nodes={[]} courses={[]} defaultRoadmap={1} />)

    expect(screen.getByRole('option', { name: 'Backend Node.js (черновик)' })).toBeInTheDocument()
    expect(screen.getByText('Черновик виден только администраторам. Можно спокойно подготовить программу.')).toBeInTheDocument()
    await user.click(screen.getByLabelText('Опубликовать курс'))

    expect(screen.getByText('Сначала опубликуйте роадмап, чтобы открыть курс ученикам.')).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Сохранить и опубликовать' })).toBeInTheDocument()
  })

  it('«Назад к курсам» без правок уходит сразу, с правками — только после подтверждения', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<CourseForm course={course} roadmaps={[roadmap]} nodes={[]} courses={[]} />)

    await user.click(screen.getByRole('button', { name: 'Назад к курсам' }))
    expect(confirm).not.toHaveBeenCalled()
    expect(navigation.push).toHaveBeenLastCalledWith('/manage')

    navigation.push.mockClear()
    await user.type(screen.getByLabelText('Название курса'), ' 2')
    await user.click(screen.getByRole('button', { name: 'Назад к курсам' }))
    expect(confirm).toHaveBeenCalledWith('Есть несохранённые изменения. Выйти без сохранения?')
    expect(navigation.push).not.toHaveBeenCalled()
  })

  it('объясняет отказ сервера его словами и не уходит со страницы', async () => {
    const user = userEvent.setup()
    respond({ error: 'Курс с таким адресом уже есть.' }, 422)
    render(<CourseForm course={course} roadmaps={[roadmap]} nodes={[]} courses={[]} />)

    await user.click(screen.getByRole('button', { name: 'Сохранить и опубликовать' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Курс с таким адресом уже есть.')
    expect(navigation.replace).not.toHaveBeenCalled()
  })
})

describe('форма урока', () => {
  it('сохраняет время, порядок, материалы и новый адрес урока', async () => {
    const user = userEvent.setup()
    respond({ doc: lesson })
    render(<LessonForm lesson={lesson} course={course} sections={[section]} />)

    await user.type(screen.getByLabelText('Время на урок, минут'), '45')
    await user.clear(screen.getByLabelText('Порядок в разделе'))
    await user.type(screen.getByLabelText('Порядок в разделе'), '3')
    await user.click(within(screen.getByRole('group', { name: 'Добавить материал' })).getByRole('button', { name: 'Ссылка' }))
    await user.type(screen.getByLabelText('Название ссылки *'), 'Документация')
    await user.type(screen.getByLabelText('Адрес ссылки *'), 'https://nodejs.org')
    await user.clear(screen.getByLabelText('Адрес урока'))
    await user.type(screen.getByLabelText('Адрес урока'), 'node-setup')
    await user.click(screen.getByRole('button', { name: 'Сохранить черновик' }))

    await waitFor(() => expect(navigation.replace).toHaveBeenCalledWith('/manage/lessons/15'))
    const { body } = lastRequest()
    expect(body).toMatchObject({ estimatedMinutes: 45, order: 3, slug: 'node-setup', course: 5 })
    expect(body.content).toEqual([expect.objectContaining({ blockType: 'link', title: 'Документация', url: 'https://nodejs.org', platform: 'other' })])
  })

  it.each([
    ['курс ещё черновик', { ...course, isPublished: false }, section],
    ['раздел ещё черновик', course, { ...section, isPublished: false }],
  ])('публикация урока предупреждает, когда %s', async (_case, lessonCourse, lessonSection) => {
    const user = userEvent.setup()
    render(<LessonForm lesson={lesson} course={lessonCourse} sections={[lessonSection]} />)

    await user.click(screen.getByLabelText('Опубликовать урок'))

    expect(screen.getByText('После сохранения урок станет доступен ученикам в опубликованном курсе.')).toBeInTheDocument()
    expect(screen.getByText('Сначала опубликуйте курс и выбранный раздел.')).toBeInTheDocument()
  })

  it('урок без раздела в опубликованном курсе публикуется без предупреждения', async () => {
    const user = userEvent.setup()
    render(<LessonForm course={course} sections={[section]} />)

    await user.click(screen.getByLabelText('Опубликовать урок'))

    expect(screen.queryByText('Сначала опубликуйте курс и выбранный раздел.')).not.toBeInTheDocument()
  })

  it('счётчик описания показывает, сколько символов осталось до лимита', async () => {
    const user = userEvent.setup()
    render(<LessonForm course={course} sections={[]} />)

    await user.type(screen.getByLabelText('Краткое описание'), 'Node')

    expect(screen.getByLabelText('Краткое описание')).toHaveAccessibleDescription('4 / 300')
  })
})

describe('форма раздела', () => {
  it('сохраняет описание, порядок, публикацию и адрес раздела', async () => {
    const user = userEvent.setup()
    respond({ doc: { ...section, isPublished: false } })
    render(<SectionForm section={section} courseId={5} />)

    await user.type(screen.getByLabelText('Описание раздела'), 'Первые шаги')
    expect(screen.getByLabelText('Описание раздела')).toHaveAccessibleDescription('11 / 500')
    await user.clear(screen.getByLabelText('Порядок в курсе'))
    await user.type(screen.getByLabelText('Порядок в курсе'), '4')
    await user.click(screen.getByLabelText('Опубликовать раздел'))
    await user.clear(screen.getByLabelText('Адрес'))
    await user.type(screen.getByLabelText('Адрес'), 'first-steps')
    await user.click(screen.getByRole('button', { name: 'Сохранить черновик' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Черновик раздела «Начало» сохранён.')
    expect(lastRequest().body).toMatchObject({ description: 'Первые шаги', order: 4, isPublished: false, slug: 'first-steps' })
  })
})

describe('сохранение учебного контента', () => {
  it('отказ без текста ошибки объясняется общим сообщением', async () => {
    respond({}, 500)

    await expect(saveContent('lessons', 15, {})).rejects.toThrow('Не удалось сохранить. Проверьте данные и попробуйте ещё раз.')
  })

  it('конфликт версий без текста от сервера всё равно просит сохранить правки', async () => {
    respond({}, 409)

    await expect(saveContent('lessons', 15, {})).rejects.toThrow('Материал изменён в другой вкладке. Ваши изменения остаются в форме.')
  })

  it('ответ не в JSON не выдаётся за успешное сохранение', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response('<html>502</html>', { status: 200 }))

    await expect(saveContent('sections', undefined, {}, 'key')).rejects.toThrow('Сервер не подтвердил сохранение. Проверьте соединение')
  })

  it.each([
    ['без версии', { id: 8, slug: 'start' }],
    ['без адреса', { id: 8, updatedAt: timestamp }],
    ['с нецелым id', { id: 8.5, updatedAt: timestamp, slug: 'start' }],
  ])('документ %s не считается сохранённым', async (_case, doc) => {
    respond({ doc })

    await expect(saveContent('sections', undefined, {})).rejects.toThrow('Сервер не подтвердил сохранение материала')
  })
})

describe('уход со страницы с несохранёнными правками', () => {
  async function dirtyForm() {
    const user = userEvent.setup()
    const view = render(<>
      <SectionForm section={section} courseId={5} />
      <Link href="/manage">К курсам</Link>
      <Link href="/manage/help" target="_blank">Справка</Link>
      <Link href="/manage/export" download>Выгрузка</Link>
    </>)
    await user.type(screen.getByLabelText('Название раздела'), ' 2')
    return view
  }

  it('отказ в подтверждении отменяет переход по ссылке', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await dirtyForm()

    const followed = fireEvent.click(screen.getByRole('link', { name: 'К курсам' }))

    expect(confirm).toHaveBeenCalledOnce()
    expect(followed).toBe(false)
  })

  it('согласие пропускает переход', async () => {
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    await dirtyForm()

    expect(fireEvent.click(screen.getByRole('link', { name: 'К курсам' }))).toBe(true)
  })

  it('новая вкладка, скачивание и клик с модификатором правки не теряют — подтверждения нет', async () => {
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    await dirtyForm()

    fireEvent.click(screen.getByRole('link', { name: 'Справка' }))
    fireEvent.click(screen.getByRole('link', { name: 'Выгрузка' }))
    fireEvent.click(screen.getByRole('link', { name: 'К курсам' }), { ctrlKey: true })
    fireEvent.click(screen.getByRole('link', { name: 'К курсам' }), { button: 1 })

    expect(confirm).not.toHaveBeenCalled()
  })
})
