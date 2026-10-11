import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { InterviewListDTO, InterviewRecordingDTO } from '@/lib/interviews/types'
import { InterviewLibrary } from '@/components/interviews/InterviewLibrary'
import { InterviewDetail, type InterviewDetailsDTO } from '@/components/interviews/InterviewDetail'
import { InterviewUpload } from '@/components/interviews/InterviewUpload'
import { InterviewReportView, type InterviewAnalysisDTO } from '@/components/interviews/InterviewReportView'

vi.mock('next/link', async () => (await import('../helpers/component-mocks')).linkMock())
vi.mock('next/navigation', () => ({ useRouter: () => ({ push: vi.fn(), refresh: vi.fn() }) }))

const direction = { id: 1, slug: 'react', title: 'React.js', description: '' }
const recording: InterviewRecordingDTO = { id: 4, title: 'Техническое интервью', description: '', direction, category: 'personal', status: 'ready', size: 100, createdAt: '2026-10-11T10:00:00.000Z', isOwner: true, analysisStatus: 'idle', analysisProgress: '', analysisError: '' }
const list: InterviewListDTO = { directions: [direction, { id: 2, slug: 'nodejs', title: 'Node.js backend', description: '' }], recordings: [recording], page: 1, totalPages: 1, totalDocs: 1, uploadAvailable: true, analysisAvailable: true, isAdmin: false }
const details: InterviewDetailsDTO = { recording, analysis: null, analysisAvailable: true }

const analysis: InterviewAnalysisDTO = {
  provider: 'checkfrod',
  summary: { durationS: 3363, episodes: 3, moments: 8, gaze: 'good', irisMinutes: 21, headOnlyMinutes: 23, noFaceMinutes: 11, frozenMinutes: 0 },
  report: { duration_s: 3363, episodes: [{ kind: 'reading', confidence: 'medium' }], attention: { moments: [] } },
}

beforeEach(() => { vi.stubGlobal('fetch', vi.fn()); window.history.replaceState(null, '', '/interviews') })
afterEach(() => { vi.unstubAllGlobals(); vi.useRealTimers() })

describe('библиотека собеседований', () => {
  it('переключает личный раздел серверным запросом, не фильтрацией чужих данных в браузере', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ ...list, recordings: [] }), { status: 200 }))
    render(<InterviewLibrary initial={list} initialFilters={{ direction: 'react', category: 'mentor', search: '', page: 1 }} />)
    expect(fetch).not.toHaveBeenCalled()
    await userEvent.click(screen.getByRole('button', { name: 'Мои собесы' }))
    await waitFor(() => expect(fetch).toHaveBeenCalledWith(expect.stringContaining('category=personal'), expect.objectContaining({ signal: expect.any(AbortSignal) })))
    expect(await screen.findByText('Пока нет записей')).toBeInTheDocument()
    expect(screen.queryByRole('link', { name: /Техническое интервью/ })).not.toBeInTheDocument()
  })

  it('показывает ошибку запроса и позволяет повторить', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Записи временно недоступны' }), { status: 503 })).mockResolvedValueOnce(new Response(JSON.stringify(list)))
    render(<InterviewLibrary initial={list} initialFilters={{ direction: 'react', category: 'mentor', search: '', page: 1 }} />)
    await userEvent.click(screen.getByRole('button', { name: 'Чужие собесы' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Записи временно недоступны')
    await userEvent.click(screen.getByRole('button', { name: 'Повторить' }))
    expect(await screen.findByRole('link', { name: /Техническое интервью/ })).toHaveAttribute('href', '/interviews/4')
  })

  it('не даёт начать загрузку без подключённого хранилища', () => {
    render(<InterviewLibrary initial={{ ...list, uploadAvailable: false }} initialFilters={{ direction: 'react', category: 'personal', search: '', page: 1 }} />)
    expect(screen.getByRole('button', { name: 'Добавить мой собес' })).toBeDisabled()
    expect(screen.getByText(/подключить хранилище Яндекс Диска/)).toBeInTheDocument()
  })
})

