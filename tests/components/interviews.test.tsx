import { beforeEach, afterEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import { MAX_RECORDING_BYTES, type InterviewListDTO, type InterviewRecordingDTO } from '@/lib/interviews/types'
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
  provider: 'sovetnik',
  context: { direction: 'React.js', targetGrade: 'middle', vacancyText: 'React и TypeScript', interviewFormat: 'technical' },
  report: {
    report: {
      candidateSpeaker: 'speaker_1', hrSummary: 'Хорошо объясняет React, но не хватает глубины TypeScript.',
      grade: { level: 'middle', confidence: 'medium', rationale: 'Объяснил эффекты; сложные типы требуют практики.' },
      criteria: [
        { criterionId: 'react', score: 4, comment: 'Понимает зависимости эффектов.', evidence: [{ quote: 'Эффект повторяется при изменении зависимости', timestamp: '00:12:05', verified: true }] },
        { criterionId: 'ts', score: null, comment: 'На записи тему не затрагивали.', evidence: [{ quote: 'Я знаю все типы', timestamp: null, verified: false }] },
      ],
      communication: { clarity: 4, confidence: null, structure: 3, comment: 'Добавляйте примеры к общим определениям.' },
      resumeCheck: [{ claim: 'Три года React', status: 'confirmed', note: 'Привёл пример рабочего проекта.' }],
      strengths: ['Объясняет зависимости хуков'], risks: [{ title: 'Недостаточно примеров', severity: 'medium', detail: 'Потренируйте конкретные сценарии.' }],
      growthAreas: ['Практика с TypeScript'], openQuestions: ['Как устроены условные типы?'], limitations: ['Лайвкодинг отсутствовал'],
      extraneous: [{ fromSec: 1000, toSec: 1060, note: 'Разговор после интервью' }],
    },
    score: { overall: 80, coverage: 0.6, verdict: 'maybe', failedMust: [], uncheckedMust: ['ts'], borderline: true },
    criteria: [
      { id: 'react', name: 'React hooks', description: 'Эффекты и зависимости', kind: 'must', weight: 3 },
      { id: 'ts', name: 'TypeScript', description: 'Условные типы', kind: 'must', weight: 2 },
    ],
    model: 'service-model', limitations: ['Код на экране не проверялся'],
  },
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
    expect(screen.getByRole('link', { name: 'Скачать отчёт' })).toBeInTheDocument()
    expect(screen.queryByRole('button', { name: /разбор|Анализировать|Повторить анализ/ })).not.toBeInTheDocument()
    expect(fetch).not.toHaveBeenCalled()
  })

  it('не показывает анализ и удаление для чужой записи даже при переданном отчёте', () => {
    render(<InterviewDetail initial={{ ...details, recording: { ...recording, category: 'community', isOwner: false }, analysis }} />)
    expect(screen.queryByRole('link', { name: 'Скачать отчёт' })).not.toBeInTheDocument()
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
    expect(screen.getByRole('dialog')).toHaveTextContent('Сервис анализа собеседований Советника')
    expect(screen.getByRole('button', { name: 'Получить разбор' })).toBeDisabled()
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: 'Получить разбор' }))
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/interviews/4/analyze', expect.objectContaining({ method: 'POST', body: JSON.stringify({ consent: true, targetGrade: 'middle', interviewFormat: 'technical', vacancyText: '' }) })))
    expect(await screen.findByText('Разбор в очереди')).toBeInTheDocument()
  })

  it('показывает отсутствие конфигурации анализа', () => {
    render(<InterviewDetail initial={{ ...details, analysisAvailable: false }} />)
    expect(screen.getByRole('button', { name: 'Анализировать мой собес' })).toBeDisabled()
    expect(screen.getByText(/подключить сервис разбора собеседований/)).toBeInTheDocument()
  })

  it('отправляет грейд, формат и требования вакансии для осмысленного разбора', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ analysisStatus: 'queued' })))
    render(<InterviewDetail initial={details} />)
    await userEvent.click(screen.getByRole('button', { name: 'Анализировать мой собес' }))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Целевой грейд' }), 'senior')
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Формат собеседования' }), 'live_coding')
    await userEvent.type(screen.getByRole('textbox', { name: /Вакансия или требования/ }), '  React, Next.js, проектирование API  ')
    await userEvent.type(screen.getByRole('textbox', { name: /Как вас называют/ }), '  Александр  ')
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: 'Получить разбор' }))
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/interviews/4/analyze', expect.objectContaining({ body: JSON.stringify({ consent: true, targetGrade: 'senior', interviewFormat: 'live_coding', vacancyText: 'React, Next.js, проектирование API', candidateName: 'Александр' }) })))
  })

  it('сохраняет введённый контекст после ошибки сервиса и позволяет повторить', async () => {
    vi.mocked(fetch).mockResolvedValueOnce(new Response(JSON.stringify({ error: 'Сервис временно недоступен' }), { status: 503 })).mockResolvedValueOnce(new Response(JSON.stringify({ analysisStatus: 'queued' })))
    render(<InterviewDetail initial={details} />)
    await userEvent.click(screen.getByRole('button', { name: 'Анализировать мой собес' }))
    await userEvent.selectOptions(screen.getByRole('combobox', { name: 'Формат собеседования' }), 'system_design')
    await userEvent.type(screen.getByRole('textbox', { name: /Вакансия или требования/ }), 'Проектирование систем')
    await userEvent.click(screen.getByRole('checkbox'))
    await userEvent.click(screen.getByRole('button', { name: 'Получить разбор' }))
    expect(await screen.findByRole('alert')).toHaveTextContent('Сервис временно недоступен')
    expect(screen.getByRole('textbox', { name: /Вакансия или требования/ })).toHaveValue('Проектирование систем')
    await userEvent.click(screen.getByRole('button', { name: 'Получить разбор' }))
    expect(await screen.findByText('Разбор в очереди')).toBeInTheDocument()
    expect(fetch).toHaveBeenCalledTimes(2)
  })

  it('показывает ошибки фонового анализа без ложного отчёта', () => {
    render(<InterviewDetail initial={{ ...details, recording: { ...recording, analysisStatus: 'failed', analysisError: 'Сервис временно недоступен' } }} />)
    expect(screen.getByRole('alert')).toHaveTextContent('Сервис временно недоступен')
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

describe('сохранённый разбор собеседования', () => {
  it('показывает оценку сервиса, грейд, критерии и ограничения без внешнего перехода', () => {
    render(<InterviewReportView analysis={analysis} recordingId={4} />)
    expect(screen.getByText('80 из 100')).toBeInTheDocument()
    expect(screen.getByText('60%')).toBeInTheDocument()
    expect(screen.getByText('Уровень по ответам в записи: Middle')).toBeInTheDocument()
    expect(screen.getByText('Практика с TypeScript')).toBeInTheDocument()
    expect(screen.getByText('Лайвкодинг отсутствовал')).toBeInTheDocument()
    expect(screen.getByText('Код на экране не проверялся')).toBeInTheDocument()
    expect(screen.getByText(/решение о найме принимает человек/)).toBeInTheDocument()
    const link = screen.getByRole('link', { name: 'Скачать отчёт' })
    expect(link).toHaveAttribute('href', '/api/interviews/4/report')
    expect(link).toHaveAttribute('download')
    expect(link).not.toHaveAttribute('target')
  })

  it('не представляет непроверенную цитату и необсуждавшуюся тему как доказанный провал', () => {
    render(<InterviewReportView analysis={analysis} recordingId={4} />)
    expect(screen.getByText('Цитата не подтверждена расшифровкой — проверьте фрагмент записи')).toBeInTheDocument()
    expect(screen.getByText(/Цитата подтверждена расшифровкой/)).toBeInTheDocument()
    expect(screen.getAllByText('Не оценено')).toHaveLength(2)
    expect(screen.getByText('Обязательные требования, которые ещё нужно проверить')).toBeInTheDocument()
    expect(screen.getByText(/Необсуждавшиеся темы не считаются ошибками/)).toBeInTheDocument()
  })

  it('показывает недостаточность данных вместо ложной нулевой оценки', () => {
    render(<InterviewReportView analysis={{ ...analysis, context: { ...analysis.context, vacancyText: '' }, report: { ...analysis.report, score: { ...analysis.report.score, overall: 0, coverage: 0, verdict: 'insufficient_data' } } }} recordingId={4} />)
    expect(screen.getByText('Недостаточно данных')).toBeInTheDocument()
    expect(screen.queryByText('0 из 100')).not.toBeInTheDocument()
    expect(screen.getByText(/Конкретная вакансия не указана/)).toBeInTheDocument()
  })

  it('отображает содержимое отчёта как текст без исполнения HTML', () => {
    render(<InterviewReportView analysis={{ ...analysis, report: { ...analysis.report, report: { ...analysis.report.report, hrSummary: '<img src=x onerror="alert(1)">', strengths: ['<script>alert(1)</script>'] } } }} recordingId={4} />)
    expect(screen.getByText('<img src=x onerror="alert(1)">')).toBeInTheDocument()
    expect(screen.getByText('<script>alert(1)</script>')).toBeInTheDocument()
    expect(document.querySelector('img,script')).toBeNull()
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

  it('отвергает файл выше лимита до обращения к серверу', async () => {
    render(<InterviewUpload directions={[direction]} onClose={vi.fn()} onUploaded={vi.fn()} />)
    const file = new File(['video'], 'large.mov', { type: 'video/quicktime' })
    Object.defineProperty(file, 'size', { value: MAX_RECORDING_BYTES + 1 })
    await userEvent.upload(screen.getByLabelText(/Видеозапись/), file)
    fireEvent.submit(screen.getByRole('button', { name: 'Загрузить запись' }).closest('form') as HTMLFormElement)
    expect(screen.getByRole('alert')).toHaveTextContent('до 5 ГБ')
    expect(fetch).not.toHaveBeenCalled()
  })

  it('принимает MOV ровно на границе разрешённого размера', async () => {
    vi.mocked(fetch).mockResolvedValue(new Response(JSON.stringify({ error: 'Тестовое хранилище недоступно' }), { status: 503 }))
    render(<InterviewUpload directions={[direction]} onClose={vi.fn()} onUploaded={vi.fn()} />)
    const file = new File(['video'], 'large.mov', { type: 'video/quicktime' })
    Object.defineProperty(file, 'size', { value: MAX_RECORDING_BYTES })
    await userEvent.upload(screen.getByLabelText(/Видеозапись/), file)
    fireEvent.submit(screen.getByRole('button', { name: 'Загрузить запись' }).closest('form') as HTMLFormElement)
    await waitFor(() => expect(fetch).toHaveBeenCalledWith('/api/interviews/upload', expect.objectContaining({ body: JSON.stringify({ directionId: 1, title: 'large', description: '', fileName: 'large.mov', mimeType: 'video/quicktime', size: MAX_RECORDING_BYTES }) })))
    expect(await screen.findByRole('alert')).toHaveTextContent('Тестовое хранилище недоступно')
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
