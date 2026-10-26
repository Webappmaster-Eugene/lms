import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { InterviewRecordingDTO } from '@/lib/interviews/types'

const { InterviewUpload } = await import('@/components/interviews/InterviewUpload')

/**
 * Загрузка личной записи собеседования: прогресс, блокировка формы, отмена и
 * отказы. Незавершённая запись на сервере не должна оставаться после отмены
 * или сбоя — а если удалить её не вышло, ученик должен об этом узнать.
 */

const directions = [
  { id: 1, slug: 'react', title: 'React.js', description: '' },
  { id: 2, slug: 'nodejs', title: 'Node.js backend', description: '' },
]
const recording: InterviewRecordingDTO = { id: 4, title: 'own', description: '', direction: directions[0], category: 'personal', status: 'ready', size: 5, createdAt: '2026-10-11T10:00:00.000Z', isOwner: true, analysisStatus: 'idle', analysisProgress: '', analysisError: '' }

type ProgressEvent = { lengthComputable: boolean; loaded: number; total: number }

/** XMLHttpRequest нужен ради прогресса отправки; заглушка отдаёт события вручную. */
class UploadRequest {
  static all: UploadRequest[] = []
  upload = { onprogress: null as ((event: ProgressEvent) => void) | null }
  onload: (() => void) | null = null
  onerror: (() => void) | null = null
  onabort: (() => void) | null = null
  status = 204
  responseText = ''
  open = vi.fn()
  setRequestHeader = vi.fn()
  send = vi.fn()
  abort = vi.fn(() => this.onabort?.())
  constructor() { UploadRequest.all.push(this) }
  finish(status: number, responseText = '') { this.status = status; this.responseText = responseText; act(() => this.onload?.()) }
}

type Route = () => Response | Promise<Response>
let routes: Record<string, Route>

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

const requested = (key: string) => vi.mocked(fetch).mock.calls.filter(([url, init]) => `${init?.method ?? 'GET'} ${String(url)}` === key)
const lastRequest = () => UploadRequest.all.at(-1) as UploadRequest

beforeEach(() => {
  UploadRequest.all = []
  vi.stubGlobal('XMLHttpRequest', UploadRequest)
  routes = {
    'POST /api/interviews/upload': () => Response.json({ id: 4, uploadHref: '/api/interviews/4/upload' }),
    'POST /api/interviews/4/finish': () => Response.json(recording),
    'DELETE /api/interviews/4': () => Response.json({ deleted: true }),
  }
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const route = routes[`${init?.method ?? 'GET'} ${url}`]
    if (!route) throw new Error(`Неожиданный запрос ${url}`)
    return route()
  }))
})

afterEach(() => vi.unstubAllGlobals())

// jsdom не видит файл, выбранный через userEvent.upload, при проверке required и
// не отправляет форму по кнопке — поэтому submit вызывается напрямую.
function submitForm() {
  fireEvent.submit(screen.getByRole('button', { name: 'Загрузить запись' }).closest('form') as HTMLFormElement)
}

async function startUpload(props: { onClose?: () => void; onUploaded?: (recording: InterviewRecordingDTO) => void } = {}, file = new File(['video'], 'own.mp4', { type: 'video/mp4' })) {
  const user = userEvent.setup()
  render(<InterviewUpload directions={directions} onClose={props.onClose ?? vi.fn()} onUploaded={props.onUploaded ?? vi.fn()} />)
  await user.upload(screen.getByLabelText(/Видеозапись/), file)
  submitForm()
  await waitFor(() => expect(lastRequest()?.send).toHaveBeenCalled())
  return user
}

