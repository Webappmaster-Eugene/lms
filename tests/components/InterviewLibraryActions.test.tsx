import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { InterviewListDTO, InterviewRecordingDTO } from '@/lib/interviews/types'

vi.mock('next/link', async () => (await import('../helpers/component-mocks')).linkMock())

const { InterviewLibrary } = await import('@/components/interviews/InterviewLibrary')

/**
 * Библиотека записей: фильтры и страницы запрашиваются у сервера и попадают в
 * адрес, устаревший ответ не перетирает свежий, администратор подтягивает
 * записи с Диска, а своя загрузка открывает раздел «Мои собесы».
 */

const react = { id: 1, slug: 'react', title: 'React.js', description: '' }
const node = { id: 2, slug: 'nodejs', title: 'Node.js backend', description: '' }

function recording(id: number, title: string, overrides: Partial<InterviewRecordingDTO> = {}): InterviewRecordingDTO {
  return { id, title, description: '', direction: react, category: 'mentor', status: 'ready', size: 100, createdAt: '2026-10-11T10:00:00.000Z', isOwner: false, analysisStatus: 'idle', analysisProgress: '', analysisError: '', ...overrides }
}

function list(overrides: Partial<InterviewListDTO> = {}): InterviewListDTO {
  return { directions: [react, node], recordings: [recording(1, 'Первое интервью')], page: 1, totalPages: 1, totalDocs: 1, uploadAvailable: true, analysisAvailable: true, isAdmin: false, ...overrides }
}

const filters = { direction: 'react', category: 'mentor' as const, search: '', page: 1 }

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

type Answer = (query: URLSearchParams, init?: RequestInit) => Response | Promise<Response>
let listAnswer: Answer
let routes: Record<string, () => Response | Promise<Response>>

const listRequests = () => vi.mocked(fetch).mock.calls.filter(([url]) => String(url).startsWith('/api/interviews?')).map(([url, init]) => ({ query: new URL(String(url), 'https://learn.example').searchParams, signal: init?.signal }))

beforeEach(() => {
  window.history.replaceState(null, '', '/interviews')
  listAnswer = () => Response.json(list())
  routes = {}
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    if (url.startsWith('/api/interviews?')) return listAnswer(new URL(url, 'https://learn.example').searchParams, init)
    const route = routes[`${init?.method ?? 'GET'} ${url}`]
    if (!route) throw new Error(`Неожиданный запрос ${url}`)
    return route()
  }))
})

afterEach(() => vi.unstubAllGlobals())

