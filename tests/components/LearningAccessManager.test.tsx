import { beforeEach, describe, expect, it, vi } from 'vitest'
import { fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { LearningAccessManager } from '@/components/learning-access/LearningAccessManager'
import { maximumLearningRules, type AssignmentSnapshot } from '@/components/learning-access/contracts'

const original: AssignmentSnapshot = { userId: 34, student: { id: 34, title: 'Александр Студент' }, mode: 'all', catalogVisibility: 'catalog', trainerMode: 'all', guidesMode: 'assigned', revision: 'a'.repeat(64), rules: [] }
let saved: Record<string, unknown> | null
let saveError: string | null
let saveStatus = 409
let snapshotError: { error: string; code: string } | null = null
const fetchMock = vi.fn(async (url: string | URL | Request, init?: RequestInit) => {
  const address = new URL(String(url), 'http://localhost')
  if (init?.method === 'PUT') {
    saved = JSON.parse(String(init.body)) as Record<string, unknown>
    if (saveError) return Response.json({ error: saveError }, { status: saveStatus })
    return Response.json({ ...original, ...saved, revision: 'b'.repeat(64) })
  }
  if (init?.method === 'POST') return Response.json({ courses: [{ id: 1, title: 'Node.js', access: 'full', visible: true }, { id: 2, title: 'React', access: 'closed', visible: false }], hiddenCount: 1, availableCount: 1, totalCount: 2, page: Number(address.searchParams.get('page') ?? 1), hasNextPage: false, trainer: { tasks: [{ id: 90, title: 'Тестовая задача', access: 'open', visible: true }], availableCount: 1, totalCount: 30, page: Number(address.searchParams.get('trainerPage') ?? 1), hasNextPage: Number(address.searchParams.get('trainerPage') ?? 1) === 1 }, guides: { items: [{ id: 7, title: 'Регистрация и работа в LinkedIn', access: 'closed' }], availableCount: 0, totalCount: 1 } })
  if (address.searchParams.get('kind') === 'students') return Response.json({ docs: [{ id: 34, title: 'Александр (alexander@example.test)' }, { id: 35, title: 'Другой ученик' }], page: 1, hasNextPage: false })
  if (address.searchParams.get('kind') === 'targets' && address.searchParams.get('type') === 'trainer-tasks') return Response.json({ docs: [{ id: 80, title: 'Замыкания: счётчик' }], page: 1, hasNextPage: false })
  if (address.searchParams.get('kind') === 'targets' && address.searchParams.get('type') === 'guides') return Response.json({ docs: [{ id: 7, title: 'Регистрация и работа в LinkedIn', published: true }], page: 1, hasNextPage: false })
  if (address.searchParams.get('kind') === 'targets' && address.searchParams.get('type') === 'trainer-topics') return Response.json({ docs: [{ id: 81, title: 'Замыкания' }], page: 1, hasNextPage: false })
  if (address.searchParams.get('kind') === 'targets') return Response.json({ docs: [{ id: address.searchParams.get('type') === 'roadmaps' ? 1 : 20, title: address.searchParams.get('type') === 'roadmaps' ? 'Backend Node.js' : 'Курс по Express' }], page: 1, hasNextPage: false })
  return snapshotError ? Response.json(snapshotError, { status: 409 }) : Response.json(original)
})

beforeEach(() => { vi.stubGlobal('fetch', fetchMock); fetchMock.mockClear(); saved = null; saveError = null; saveStatus = 409; snapshotError = null })

describe('админ назначает обучение', () => {
  it('при удалённой цели даёт ссылку на список назначений и не показывает сохранение', async () => {
    snapshotError = { error: 'У назначения удалена цель. Удалите правило с пустой целью.', code: 'orphaned-assignment' }
    render(<LearningAccessManager initialUserId={34} />)
    await screen.findByRole('alert')
    expect(screen.getByRole('link', { name: 'Открыть список назначений' })).toHaveAttribute('href', '/admin/collections/learning-access-grants?where[user][equals]=34')
    expect(screen.queryByRole('button', { name: 'Сохранить назначения' })).not.toBeInTheDocument()
  })

  it('показывает скрытый курс и задачи, листает тренажёр независимо от курсов', async () => {
    const user = userEvent.setup()
    render(<LearningAccessManager initialUserId={34} />)
    await screen.findByRole('heading', { name: 'Александр Студент' })
    await user.click(screen.getByRole('button', { name: 'Посмотреть доступ по курсам' }))
    await screen.findByText('Скрыты 1 неназначенных курсов.')
    await screen.findByText('Доступны 1 из 30 опубликованных задач.')
    const preview = screen.getByRole('region', { name: 'Предварительный просмотр доступа' })
    const pages = within(preview).getAllByRole('button', { name: 'Далее' })
    await user.click(pages[1])
    await waitFor(() => expect(fetchMock.mock.calls.some(([url, init]) => init?.method === 'POST' && String(url).includes('page=1&trainerPage=2'))).toBe(true))
    expect(within(preview).getByText('React')).toBeInTheDocument()
    expect(saved).toBeNull()
  })

  it('при отказе сервера сохраняет выбор и разрешает повторное сохранение', async () => {
    saveError = 'Не удалось сохранить назначения. Повторите попытку'
    saveStatus = 500
    const user = userEvent.setup()
    render(<LearningAccessManager initialUserId={34} />)
    await screen.findByRole('heading', { name: 'Александр Студент' })
    await user.click(screen.getByRole('radio', { name: /Тренажёр выключен/ }))
    await user.click(screen.getByRole('button', { name: 'Сохранить назначения' }))
    await screen.findByRole('alert')
    expect(screen.getByRole('radio', { name: /Тренажёр выключен/ })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Сохранить назначения' })).toBeEnabled()
    saveError = null
    await user.click(screen.getByRole('button', { name: 'Сохранить назначения' }))
    await screen.findByText(/Назначения сохранены/)
    expect(saved).toMatchObject({ trainerMode: 'disabled' })
  })

  it('сохраняет только видимость и тренажёр без изменения курсов, отмена возвращает оба режима', async () => {
    const user = userEvent.setup()
    render(<LearningAccessManager initialUserId={34} />)
    await screen.findByRole('heading', { name: 'Александр Студент' })
    await user.click(screen.getByRole('radio', { name: /Показывать только назначенное/ }))
    await user.click(screen.getByRole('radio', { name: /Тренажёр выключен/ }))
    expect(await screen.findByRole('button', { name: 'Другой ученик' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Отменить изменения' }))
    expect(screen.getByRole('radio', { name: /Показывать все программы/ })).toBeChecked()
    expect(screen.getByRole('radio', { name: /Весь опубликованный тренажёр/ })).toBeChecked()
    await user.click(screen.getByRole('radio', { name: /Показывать только назначенное/ }))
    await user.click(screen.getByRole('radio', { name: /Только назначенные задачи/ }))
    await user.click(screen.getByRole('button', { name: 'Сохранить назначения' }))
    await screen.findByText(/Назначения сохранены/)
    expect(saved).toMatchObject({ mode: 'all', catalogVisibility: 'assigned', trainerMode: 'assigned', rules: [] })
    expect(screen.getByRole('button', { name: 'Сохранить назначения' })).toBeDisabled()
  })

  it('назначает отдельную задачу с фильтром по теме тренажёра', async () => {
    const user = userEvent.setup()
    render(<LearningAccessManager initialUserId={34} />)
    await screen.findByRole('heading', { name: 'Александр Студент' })
    await user.selectOptions(screen.getByLabelText('Материал'), 'trainer-tasks')
    await screen.findByText('Замыкания: счётчик')
    await user.click(screen.getByText('Ограничить поиск: выбрать тему тренажёра'))
    await screen.findByRole('option', { name: 'Замыкания' })
    await user.selectOptions(screen.getByLabelText('Родительский материал'), '81')
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => String(url).includes('type=trainer-tasks') && String(url).includes('parent=81'))).toBe(true))
    await user.click(await screen.findByRole('button', { name: 'Открыть' }))
    await user.click(screen.getByRole('button', { name: 'Сохранить назначения' }))
    await screen.findByText(/Назначения сохранены/)
    expect(saved).toMatchObject({ rules: [{ target: { relationTo: 'trainer-tasks', value: 80 }, effect: 'allow' }] })
  })

  it('сохраняет режим и правила одним действием, до сохранения блокирует смену ученика', async () => {
    const user = userEvent.setup()
    render(<LearningAccessManager initialUserId={34} />)
    await screen.findByRole('heading', { name: 'Александр Студент' })
    await user.click(screen.getByRole('radio', { name: /Только назначенные материалы/ }))
    await user.click(await screen.findByRole('button', { name: 'Открыть' }))
    expect(await screen.findByRole('button', { name: 'Другой ученик' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Сохранить назначения' }))
    await screen.findByText(/Назначения сохранены/)
    expect(saved).toMatchObject({ userId: 34, mode: 'assigned', revision: original.revision, rules: [{ target: { relationTo: 'roadmaps', value: 1 }, effect: 'allow' }] })
    expect(screen.getByRole('button', { name: 'Сохранить назначения' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Другой ученик' })).toBeEnabled()
  })

  it('показывает предварительный доступ и сбрасывает его после изменения назначения', async () => {
    const user = userEvent.setup()
    render(<LearningAccessManager initialUserId={34} />)
    await screen.findByRole('heading', { name: 'Александр Студент' })
    await user.click(screen.getByRole('button', { name: 'Посмотреть доступ по курсам' }))
    await screen.findByText('Доступны 1 из 2 опубликованных курсов.')
    expect(within(screen.getByRole('region', { name: 'Предварительный просмотр доступа' })).getByText('Скрыт')).toBeInTheDocument()
    await user.click(screen.getByRole('radio', { name: /Только назначенные материалы/ }))
    expect(screen.queryByText('Доступны 1 из 2 опубликованных курсов.')).not.toBeInTheDocument()
    expect(saved).toBeNull()
  })

  it('при конфликте не сбрасывает правки, позволяет отменить их и загрузить текущие', async () => {
    saveError = 'Другой администратор уже изменил назначения'
    const user = userEvent.setup()
    render(<LearningAccessManager initialUserId={34} />)
    await screen.findByRole('heading', { name: 'Александр Студент' })
    await user.click(screen.getByRole('radio', { name: /Только назначенные материалы/ }))
    await user.click(screen.getByRole('button', { name: 'Сохранить назначения' }))
    await screen.findByRole('alert')
    expect(screen.getByRole('radio', { name: /Только назначенные материалы/ })).toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Отменить изменения' }))
    expect(screen.getByRole('radio', { name: /Все опубликованные материалы/ })).toBeChecked()
    expect(screen.getByRole('button', { name: 'Сохранить назначения' })).toBeDisabled()
  })

  it('гайды по умолчанию закрыты: выдаёт отдельный гайд назначением, режим гайдов не меняет', async () => {
    const user = userEvent.setup()
    render(<LearningAccessManager initialUserId={34} />)
    await screen.findByRole('heading', { name: 'Александр Студент' })
    expect(screen.getByRole('radio', { name: /Только назначенные гайды/ })).toBeChecked()
    await user.click(screen.getByRole('button', { name: 'Посмотреть доступ по курсам' }))
    const guides = await screen.findByText('Доступны 0 из 1 опубликованных гайдов.')
    expect(within(guides.parentElement as HTMLElement).getByText('Закрыт')).toBeInTheDocument()
    await user.selectOptions(screen.getByLabelText('Материал'), 'guides')
    expect(screen.queryByText(/Ограничить поиск/)).not.toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'Открыть' }))
    await user.click(screen.getByRole('button', { name: 'Сохранить назначения' }))
    await screen.findByText(/Назначения сохранены/)
    expect(saved).toMatchObject({ guidesMode: 'assigned', rules: [{ target: { relationTo: 'guides', value: 7 }, effect: 'allow' }] })
  })

  it('открывает все гайды режимом и возвращает режим отменой', async () => {
    const user = userEvent.setup()
    render(<LearningAccessManager initialUserId={34} />)
    await screen.findByRole('heading', { name: 'Александр Студент' })
    await user.click(screen.getByRole('radio', { name: /Все опубликованные гайды/ }))
    await user.click(screen.getByRole('button', { name: 'Отменить изменения' }))
    expect(screen.getByRole('radio', { name: /Только назначенные гайды/ })).toBeChecked()
    await user.click(screen.getByRole('radio', { name: /Все опубликованные гайды/ }))
    await user.click(screen.getByRole('button', { name: 'Сохранить назначения' }))
    await screen.findByText(/Назначения сохранены/)
    expect(saved).toMatchObject({ guidesMode: 'all', trainerMode: 'all', rules: [] })
  })

  it('после смены типа не позволяет добавить старую цель под новым типом', async () => {
    render(<LearningAccessManager initialUserId={34} />)
    await screen.findByRole('button', { name: 'Открыть' })
    fireEvent.change(screen.getByLabelText('Материал'), { target: { value: 'courses' } })
    expect(screen.queryByRole('button', { name: 'Открыть' })).not.toBeInTheDocument()
    await screen.findByText('Курс по Express')
    fireEvent.click(screen.getByRole('button', { name: 'Открыть' }))
    await userEvent.click(screen.getByRole('button', { name: 'Сохранить назначения' }))
    await waitFor(() => expect(saved).toMatchObject({ rules: [{ target: { relationTo: 'courses', value: 20 } }] }))
  })
})

describe('назначения: выбор ученика, ошибки и правка правил', () => {
  type Override = (address: URL, init?: RequestInit) => Response | undefined
  /** Свой ответ для части запросов, остальное — общий макет API выше. */
  function api(override: Override) {
    vi.stubGlobal('fetch', vi.fn(async (url: string | URL | Request, init?: RequestInit) => override(new URL(String(url), 'http://localhost'), init) ?? fetchMock(url, init)))
  }
  const rule = { target: { relationTo: 'roadmaps' as const, value: 1 }, title: 'Backend Node.js', effect: 'allow' as const, startsAt: '2026-11-01T07:00:00.000Z', expiresAt: null, note: '' }
  const withRules = (rules: AssignmentSnapshot['rules']) => api((address, init) => !init?.method && address.searchParams.has('user') ? Response.json({ ...original, rules }) : undefined)
  const rulesList = () => screen.getByRole('region', { name: 'Список назначений' })

  it('выбор ученика из списка загружает его назначения', async () => {
    api((address, init) => !init?.method && address.searchParams.get('user') === '35' ? Response.json({ ...original, userId: 35, student: { id: 35, title: 'Другой ученик' } }) : undefined)
    const user = userEvent.setup()
    render(<LearningAccessManager />)
    expect(screen.getByText('Выберите ученика, которому хотите открыть обучение.')).toBeInTheDocument()
    await user.click(await screen.findByRole('button', { name: 'Другой ученик' }))
    expect(await screen.findByRole('heading', { name: 'Другой ученик' })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Другой ученик' })).toHaveAttribute('aria-pressed', 'true')
  })

  it('ошибка поиска учеников видна текстом сервера, без текста — общей фразой', async () => {
    let message: unknown = 'Нет доступа к списку учеников'
    api((address) => address.searchParams.get('kind') === 'students' ? Response.json({ error: message }, { status: 403 }) : undefined)
    const { unmount } = render(<LearningAccessManager />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Нет доступа к списку учеников')
    expect(screen.queryByRole('button', { name: 'Другой ученик' })).not.toBeInTheDocument()
    unmount()

    message = { detail: 'internal' }
    render(<LearningAccessManager />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось выполнить запрос. Повторите попытку')
  })

  // Прокси перед приложением отвечает на 502/504 не JSON: фразу интерфейса не должна подменять ошибка парсера.
  it('ответ не в JSON (502 от прокси) показывается понятной фразой', async () => {
    api((address, init) => !init?.method && address.searchParams.has('user') ? new Response('<html>502 Bad Gateway</html>', { status: 502 }) : undefined)
    render(<LearningAccessManager initialUserId={34} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось выполнить запрос. Повторите попытку')
  })

  it('после сбоя загрузки назначений «Обновить назначения» загружает их снова', async () => {
    let fail = true
    api((address, init) => !init?.method && address.searchParams.has('user') && fail ? Response.json({ error: 'База недоступна' }, { status: 503 }) : undefined)
    const user = userEvent.setup()
    render(<LearningAccessManager initialUserId={34} />)
    expect(await screen.findByRole('alert')).toHaveTextContent('База недоступна')
    expect(screen.queryByRole('link', { name: 'Открыть список назначений' })).not.toBeInTheDocument()
    fail = false
    await user.click(screen.getByRole('button', { name: 'Обновить назначения' }))
    expect(await screen.findByRole('heading', { name: 'Александр Студент' })).toBeInTheDocument()
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('срок, действие и комментарий правила сохраняются; дата показывается в местном времени того же момента', async () => {
    withRules([rule])
    const user = userEvent.setup()
    render(<LearningAccessManager initialUserId={34} />)
    await screen.findByRole('heading', { name: 'Александр Студент' })
    const list = rulesList()
    const starts = within(list).getByLabelText<HTMLInputElement>('Начало доступа')
    expect(new Date(starts.value).toISOString()).toBe(rule.startsAt)
    expect(within(list).getByLabelText('Окончание доступа')).toHaveValue('')

    await user.selectOptions(within(list).getByLabelText('Действие'), 'deny')
    fireEvent.change(within(list).getByLabelText('Окончание доступа'), { target: { value: '2026-12-31T18:00' } })
    fireEvent.change(starts, { target: { value: '' } })
    await user.type(within(list).getByLabelText('Комментарий для администратора'), 'Пробный период')
    expect(screen.getByText('Есть несохранённые изменения')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Сохранить назначения' }))
    await screen.findByText(/Назначения сохранены/)
    expect(saved).toMatchObject({ rules: [{ target: rule.target, effect: 'deny', startsAt: null, expiresAt: new Date('2026-12-31T18:00').toISOString(), note: 'Пробный период' }] })
  })

  it('удаление правила возвращает пустой список и уходит в сохранение', async () => {
    withRules([rule])
    const user = userEvent.setup()
    render(<LearningAccessManager initialUserId={34} />)
    await screen.findByRole('heading', { name: 'Александр Студент' })
    await user.click(screen.getByRole('button', { name: 'Удалить назначение Backend Node.js' }))
    expect(within(rulesList()).getByText(/Назначений пока нет/)).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Сохранить назначения' }))
    await screen.findByText(/Назначения сохранены/)
    expect(saved).toMatchObject({ rules: [] })
  })

  it('второе назначение на тот же материал не добавляется и объясняет, где его менять', async () => {
    withRules([rule])
    const user = userEvent.setup()
    render(<LearningAccessManager initialUserId={34} />)
    await user.click(await screen.findByRole('button', { name: 'Открыть' }))
    expect(screen.getByRole('alert')).toHaveTextContent('Для этого материала уже есть назначение. Измените действие в списке ниже.')
    expect(within(rulesList()).getAllByRole('listitem')).toHaveLength(1)
  })

  it('сверх предела назначений не добавляет и предлагает назначить крупнее', async () => {
    withRules(Array.from({ length: maximumLearningRules }, (_, index) => ({ ...rule, target: { relationTo: 'lessons' as const, value: 1000 + index }, title: `Урок ${index}`, startsAt: null })))
    const user = userEvent.setup()
    const { container } = render(<LearningAccessManager initialUserId={34} />)
    // Три сотни правил делают запросы по ролям медленными: ищем в панели добавления.
    await screen.findByText('Александр Студент', { selector: 'h2' }, { timeout: 5000 })
    const picker = container.querySelector('.learning-access__picker') as HTMLElement
    await user.click(await within(picker).findByRole('button', { name: 'Открыть' }, { timeout: 5000 }))
    expect(container.querySelector('[role="alert"]')).toHaveTextContent(`Можно сохранить не более ${maximumLearningRules} назначений`)
    expect(screen.getByText('Все изменения сохранены')).toBeInTheDocument()
  })

  it('поиск материала уходит на сервер с введённым текстом', async () => {
    const user = userEvent.setup()
    render(<LearningAccessManager initialUserId={34} />)
    await screen.findByRole('heading', { name: 'Александр Студент' })
    await user.type(screen.getByRole('searchbox', { name: 'Поиск по названию' }), 'Node')
    await waitFor(() => expect(fetchMock.mock.calls.some(([url]) => { const address = new URL(String(url), 'http://localhost'); return address.searchParams.get('kind') === 'targets' && address.searchParams.get('search') === 'Node' })).toBe(true))
  })

  it('с несохранёнными изменениями браузер предупреждает при уходе со страницы', async () => {
    const user = userEvent.setup()
    render(<LearningAccessManager initialUserId={34} />)
    await screen.findByRole('heading', { name: 'Александр Студент' })
    const leave = () => { const event = new Event('beforeunload', { cancelable: true }); window.dispatchEvent(event); return event.defaultPrevented }
    expect(leave()).toBe(false)
    await user.click(screen.getByRole('radio', { name: /Только назначенные материалы/ }))
    expect(leave()).toBe(true)
    await user.click(screen.getByRole('button', { name: 'Отменить изменения' }))
    expect(leave()).toBe(false)
  })
})