describe('ход загрузки', () => {
  it('показывает проценты, блокирует форму и только после проверки на Диске отдаёт запись', async () => {
    const onUploaded = vi.fn()
    const finish = deferred<Response>()
    routes['POST /api/interviews/4/finish'] = () => finish.promise
    await startUpload({ onUploaded })

    expect(screen.getByRole('dialog', { name: 'Добавить мой собес' })).toBeInTheDocument()
    expect(screen.getByText('Отправляем видео: 0%')).toBeInTheDocument()
    expect(screen.getByRole('textbox', { name: 'Название' })).toBeDisabled()
    expect(screen.getByRole('combobox', { name: 'Направление' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Загрузить запись' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Отменить загрузку' })).toBeEnabled()

    act(() => lastRequest().upload.onprogress?.({ lengthComputable: true, loaded: 512, total: 1024 }))
    expect(screen.getByText('Отправляем видео: 50%')).toBeInTheDocument()
    expect(screen.getByRole('progressbar', { name: 'Отправка видео' })).toHaveAttribute('value', '50')
    act(() => lastRequest().upload.onprogress?.({ lengthComputable: false, loaded: 900, total: 0 }))
    expect(screen.getByText('Отправляем видео: 50%')).toBeInTheDocument()

    lastRequest().finish(204)
    expect(await screen.findByText('Проверяем запись на Яндекс Диске…')).toBeInTheDocument()
    expect(onUploaded).not.toHaveBeenCalled()
    await act(async () => finish.resolve(Response.json(recording)))
    expect(onUploaded).toHaveBeenCalledWith(recording)
    expect(requested('DELETE /api/interviews/4')).toHaveLength(0)
  })

  it('берёт направление, название и описание из формы, а тип видео — из расширения файла', async () => {
    const user = userEvent.setup()
    render(<InterviewUpload directions={directions} onClose={vi.fn()} onUploaded={vi.fn()} />)

    await user.selectOptions(screen.getByRole('combobox', { name: 'Направление' }), '2')
    await user.type(screen.getByRole('textbox', { name: 'Название' }), '  Node — второй этап  ')
    await user.type(screen.getByRole('textbox', { name: 'Описание, необязательно' }), ' Вопросы про event loop ')
    await user.upload(screen.getByLabelText(/Видеозапись/), new File(['video'], 'Запись.MKV', { type: '' }))
    expect(screen.getByRole('textbox', { name: 'Название' })).toHaveValue('  Node — второй этап  ')
    expect(screen.getByRole('button', { name: 'Загрузить запись' })).toBeEnabled()
    submitForm()

    await waitFor(() => expect(lastRequest()?.send).toHaveBeenCalled())
    expect(JSON.parse(String(requested('POST /api/interviews/upload')[0][1]?.body))).toEqual({
      directionId: 2, title: 'Node — второй этап', description: 'Вопросы про event loop', fileName: 'Запись.MKV', mimeType: 'video/x-matroska', size: 5,
    })
    expect(lastRequest().setRequestHeader).toHaveBeenCalledWith('Content-Type', 'video/x-matroska')
  })
})