describe('просмотр и личный анализ', () => {
  it('сохраняет готовый отчёт без предложения повторного платного разбора', () => {
    render(<InterviewDetail initial={{ ...details, recording: { ...recording, analysisStatus: 'completed' }, analysis }} />)
    expect(screen.getByRole('link', { name: 'Открыть полный отчёт Checkfrod' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /разбор|Анализировать|Повторить анализ/ })).not.toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('не показывает анализ и удаление для чужой записи даже при переданном отчёте', () => {
    render(<InterviewDetail initial={{ ...details, recording: { ...recording, category: 'community', isOwner: false }, analysis }} />)
    expect(screen.queryByRole('link', { name: 'Открыть полный отчёт Checkfrod' })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /Анализировать/ })).not.toBeInTheDocument()
    expect(screen.queryByRole('button', { name: 'Удалить запись' })).not.toBeInTheDocument()
    expect(document.querySelector('video')).toHaveAttribute('src', '/api/interviews/4/stream')
    expect(document.querySelector('video')).toHaveAttribute('playsinline')
  })

  it('запускает анализ только после явного согласия на обработку', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ analysisStatus: 'queued' })))
    render(<InterviewDetail initial={details} />)
    await userEvent.click(screen.getByRole('button', { name: 'Анализировать мой собес' }))
    expect(fetch).not.toHaveBeenCalled()
    expect(screen.getByRole('dialog')).toHaveTextContent('Видеозапись будет передана внешнему сервису Checkfrod')
    expect(screen.getByRole('button', { name: 'Передать видео в Checkfrod' })).toBeDisabled()
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: 'Передать видео в Checkfrod' }))
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/interviews/4/analyze', expect.objectContaining({ method: 'POST', body: JSON.stringify({ consent: true, roiSpec: 'auto' }) })))
    expect(await screen.findByText('Разбор в очереди')).toBeInTheDocument()
  })

  it('показывает отсутствие конфигурации анализа', () => {
    render(<InterviewDetail initial={{ ...details, analysisAvailable: false }} />)
    expect(screen.getByRole('button', { name: 'Анализировать мой собес' })).toBeDisabled()
    expect(screen.getByText(/подключить Checkfrod/)).toBeInTheDocument()
  })

  it('отправляет выбранную область лица, не собирая имя или текст вакансии', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ analysisStatus: 'queued' })))
    render(<InterviewDetail initial={details} />)
    await userEvent.click(screen.getByRole('button', { name: 'Анализировать мой собес' }))
    expect(screen.queryByRole('textbox', { name: /имя|вакансии/i })).not.toBeInTheDocument()
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Область лица кандидата' }), 'custom')
    await userEvent.type(screen.getByLabelText(/Координаты области в пикселях/), '100,50,640,480')
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: 'Передать видео в Checkfrod' }))
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/interviews/4/analyze', expect.objectContaining({ body: JSON.stringify({ consent: true, roiSpec: '100,50,640,480' }) })))
  })

  it('отвергает слишком маленькую область до передачи видео', async () => {
    render(<InterviewDetail initial={details} />)
    await userEvent.click(screen.getByRole('button', { name: 'Анализировать мой собес' }))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Область лица кандидата' }), 'custom')
    await userEvent.type(screen.getByLabelText(/Координаты области в пикселях/), '0,0,15,480')
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: 'Передать видео в Checkfrod' }))
    expect(screen.getByRole('alert')).toHaveTextContent('от 16 до 32768')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('показывает ошибки фонового анализа без ложного отчёта', () => {
    render(<InterviewDetail initial={{ ...details, recording: { ...recording, analysisStatus: 'failed', analysisError: 'Checkfrod временно недоступен' } }} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Checkfrod временно недоступен')
    expect(screen.getByRole('button', { name: 'Повторить анализ' })).toBeEnabled()
  })

  it('прерывает запрос обновления при закрытии страницы', async () => {
    vi.useFakeTimers()
    let signal: AbortSignal | undefined
    vi.mocked(fetch).mockImplementation((_url, init) => { signal = init?.signal ?? undefined; return new Promise(() => {}) })
    const view = render(<InterviewDetail initial={{ ...details, recording: { ...recording, analysisStatus: 'queued' } }} />)
    await act(async () => { vi.advanceTimersByTime(5000) })
    expect(signal?.aborted).toBe(false)
    view.unmount()
    expect(signal?.aborted).toBe(true)
  })
})