describe('фильтры и страницы', () => {
  it('страницы и направление запрашиваются у сервера и сохраняются в адресе', async () => {
    const user = userEvent.setup()
    listAnswer = (query) => Response.json(list({ page: Number(query.get('page')), totalPages: 3, totalDocs: 30, recordings: [recording(Number(query.get('page')), `Интервью на странице ${query.get('page')}`)] }))
    render(<InterviewLibrary initial={list({ totalPages: 3, totalDocs: 30 })} initialFilters={filters} />)

    expect(screen.getByRole('navigation', { name: 'Страницы записей' })).toHaveTextContent('1 из 3')
    expect(screen.getByRole('button', { name: 'Назад' })).toBeDisabled()
    await user.click(screen.getByRole('button', { name: 'Далее' }))

    expect(await screen.findByRole('link', { name: /Интервью на странице 2/ })).toHaveAttribute('href', '/interviews/2')
    expect(screen.getByText('2 из 3')).toBeInTheDocument()
    expect(window.location.search).toBe('?direction=react&category=mentor&search=&page=2')
    await user.click(screen.getByRole('button', { name: 'Назад' }))
    expect(await screen.findByRole('link', { name: /Интервью на странице 1/ })).toBeInTheDocument()
    expect(window.location.search).toBe('?direction=react&category=mentor&search=&page=1')

    await user.click(screen.getByRole('button', { name: 'Node.js backend' }))
    await waitFor(() => expect(window.location.search).toBe('?direction=nodejs&category=mentor&search=&page=1'))
    expect(screen.getByRole('button', { name: 'Node.js backend' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('button', { name: 'React.js' })).toHaveAttribute('aria-pressed', 'false')
  })

  it('поиск отправляется формой без пробелов по краям и с первой страницы', async () => {
    const user = userEvent.setup()
    listAnswer = () => Response.json(list({ recordings: [], totalDocs: 0 }))
    render(<InterviewLibrary initial={list()} initialFilters={{ ...filters, page: 2 }} />)

    await user.type(screen.getByRole('searchbox', { name: 'Поиск записей' }), '  хуки  ')
    await user.click(screen.getByRole('button', { name: 'Найти собеседование' }))

    expect(await screen.findByText('Измените поисковый запрос или выберите другое направление.')).toBeInTheDocument()
    expect(listRequests()[0].query.get('search')).toBe('хуки')
    expect(listRequests()[0].query.get('page')).toBe('1')
  })

  it('пока список загружается, видно состояние загрузки вместо старых записей', async () => {
    const user = userEvent.setup()
    const answer = deferred<Response>()
    listAnswer = () => answer.promise
    render(<InterviewLibrary initial={list()} initialFilters={filters} />)

    await user.click(screen.getByRole('button', { name: 'Мои собесы' }))

    expect(screen.getByRole('status')).toHaveTextContent('Загружаем записи…')
    expect(screen.queryByRole('link', { name: /Первое интервью/ })).not.toBeInTheDocument()
    await act(async () => answer.resolve(Response.json(list({ recordings: [recording(9, 'Моё интервью', { category: 'personal', isOwner: true })] }))))
    expect(screen.getByRole('link', { name: /Моё интервью/ })).toBeInTheDocument()
  })

  it('ответ на прежний фильтр, пришедший позже, не перетирает свежий', async () => {
    const user = userEvent.setup()
    const slow = deferred<Response>()
    listAnswer = (query) => query.get('direction') === 'nodejs' && query.get('category') === 'mentor'
      ? slow.promise
      : Response.json(list({ recordings: [recording(5, 'Свежий ответ', { direction: node })] }))
    render(<InterviewLibrary initial={list()} initialFilters={filters} />)

    await user.click(screen.getByRole('button', { name: 'Node.js backend' }))
    await user.click(screen.getByRole('button', { name: 'Мои собесы' }))
    expect(await screen.findByRole('link', { name: /Свежий ответ/ })).toBeInTheDocument()
    await act(async () => slow.resolve(Response.json(list({ recordings: [recording(6, 'Устаревший ответ')] }))))

    expect(screen.getByRole('link', { name: /Свежий ответ/ })).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Устаревший ответ/ })).not.toBeInTheDocument()
    expect(listRequests()[0].signal?.aborted).toBe(true)
    expect(window.location.search).toBe('?direction=nodejs&category=personal&search=&page=1')
  })
})

