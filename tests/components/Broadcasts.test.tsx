import { act, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'

const router = vi.hoisted(() => ({ push: vi.fn(), refresh: vi.fn(), replace: vi.fn() }))
vi.mock('next/navigation', () => ({ useRouter: () => router }))
vi.mock('next/link', async () => (await import('../helpers/component-mocks')).linkMock())

const { BroadcastActions } = await import('@/components/broadcasts/BroadcastActions')
const { BroadcastForm } = await import('@/components/broadcasts/BroadcastForm')
const { BroadcastStatusBadge, audienceLabel, broadcastDate } = await import('@/components/broadcasts/BroadcastStatusBadge')

/**
 * Рассылка уходит живым ученикам и не отзывается, поэтому каждое опасное
 * действие подтверждается, а любой отказ сервера или сети виден автору.
 */

type Route = (path: string, init?: RequestInit) => Response | Promise<Response>
let route: Route

beforeEach(() => {
  route = () => Response.json({ ok: true })
  vi.stubGlobal('fetch', vi.fn((path: string, init?: RequestInit) => Promise.resolve(route(path, init))))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
  vi.clearAllMocks()
})

const calls = () => vi.mocked(fetch).mock.calls.map(([path, init]) => [path, init?.method])
const actions = (props: Partial<Parameters<typeof BroadcastActions>[0]> = {}) => render(<BroadcastActions id={5} status="draft" estimatedRecipients={12} adminEmail="admin@lms.test" transportReady {...props} />)

describe('действия с рассылкой', () => {
  it('тест себе уходит без подтверждения и сообщает, куда смотреть', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm')
    actions()

    await user.click(screen.getByRole('button', { name: 'Отправить тест себе' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Тестовое письмо отправлено на admin@lms.test. Проверьте входящие и папку «Спам».')
    expect(calls()).toEqual([['/api/manage/broadcasts/5/test', 'POST']])
    expect(confirm).not.toHaveBeenCalled()
  })

  it('пока идёт действие, остальные кнопки заблокированы', async () => {
    const user = userEvent.setup()
    let finish: ((response: Response) => void) | undefined
    route = () => new Promise<Response>((resolve) => { finish = resolve })
    actions()

    await user.click(screen.getByRole('button', { name: 'Отправить тест себе' }))

    expect(screen.getByRole('button', { name: 'Запустить рассылку' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Удалить' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Отправить тест себе' })).toBeDisabled()
    await act(async () => { finish?.(Response.json({ ok: true })) })
    expect(screen.getByRole('button', { name: 'Удалить' })).toBeEnabled()
  })

  it('отказ почтового сервера показывается текстом сервера', async () => {
    const user = userEvent.setup()
    route = () => Response.json({ error: 'SMTP не ответил за 20 секунд' }, { status: 502 })
    actions()

    await user.click(screen.getByRole('button', { name: 'Отправить тест себе' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('SMTP не ответил за 20 секунд')
    expect(screen.queryByRole('status')).not.toBeInTheDocument()
  })

  it('без сети объясняет, что делать, а не молчит', async () => {
    const user = userEvent.setup()
    route = () => { throw new TypeError('Failed to fetch') }
    actions()

    await user.click(screen.getByRole('button', { name: 'Отправить тест себе' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Нет соединения с сервером. Проверьте сеть и повторите действие')
  })

  it.each([
    ['слишком длинный текст ошибки', () => Response.json({ error: 'x'.repeat(401) }, { status: 500 })],
    ['ответ не в JSON', () => new Response('<html>Bad Gateway</html>', { status: 502 })],
  ])('%s заменяется общим сообщением', async (_case, reply) => {
    const user = userEvent.setup()
    route = reply
    actions()

    await user.click(screen.getByRole('button', { name: 'Отправить тест себе' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось выполнить действие. Попробуйте ещё раз')
  })

  it('запуск сообщает размер очереди по ответу сервера и обновляет страницу', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    route = () => Response.json({ doc: { id: 5, recipientsTotal: 11 } })
    actions()

    await user.click(screen.getByRole('button', { name: 'Запустить рассылку' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Рассылка запущена, писем в очереди: 11. Письма уходят партиями примерно по 20 в минуту.')
    expect(calls()).toEqual([['/api/manage/broadcasts/5/send', 'POST']])
    expect(router.refresh).toHaveBeenCalledOnce()
  })

  it('без числа от сервера очередь оценивается по известному числу получателей', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    route = () => Response.json({ ok: true })
    actions()

    await user.click(screen.getByRole('button', { name: 'Запустить рассылку' }))

    expect(await screen.findByRole('status')).toHaveTextContent('писем в очереди: 12')
  })

  it('остановка требует подтверждения: отказ ничего не отправляет', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    actions({ status: 'sending' })

    await user.click(screen.getByRole('button', { name: 'Остановить' }))

    expect(confirm).toHaveBeenCalledWith('Остановить рассылку? Уже отправленные письма останутся у получателей, остальные не уйдут.')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('подтверждённая остановка отменяет неотправленные письма и обновляет страницу', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    actions({ status: 'sending' })

    await user.click(screen.getByRole('button', { name: 'Остановить' }))

    expect(await screen.findByRole('status')).toHaveTextContent('Рассылка остановлена.')
    expect(calls()).toEqual([['/api/manage/broadcasts/5/cancel', 'POST']])
    expect(router.refresh).toHaveBeenCalledOnce()
  })

  it('удаление черновика без подтверждения не происходит', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(false)
    actions()

    await user.click(screen.getByRole('button', { name: 'Удалить' }))

    expect(fetch).not.toHaveBeenCalled()
    expect(router.push).not.toHaveBeenCalled()
  })

  it('подтверждённое удаление уводит к списку рассылок', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    actions()

    await user.click(screen.getByRole('button', { name: 'Удалить' }))

    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/manage/broadcasts'))
    expect(calls()).toEqual([['/api/manage/broadcasts/5', 'DELETE']])
  })

  it('отказ в удалении оставляет автора на странице с объяснением', async () => {
    const user = userEvent.setup()
    vi.spyOn(window, 'confirm').mockReturnValue(true)
    route = () => Response.json({ error: 'Запущенную рассылку удалить нельзя' }, { status: 409 })
    actions()

    await user.click(screen.getByRole('button', { name: 'Удалить' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Запущенную рассылку удалить нельзя')
    expect(router.push).not.toHaveBeenCalled()
  })

  it('черновик без получателей запустить нельзя, и сказано почему', () => {
    actions({ estimatedRecipients: 0 })

    expect(screen.getByRole('button', { name: 'Запустить рассылку' })).toBeDisabled()
    expect(screen.getByText('Сейчас некому отправить: выберите учеников с действующим адресом.')).toBeInTheDocument()
    expect(screen.getByRole('link', { name: 'Редактировать' })).toHaveAttribute('href', '/manage/broadcasts/5/edit')
  })

  it('завершённую рассылку можно только протестировать', () => {
    actions({ status: 'sent' })

    expect(screen.getAllByRole('button').map((button) => button.textContent)).toEqual(['Отправить тест себе'])
    expect(screen.queryByRole('link', { name: 'Редактировать' })).not.toBeInTheDocument()
  })

  it('во время отправки статистика обновляется сама раз в 15 секунд и перестаёт после ухода', () => {
    vi.useFakeTimers()
    const view = actions({ status: 'sending' })

    vi.advanceTimersByTime(14_999)
    expect(router.refresh).not.toHaveBeenCalled()
    vi.advanceTimersByTime(1)
    expect(router.refresh).toHaveBeenCalledOnce()
    vi.advanceTimersByTime(15_000)
    expect(router.refresh).toHaveBeenCalledTimes(2)

    view.unmount()
    vi.advanceTimersByTime(60_000)
    expect(router.refresh).toHaveBeenCalledTimes(2)
  })

  it('черновик сам не обновляется', () => {
    vi.useFakeTimers()
    actions()

    vi.advanceTimersByTime(60_000)

    expect(router.refresh).not.toHaveBeenCalled()
  })
})

describe('форма рассылки: получатели и сохранение', () => {
  const maria = { id: 7, title: 'Мария Иванова (maria@lms.test)' }
  const petr = { id: 8, title: 'Пётр Петров (petr@lms.test)' }
  const anna = { id: 9, title: 'Анна Смирнова (anna@lms.test)' }
  const studentsUrl = () => vi.mocked(fetch).mock.calls.map(([path]) => String(path)).filter((path) => path.startsWith('/api/manage/learning-access'))

  async function fill(user: ReturnType<typeof userEvent.setup>) {
    await user.type(screen.getByRole('textbox', { name: 'Тема письма' }), 'Новый курс')
    await user.type(screen.getByRole('textbox', { name: 'Текст письма' }), 'Курс уже на платформе')
  }

  it('отказ загрузки учеников объясняется, а не выдаётся за пустой список', async () => {
    const user = userEvent.setup()
    route = (path) => path.startsWith('/api/manage/learning-access') ? new Response(null, { status: 500 }) : Response.json({ ok: true })
    render(<BroadcastForm allStudents={{ recipients: 3, excluded: 0 }} />)

    await user.click(screen.getByRole('radio', { name: /Выбранные ученики/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить учеников. Обновите страницу')
    expect(screen.queryByText('Ученики не найдены')).not.toBeInTheDocument()
  })

  it('ответ неожиданной формы тоже считается отказом', async () => {
    const user = userEvent.setup()
    route = () => Response.json({ items: [] })
    render(<BroadcastForm allStudents={{ recipients: 3, excluded: 0 }} />)

    await user.click(screen.getByRole('radio', { name: /Выбранные ученики/ }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить учеников')
  })

  it('поиск ищет с первой страницы, «Показать ещё» догружает следующую без повторов', async () => {
    const user = userEvent.setup()
    route = (path) => {
      const url = new URL(path, 'http://localhost')
      const page = url.searchParams.get('page')
      return Response.json(page === '1' ? { docs: [maria, petr], hasNextPage: true } : { docs: [petr, anna, { id: 'x', title: 'Битая запись' }], hasNextPage: false })
    }
    render(<BroadcastForm allStudents={{ recipients: 3, excluded: 0 }} />)
    await user.click(screen.getByRole('radio', { name: /Выбранные ученики/ }))
    await screen.findByRole('button', { name: `Добавить: ${maria.title}` })

    await user.click(screen.getByRole('button', { name: 'Показать ещё' }))

    await screen.findByRole('button', { name: `Добавить: ${anna.title}` })
    expect(screen.getAllByRole('button', { name: /^Добавить: / }).map((button) => button.getAttribute('aria-label'))).toEqual([maria, petr, anna].map((student) => `Добавить: ${student.title}`))
    expect(screen.queryByText('Битая запись')).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Показать ещё' })).not.toBeInTheDocument()

    await user.type(screen.getByRole('searchbox', { name: 'Найти ученика' }), ' Анна ')
    await waitFor(() => expect(studentsUrl().at(-1)).toContain('search=%D0%90%D0%BD%D0%BD%D0%B0'))
    expect(studentsUrl().at(-1)).toContain('page=1')
  })

  it('выбранного ученика можно убрать, а уже выбранного нельзя добавить второй раз', async () => {
    const user = userEvent.setup()
    route = () => Response.json({ docs: [maria, petr], hasNextPage: false })
    render(<BroadcastForm allStudents={{ recipients: 3, excluded: 0 }} initial={{ id: 4, subject: 'Тема', body: 'Текст', ctaLabel: '', ctaUrl: '', audience: 'selected', recipients: [maria] }} />)

    expect(await screen.findByRole('button', { name: `Выбран: ${maria.title}` })).toBeDisabled()
    expect(screen.getByText('Выбрано: 1')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: `Убрать: ${maria.title}` }))

    expect(screen.queryByRole('list', { name: 'Выбранные ученики' })).not.toBeInTheDocument()
    expect(screen.getByRole('button', { name: `Добавить: ${maria.title}` })).toBeEnabled()
    expect(screen.getByText('Выберите учеников из списка')).toBeInTheDocument()
  })

  // Отрисовка пяти тысяч выбранных под нагрузкой полного прогона занимает секунды.
  it('на пределе получателей добавлять нельзя и подсказано, как разослать всем', async () => {
    route = () => Response.json({ docs: [anna], hasNextPage: false })
    const recipients = Array.from({ length: 5000 }, (_, index) => ({ id: 10_000 + index, title: `Ученик ${index}` }))
    const view = render(<BroadcastForm allStudents={{ recipients: 6000, excluded: 0 }} initial={{ id: 4, subject: 'Тема', body: 'Текст', ctaLabel: '', ctaUrl: '', audience: 'selected', recipients }} />)

    // Поиск по ролям среди 5000 выбранных идёт секундами — кнопку находим по её подписи напрямую.
    const add = await waitFor(() => {
      const button = view.container.querySelector(`button[aria-label="Добавить: ${anna.title}"]`)
      if (!button) throw new Error('Список учеников ещё не загрузился')
      return button
    }, { timeout: 10_000 })
    expect(add).toBeDisabled()
    expect(view.container).toHaveTextContent('Можно выбрать не больше 5000 учеников. Для большей аудитории выберите «Все активные ученики».')
  }, 20_000)

  it('кнопка письма уходит без пробелов по краям, пустая — как null', async () => {
    const user = userEvent.setup()
    route = (path, init) => path === '/api/manage/broadcasts' && init?.method === 'POST' ? Response.json({ doc: { id: 41 } }) : Response.json({ docs: [] })
    render(<BroadcastForm allStudents={{ recipients: 3, excluded: 1 }} />)
    await fill(user)

    await user.type(screen.getByRole('textbox', { name: /Кнопка в письме/ }), '  Открыть курс ')
    await user.type(screen.getByRole('textbox', { name: 'Ссылка кнопки' }), ' /courses ')
    await user.click(screen.getByRole('button', { name: 'Создать черновик' }))

    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/manage/broadcasts/41'))
    const [, init] = vi.mocked(fetch).mock.calls.find(([path]) => path === '/api/manage/broadcasts') ?? []
    expect(JSON.parse(String(init?.body))).toMatchObject({ ctaLabel: 'Открыть курс', ctaUrl: '/courses', audience: 'all', recipients: [] })
    expect(router.refresh).toHaveBeenCalledOnce()
  })

  it('черновик правится PATCH по id; аудитория «все» не отправляет прежний выбор', async () => {
    const user = userEvent.setup()
    route = (path, init) => init?.method === 'PATCH' ? Response.json({ doc: { id: 4 } }) : Response.json({ docs: [] })
    render(<BroadcastForm allStudents={{ recipients: 3, excluded: 0 }} initial={{ id: 4, subject: 'Тема', body: 'Текст', ctaLabel: 'Открыть', ctaUrl: '/courses', audience: 'selected', recipients: [maria] }} />)

    await user.click(screen.getByRole('radio', { name: /Все активные ученики/ }))
    await user.click(screen.getByRole('button', { name: 'Сохранить черновик' }))

    await waitFor(() => expect(router.push).toHaveBeenCalledWith('/manage/broadcasts/4'))
    const [, init] = vi.mocked(fetch).mock.calls.find(([, request]) => request?.method === 'PATCH') ?? []
    expect(vi.mocked(fetch).mock.calls.find(([, request]) => request?.method === 'PATCH')?.[0]).toBe('/api/manage/broadcasts/4')
    expect(JSON.parse(String(init?.body))).toMatchObject({ audience: 'all', recipients: [] })
  })

  it('отказ сервера виден, черновик остаётся в форме', async () => {
    const user = userEvent.setup()
    route = (path) => path === '/api/manage/broadcasts' ? Response.json({ error: 'Укажите ссылку https://… или путь на платформе, например /courses' }, { status: 400 }) : Response.json({ docs: [] })
    render(<BroadcastForm allStudents={{ recipients: 3, excluded: 0 }} />)
    await fill(user)

    await user.click(screen.getByRole('button', { name: 'Создать черновик' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Укажите ссылку https://… или путь на платформе')
    expect(screen.getByRole('textbox', { name: 'Тема письма' })).toHaveValue('Новый курс')
    expect(screen.getByText('Есть несохранённые изменения')).toBeInTheDocument()
    expect(router.push).not.toHaveBeenCalled()
  })

  it('ответ без id документа не считается сохранением', async () => {
    const user = userEvent.setup()
    route = () => Response.json({ doc: {} })
    render(<BroadcastForm allStudents={{ recipients: 3, excluded: 0 }} />)
    await fill(user)

    await user.click(screen.getByRole('button', { name: 'Создать черновик' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Сервер не подтвердил сохранение. Обновите страницу')
    expect(router.push).not.toHaveBeenCalled()
  })

  it('«Отмена» без правок уходит сразу, с правками — только после подтверждения', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValue(false)
    render(<BroadcastForm allStudents={{ recipients: 3, excluded: 0 }} initial={{ id: 4, subject: 'Тема', body: 'Текст', ctaLabel: '', ctaUrl: '', audience: 'all', recipients: [] }} />)

    await user.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(confirm).not.toHaveBeenCalled()
    expect(router.push).toHaveBeenLastCalledWith('/manage/broadcasts/4')

    router.push.mockClear()
    await user.type(screen.getByRole('textbox', { name: 'Тема письма' }), '!')
    await user.click(screen.getByRole('button', { name: 'Отмена' }))
    expect(confirm).toHaveBeenCalledOnce()
    expect(router.push).not.toHaveBeenCalled()
  })

  it('новая рассылка по «Отмене» возвращается к списку', async () => {
    const user = userEvent.setup()
    render(<BroadcastForm allStudents={{ recipients: 3, excluded: 0 }} />)

    await user.click(screen.getByRole('button', { name: 'Отмена' }))

    expect(router.push).toHaveBeenCalledWith('/manage/broadcasts')
    expect(screen.getByText('Сейчас получат: 3')).toBeInTheDocument()
  })

  it('счётчик текста письма показывает длину и лимит', async () => {
    const user = userEvent.setup()
    render(<BroadcastForm allStudents={{ recipients: 3, excluded: 0 }} />)

    await user.type(screen.getByRole('textbox', { name: 'Текст письма' }), 'Привет')

    expect(screen.getByRole('textbox', { name: 'Текст письма' })).toHaveAccessibleDescription(expect.stringContaining('6/20000'))
  })
})

describe('статус и сводка рассылки', () => {
  it.each([
    ['draft', 'Черновик'],
    ['sending', 'Отправляется'],
    ['sent', 'Отправлена'],
    ['cancelled', 'Остановлена'],
    ['failed', 'Не доставлена'],
  ] as const)('статус %s подписан словами', (status, label) => {
    render(<BroadcastStatusBadge status={status} />)

    expect(screen.getByText(label)).toBeInTheDocument()
  })

  it('аудитория описывается словами и числом выбранных', () => {
    expect(audienceLabel({ audience: 'all', recipients: [1, 2] })).toBe('Все активные ученики')
    expect(audienceLabel({ audience: 'selected', recipients: [1, 2, 3] })).toBe('Выбранные ученики: 3')
    expect(audienceLabel({ audience: 'selected', recipients: null })).toBe('Выбранные ученики: 0')
  })

  it('дата показывается по Москве, отсутствующая — прочерком', () => {
    expect(broadcastDate('2026-10-04T10:05:00.000Z')).toBe('4 октября в 13:05 мск')
    expect(broadcastDate(null)).toBe('—')
    expect(broadcastDate(undefined)).toBe('—')
  })
})

describe('выбранные ученики видны списком', () => {
  it('у каждого ученика своя кнопка удаления с именем', async () => {
    route = () => Response.json({ docs: [], hasNextPage: false })
    render(<BroadcastForm allStudents={{ recipients: 3, excluded: 0 }} initial={{ subject: '', body: '', ctaLabel: '', ctaUrl: '', audience: 'selected', recipients: [{ id: 7, title: 'Мария' }, { id: 8, title: 'Пётр' }] }} />)

    const chosen = screen.getByRole('list', { name: 'Выбранные ученики' })
    expect(within(chosen).getAllByRole('button').map((button) => button.getAttribute('aria-label'))).toEqual(['Убрать: Мария', 'Убрать: Пётр'])
    expect(await screen.findByText('Ученики не найдены')).toBeInTheDocument()
  })
})