describe('отмена', () => {
  it('во время отправки прерывает передачу, удаляет черновую запись и закрывает окно без ошибки', async () => {
    const onClose = vi.fn()
    const onUploaded = vi.fn()
    const user = await startUpload({ onClose, onUploaded })

    await user.click(screen.getByRole('button', { name: 'Отменить загрузку' }))

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(lastRequest().abort).toHaveBeenCalled()
    expect(requested('DELETE /api/interviews/4')).toHaveLength(1)
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
    expect(onUploaded).not.toHaveBeenCalled()
  })

  it('отмена, пока сервер создаёт запись, всё равно удаляет её, когда ответ пришёл', async () => {
    const user = userEvent.setup()
    const onClose = vi.fn()
    const creating = deferred<Response>()
    routes['POST /api/interviews/upload'] = () => creating.promise
    render(<InterviewUpload directions={directions} onClose={onClose} onUploaded={vi.fn()} />)
    await user.upload(screen.getByLabelText(/Видеозапись/), new File(['video'], 'own.mp4', { type: 'video/mp4' }))
    submitForm()

    await user.click(screen.getByRole('button', { name: 'Отменить загрузку' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    await act(async () => creating.resolve(Response.json({ id: 4, uploadHref: '/api/interviews/4/upload' })))

    await waitFor(() => expect(requested('DELETE /api/interviews/4')).toHaveLength(1))
    expect(UploadRequest.all).toHaveLength(0)
  })

  it('Escape во время отправки работает как отмена', async () => {
    const onClose = vi.fn()
    await startUpload({ onClose })

    fireEvent.keyDown(document, { key: 'Escape' })

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(lastRequest().abort).toHaveBeenCalled()
    expect(requested('DELETE /api/interviews/4')).toHaveLength(1)
  })

  it('до начала загрузки «Отмена» просто закрывает окно', async () => {
    const onClose = vi.fn()
    render(<InterviewUpload directions={directions} onClose={onClose} onUploaded={vi.fn()} />)

    await userEvent.click(screen.getByRole('button', { name: 'Отмена' }))

    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(fetch).not.toHaveBeenCalled()
  })

  it('если черновую запись удалить не вышло, окно остаётся и объясняет, что делать; повторная отмена дочищает', async () => {
    const onClose = vi.fn()
    let deletions = 0
    routes['DELETE /api/interviews/4'] = () => (deletions++ === 0 ? Response.json({ error: 'Диск недоступен' }, { status: 503 }) : Response.json({ deleted: true }))
    const user = await startUpload({ onClose })

    await user.click(screen.getByRole('button', { name: 'Отменить загрузку' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось удалить незавершённую загрузку')
    expect(onClose).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Отмена' })).toBeEnabled()

    await user.click(screen.getByRole('button', { name: 'Отмена' }))
    await waitFor(() => expect(onClose).toHaveBeenCalledOnce())
    expect(requested('DELETE /api/interviews/4')).toHaveLength(2)
  })
})

describe('отказы', () => {
  it('отказ хранилища при передаче файла показан словами сервера, черновая запись удаляется', async () => {
    await startUpload()

    lastRequest().finish(507, JSON.stringify({ error: 'На Диске закончилось место' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('На Диске закончилось место')
    await waitFor(() => expect(requested('DELETE /api/interviews/4')).toHaveLength(1))
    expect(screen.getByRole('button', { name: 'Загрузить запись' })).toBeEnabled()
  })

  it('ответ прокси без JSON заменяется понятным текстом', async () => {
    await startUpload()

    lastRequest().finish(502, '<html><body>Bad Gateway</body></html>')

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось загрузить видео. Проверьте подключение и попробуйте ещё раз.')
  })

  it('обрыв соединения назван прямо, черновая запись удаляется', async () => {
    await startUpload()

    act(() => lastRequest().onerror?.())

    expect(await screen.findByRole('alert')).toHaveTextContent('Загрузка прервалась. Проверьте подключение к интернету.')
    await waitFor(() => expect(requested('DELETE /api/interviews/4')).toHaveLength(1))
  })

  it('если Диск не подтвердил запись, она не открывается и удаляется', async () => {
    const onUploaded = vi.fn()
    routes['POST /api/interviews/4/finish'] = () => Response.json({ error: 'Файл не найден на Яндекс Диске' }, { status: 422 })
    await startUpload({ onUploaded })

    lastRequest().finish(204)

    expect(await screen.findByRole('alert')).toHaveTextContent('Файл не найден на Яндекс Диске')
    await waitFor(() => expect(requested('DELETE /api/interviews/4')).toHaveLength(1))
    expect(onUploaded).not.toHaveBeenCalled()
  })

  it('новая попытка не начинается, пока не удалена черновая запись прошлой', async () => {
    routes['DELETE /api/interviews/4'] = () => Response.json({ error: 'Диск недоступен' }, { status: 503 })
    await startUpload()
    act(() => lastRequest().onerror?.())
    expect(await screen.findByText(/Не удалось удалить незавершённую загрузку/)).toBeInTheDocument()

    submitForm()

    await waitFor(() => expect(requested('DELETE /api/interviews/4')).toHaveLength(2))
    expect(requested('POST /api/interviews/upload')).toHaveLength(1)
    expect(UploadRequest.all).toHaveLength(1)
  })
})