describe('обновление библиотеки с Яндекс Диска', () => {
  it('администратор видит итог импорта и обновлённый список; кнопка заблокирована на время запроса', async () => {
    const user = userEvent.setup()
    const imported = deferred<Response>()
    routes['POST /api/interviews/import'] = () => imported.promise
    listAnswer = () => Response.json(list({ recordings: [recording(1, 'Первое интервью'), recording(2, 'Новое с Диска')], totalDocs: 2, isAdmin: true }))
    render(<InterviewLibrary initial={list({ isAdmin: true })} initialFilters={filters} />)

    await user.click(screen.getByRole('button', { name: 'Обновить записи с Яндекс Диска' }))
    const button = screen.getByRole('button', { name: 'Обновляем библиотеку…' })
    expect(button).toBeDisabled()
    await user.click(button)
    await act(async () => imported.resolve(Response.json({ created: 2, updated: 1 })))

    expect(await screen.findByText('Библиотека обновлена. Добавлено записей: 2, обновлено: 1.')).toHaveAttribute('role', 'status')
    expect(await screen.findByRole('link', { name: /Новое с Диска/ })).toBeInTheDocument()
    expect(vi.mocked(fetch).mock.calls.filter(([url]) => url === '/api/interviews/import')).toHaveLength(1)
  })

  it('ошибка импорта показана текстом сервера, и кнопка снова доступна', async () => {
    const user = userEvent.setup()
    routes['POST /api/interviews/import'] = () => Response.json({ error: 'Яндекс Диск не отвечает' }, { status: 502 })
    render(<InterviewLibrary initial={list({ isAdmin: true })} initialFilters={filters} />)

    await user.click(screen.getByRole('button', { name: 'Обновить записи с Яндекс Диска' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Яндекс Диск не отвечает')
    expect(screen.getByRole('button', { name: 'Обновить записи с Яндекс Диска' })).toBeEnabled()
  })

  it('ученику обновление библиотеки не предлагается', () => {
    render(<InterviewLibrary initial={list()} initialFilters={filters} />)

    expect(screen.queryByRole('button', { name: /Яндекс Диска/ })).not.toBeInTheDocument()
  })
})

describe('своя запись', () => {
  class UploadRequest {
    static last: UploadRequest | null = null
    upload = { onprogress: null }
    onload: (() => void) | null = null
    onerror = null
    onabort = null
    status = 204
    responseText = ''
    open = vi.fn()
    setRequestHeader = vi.fn()
    send = vi.fn()
    abort = vi.fn()
    constructor() { UploadRequest.last = this }
  }

  it('окно загрузки открывается с текущим направлением и закрывается без запросов', async () => {
    const user = userEvent.setup()
    render(<InterviewLibrary initial={list()} initialFilters={{ ...filters, direction: 'nodejs' }} />)

    await user.click(screen.getByRole('button', { name: 'Добавить мой собес' }))
    expect(screen.getByRole('dialog', { name: 'Добавить мой собес' })).toBeInTheDocument()
    expect(screen.getByRole('combobox', { name: 'Направление' })).toHaveValue('2')
    await user.click(screen.getByRole('button', { name: 'Закрыть окно' }))

    await waitFor(() => expect(screen.queryByRole('dialog')).not.toBeInTheDocument())
    expect(fetch).not.toHaveBeenCalled()
  })

  it('после загрузки открывает «Мои собесы» нужного направления и сообщает об успехе', async () => {
    const user = userEvent.setup()
    vi.stubGlobal('XMLHttpRequest', UploadRequest)
    const mine = recording(12, 'Мой собес по Node', { direction: node, category: 'personal', isOwner: true })
    routes['POST /api/interviews/upload'] = () => Response.json({ id: 12, uploadHref: '/api/interviews/12/upload' })
    routes['POST /api/interviews/12/finish'] = () => Response.json(mine)
    listAnswer = () => Response.json(list({ recordings: [mine] }))
    render(<InterviewLibrary initial={list()} initialFilters={{ ...filters, search: 'старый запрос' }} />)

    await user.click(screen.getByRole('button', { name: 'Добавить мой собес' }))
    await user.selectOptions(screen.getByRole('combobox', { name: 'Направление' }), '2')
    await user.upload(screen.getByLabelText(/Видеозапись/), new File(['video'], 'node.mp4', { type: 'video/mp4' }))
    // jsdom не видит файл из userEvent.upload при проверке required — форма отправляется напрямую.
    fireEvent.submit(screen.getByRole('button', { name: 'Загрузить запись' }).closest('form') as HTMLFormElement)
    await waitFor(() => expect(UploadRequest.last?.send).toHaveBeenCalled())
    act(() => UploadRequest.last?.onload?.())

    expect(await screen.findByText('Запись загружена и доступна в «Моих собесах».')).toBeInTheDocument()
    expect(screen.queryByRole('dialog')).not.toBeInTheDocument()
    expect(await screen.findByRole('link', { name: /Мой собес по Node/ })).toBeInTheDocument()
    expect(screen.getByRole('button', { name: 'Мои собесы' })).toHaveAttribute('aria-pressed', 'true')
    expect(screen.getByRole('searchbox', { name: 'Поиск записей' })).toHaveValue('')
    expect(window.location.search).toBe('?direction=nodejs&category=personal&search=&page=1')
  })
})