describe('сводка Checkfrod', () => {
  it('показывает факты сервиса без собственных оценок и открывает точный отчёт через приватный API', () => {
    render(<InterviewReportView analysis={analysis} recordingId={4} />)
    expect(screen.getByText('Сигналы сервиса')).toBeInTheDocument()
    expect(screen.getByText('Моменты для просмотра')).toBeInTheDocument()
    expect(screen.getByText('21 мин')).toBeInTheDocument()
    expect(screen.getByText(/не устанавливает факт списывания/)).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Открыть полный отчёт Checkfrod' })
    expect(link).toHaveAttribute('href', '/api/interviews/4/report')
    expect(link).toHaveAttribute('target', '_blank')
    expect(link).toHaveAttribute('rel', 'noopener noreferrer')
    expect(link).toHaveAttribute('referrerpolicy', 'no-referrer')
    expect(screen.queryByText(/Уровень по записи|Итог по критериям|Сильные стороны/)).not.toBeInTheDocument()
  })

  it('не выдаёт статичное видео за проверку взгляда и объясняет отсутствие сигналов', () => {
    render(<InterviewReportView analysis={{ ...analysis, summary: { ...analysis.summary, gaze: 'static', episodes: 0 } }} recordingId={4} />)
    expect(screen.queryByText('По радужке и голове')).not.toBeInTheDocument()
    expect(screen.queryByText('Только по повороту головы')).not.toBeInTheDocument()
    expect(screen.getByText(/отсутствие сигналов ничего не говорит/)).toBeInTheDocument()
  })

  it('обозначает застывшие непроверенные части и недостаточную точность по глазам', () => {
    render(<InterviewReportView analysis={{ ...analysis, summary: { ...analysis.summary, gaze: 'head_only', irisMinutes: 0.5, frozenMinutes: 34 } }} recordingId={4} />)
    expect(screen.getByText('30 с')).toBeInTheDocument()
    expect(screen.getByText('Видео застывало, не проверялось')).toBeInTheDocument()
    expect(screen.getByText('34 мин')).toBeInTheDocument()
    expect(screen.getByText(/Глаза в записи мелкие/)).toBeInTheDocument()
  })
})

describe('загрузка', () => {
  it('подтверждает файл на диске после отправки и только затем открывает готовую запись', async () => {
    const requests: UploadRequest[] = []
    class UploadRequest {
      upload = { onprogress: null as ((event: { lengthComputable: boolean; loaded: number; total: number }) => void) | null }
      onload: (() => void) | null = null
      onerror: (() => void) | null = null
      onabort: (() => void) | null = null
      status = 204
      open = vi.fn()
      setRequestHeader = vi.fn()
      send = vi.fn()
      abort = vi.fn()
      constructor() { requests.push(this) }
    }
    vi.stubGlobal('XMLHttpRequest', UploadRequest)
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ id: 4, uploadHref: '/api/interviews/4/upload' }))).mockResolvedValueOnce(new Response(JSON.stringify(recording)))
    const uploaded = vi.fn()
    render(<InterviewUpload directions={[direction]} onClose={vi.fn()} onUploaded={uploaded} />)
    const file = new File(['video'], 'own.mp4', { type: 'video/mp4' })
    await userEvent.upload(screen.getByLabelText(/Видеозапись/), file)
    fireEvent.submit(screen.getByRole('button', { name: 'Загрузить запись' }).closest('form') as HTMLFormElement)
    await waitFor(() => expect(requests[0]?.send).toHaveBeenCalledWith(file))
    const request = requests[0]
    expect(request?.open).toHaveBeenCalledWith('PUT', '/api/interviews/4/upload')
    expect(uploaded).not.toHaveBeenCalled()
    expect(fetch).not.toHaveBeenCalledWith('/api/interviews/4/finish', expect.anything())
    act(() => { request?.upload.onprogress?.({ lengthComputable: true, loaded: 4, total: 5 }) })
    expect(screen.getByRole('progressbar')).toHaveAttribute('value', '80')
    act(() => { request?.onload?.() })
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/interviews/4/finish', expect.objectContaining({ method: 'POST' })))
    await waitFor(() => expect(uploaded).toHaveBeenCalledWith(recording))
  })

  it('отвергает пустое видео до создания серверной записи', async () => {
    render(<InterviewUpload directions={[direction]} onClose={vi.fn()} onUploaded={vi.fn()} />)
    await userEvent.upload(screen.getByLabelText(/Видеозапись/), new File([], 'empty.mp4', { type: 'video/mp4' }))
    fireEvent.submit(screen.getByRole('button', { name: 'Загрузить запись' }).closest('form') as HTMLFormElement)
    expect(screen.getByRole('alert')).toHaveTextContent('непустое видео')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('не отправляет личное видео на посторонний uploadURL и удаляет незавершённую запись', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ id: 12, uploadHref: 'https://example.org/upload' }))).mockResolvedValueOnce(new Response(JSON.stringify({ deleted: true })))
    const uploaded = vi.fn()
    render(<InterviewUpload directions={[direction]} onClose={vi.fn()} onUploaded={uploaded} />)
    await userEvent.upload(screen.getByLabelText(/Видеозапись/), new File(['video'], 'own.mp4', { type: 'video/mp4' }))
    fireEvent.submit(screen.getByRole('button', { name: 'Загрузить запись' }).closest('form') as HTMLFormElement)
    expect(await screen.findByRole('alert')).toHaveTextContent('безопасную загрузку')
    expect(fetch).toHaveBeenCalledWith('/api/interviews/12', { method: 'DELETE' })
    expect(uploaded).not.toHaveBeenCalled()
  })
})
