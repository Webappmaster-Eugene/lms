import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, fireEvent, render, screen, waitFor, within } from '@testing-library/react'
import userEvent from '@testing-library/user-event'
import type { InterviewRoom } from '@/lib/trainer/interview'
import type { TrainerRunResult } from '@/lib/trainer/types'

const run = vi.hoisted(() => vi.fn())
const cancel = vi.hoisted(() => vi.fn())
vi.mock('@/components/trainer/useCodeRunner', () => ({ useCodeRunner: () => ({ run, cancel }) }))
// Кнопка «Сочетание запуска» вызывает onRun в обход readOnly редактора: так видно,
// что сама комната не запускает код там, где это запрещено.
vi.mock('@/components/trainer/CodeEditor', () => ({ CodeEditor: ({ value, onChange, readOnly, onRun }: { value: string; onChange: (code: string) => void; readOnly?: boolean; onRun?: () => void }) => <div><textarea aria-label="Код" value={value} onChange={(event) => onChange(event.target.value)} readOnly={readOnly} /><button type="button" onClick={onRun}>Сочетание запуска</button></div> }))
vi.mock('@/components/trainer/FrontendEditor', () => ({ FrontendEditor: ({ value, onChange, previewUrl, previewHtml, onRun }: { value: string; onChange: (code: string) => void; previewUrl?: string | null; previewHtml?: string | null; onRun?: () => void }) => <div><textarea aria-label="Файлы проекта" value={value} onChange={(event) => onChange(event.target.value)} /><button type="button" onClick={onRun}>Сочетание запуска</button>{previewUrl && <output aria-label="Адрес предпросмотра">{previewUrl}</output>}{previewHtml && <output aria-label="HTML предпросмотра">{previewHtml}</output>}</div> }))
vi.mock('next/link', async () => (await import('../helpers/component-mocks')).linkMock())

const { InterviewWorkspace } = await import('@/components/trainer/interview/InterviewWorkspace')

/**
 * Комната собеседования глазами участника: приглашение, завершение, отказы
 * сохранения, конфликт версий и консоль. Код участника не должен теряться ни
 * при одном из отказов.
 */

const token = 'aa573b25-ab70-4b9f-aec4-9dd78d38b109'
let room: InterviewRoom
let userId: number
let patchAnswer: ((body: Record<string, unknown>) => Response) | null
let runAnswer: (body: Record<string, unknown>) => Response
let compileAnswer: () => Response
let releaseAnswer: () => Promise<Response>

function outcome(overrides: Partial<TrainerRunResult> = {}): TrainerRunResult {
  return { status: 'passed', consoleOutput: [], tests: [], passedCount: 0, totalCount: 0, totalMs: 1, ...overrides }
}

function deferred<T>() {
  let resolve: (value: T) => void = () => {}
  const promise = new Promise<T>((done) => { resolve = done })
  return { promise, resolve }
}

const patches = () => vi.mocked(fetch).mock.calls.filter(([, init]) => init?.method === 'PATCH').map(([, init]) => JSON.parse(String(init?.body)))
const editor = () => screen.getByLabelText<HTMLTextAreaElement>('Код')
const saveStatus = () => screen.getByText(/^(Сохраняем…|Нужно выбрать версию|Есть несохранённые изменения|Код сохранён)$/)

beforeEach(() => {
  vi.clearAllMocks()
  userId = 1
  patchAnswer = null
  room = { token, ownerId: 1, title: 'Сумма', descriptionMd: '', setupCode: '', code: 'console.log(1)', language: 'js', version: 1, createdAt: '2026-10-06T00:00:00Z', endedAt: null, participants: [{ id: 1, name: 'Ученик', lastSeen: new Date().toISOString() }] }
  run.mockResolvedValue(outcome({ consoleOutput: ['1'] }))
  runAnswer = () => Response.json({ result: outcome({ consoleOutput: ['Go output'] }) })
  compileAnswer = () => Response.json({ js: 'console.log(1)', diagnostics: [] })
  releaseAnswer = async () => new Response(null, { status: 204 })
  let leases = 0
  vi.stubGlobal('fetch', vi.fn(async (url: string, init?: RequestInit) => {
    const body = init?.body ? JSON.parse(String(init.body)) : {}
    if (url.includes('/preview-release/')) return releaseAnswer()
    if (url.endsWith('/compile')) return compileAnswer()
    if (url.endsWith('/run')) {
      if (body.language === 'next') {
        const leaseToken = String(++leases).padStart(48, 'a')
        return Response.json({ preview: { leaseToken, previewPath: `/api/trainer/preview/${leaseToken}/` } })
      }
      return runAnswer(body)
    }
    if (init?.method === 'PATCH') {
      if (patchAnswer) return patchAnswer(body)
      if (body.version !== room.version) return Response.json({ error: 'Код изменился', room }, { status: 409 })
      room = body.end
        ? { ...room, endedAt: '2026-10-06T00:30:00Z', version: room.version + 1 }
        : { ...room, code: String(body.code), language: body.language as InterviewRoom['language'], version: room.version + 1 }
    }
    return Response.json({ room, userId })
  }))
})

afterEach(() => {
  vi.useRealTimers()
  vi.unstubAllGlobals()
  vi.restoreAllMocks()
})

async function openRoom() {
  const view = render(<InterviewWorkspace token={token} />)
  await screen.findByRole('heading', { name: 'Сумма' })
  return view
}

describe('приглашение и завершение', () => {
  it('«Пригласить» копирует ссылку на комнату', async () => {
    const user = userEvent.setup()
    await openRoom()

    await user.click(screen.getByRole('button', { name: 'Пригласить' }))

    expect(await screen.findByText('Ссылка скопирована. Отправьте её собеседнику с аккаунтом на платформе.')).toHaveAttribute('role', 'status')
    expect(await navigator.clipboard.readText()).toBe(`${window.location.origin}/trainer/interview/${token}`)
  })

  it('без доступа к буферу обмена подсказывает адрес для ручного копирования', async () => {
    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new DOMException('Нет разрешения', 'NotAllowedError'))
    await openRoom()

    await user.click(screen.getByRole('button', { name: 'Пригласить' }))

    expect(await screen.findByText(`Скопируйте адрес из строки браузера: /trainer/interview/${token}`)).toBeInTheDocument()
  })

  it('владелец завершает собеседование только после подтверждения, и код становится только для чтения', async () => {
    const user = userEvent.setup()
    const confirm = vi.spyOn(window, 'confirm').mockReturnValueOnce(false).mockReturnValueOnce(true)
    await openRoom()

    await user.click(screen.getByRole('button', { name: 'Завершить' }))
    expect(confirm).toHaveBeenCalledOnce()
    expect(patches()).toHaveLength(0)

    await user.click(screen.getByRole('button', { name: 'Завершить' }))
    await waitFor(() => expect(screen.getByText(/· Завершено/)).toBeInTheDocument())
    expect(patches()).toEqual([{ version: 1, end: true }])
    expect(editor()).toHaveAttribute('readonly')
    expect(screen.getByRole('button', { name: 'Запустить' })).toBeDisabled()
    expect(screen.queryByRole('button', { name: 'Завершить' })).not.toBeInTheDocument()
  })

  it('участник, который не создавал комнату, завершить её не может', async () => {
    userId = 2
    await openRoom()

    expect(screen.queryByRole('button', { name: 'Завершить' })).not.toBeInTheDocument()
  })

  it('пока правка не сохранена, завершить нельзя — иначе она пропадёт', async () => {
    await openRoom()

    fireEvent.change(editor(), { target: { value: 'console.log(2)' } })

    expect(screen.getByRole('button', { name: 'Завершить' })).toBeDisabled()
    expect(saveStatus()).toHaveTextContent('Есть несохранённые изменения')
    await waitFor(() => expect(saveStatus()).toHaveTextContent('Код сохранён'), { timeout: 2500 })
    expect(screen.getByRole('button', { name: 'Завершить' })).toBeEnabled()
    expect(patches()).toEqual([{ version: 1, code: 'console.log(2)', language: 'js' }])
  })
})

describe('отказы сохранения', () => {
  it('временный сбой оставляет код в редакторе и даёт повторить сохранение', async () => {
    const user = userEvent.setup()
    let failures = 1
    patchAnswer = (body) => {
      if (failures-- > 0) return Response.json({ error: 'База недоступна.' }, { status: 503 })
      room = { ...room, code: String(body.code), version: room.version + 1 }
      return Response.json({ room, userId })
    }
    await openRoom()

    fireEvent.change(editor(), { target: { value: 'console.log("важно")' } })

    const alert = await screen.findByRole('alert', {}, { timeout: 2500 })
    expect(alert).toHaveTextContent('База недоступна. Ваш код остаётся в редакторе.')
    expect(editor()).toHaveValue('console.log("важно")')
    await user.click(within(alert).getByRole('button', { name: 'Повторить сохранение' }))

    await waitFor(() => expect(saveStatus()).toHaveTextContent('Код сохранён'))
    expect(room.code).toBe('console.log("важно")')
    expect(screen.queryByRole('alert')).not.toBeInTheDocument()
  })

  it('отказ в доступе запирает редактор и предлагает забрать черновик себе', async () => {
    const user = userEvent.setup()
    patchAnswer = () => Response.json({ error: 'Вас удалили из комнаты.' }, { status: 403 })
    await openRoom()

    fireEvent.change(editor(), { target: { value: 'мой черновик' } })

    const alert = await screen.findByRole('alert', {}, { timeout: 2500 })
    expect(alert).toHaveTextContent('Вас удалили из комнаты. Ваш код остаётся в редакторе.')
    expect(within(alert).queryByRole('button', { name: 'Повторить сохранение' })).not.toBeInTheDocument()
    expect(editor()).toHaveAttribute('readonly')
    expect(screen.getByRole('button', { name: 'Запустить' })).toBeDisabled()
    expect(screen.getByRole('button', { name: 'Пригласить' })).toBeDisabled()
    await user.click(within(alert).getByRole('button', { name: 'Скопировать мой черновик' }))
    expect(await screen.findByText('Ваш черновик скопирован.')).toBeInTheDocument()
    expect(await navigator.clipboard.readText()).toBe('мой черновик')
  })

  it('без буфера обмена подсказывает скопировать черновик вручную', async () => {
    const user = userEvent.setup()
    vi.spyOn(navigator.clipboard, 'writeText').mockRejectedValue(new DOMException('Нет разрешения', 'NotAllowedError'))
    patchAnswer = () => Response.json({ error: 'Вас удалили из комнаты.' }, { status: 403 })
    await openRoom()
    fireEvent.change(editor(), { target: { value: 'мой черновик' } })
    const alert = await screen.findByRole('alert', {}, { timeout: 2500 })

    await user.click(within(alert).getByRole('button', { name: 'Скопировать мой черновик' }))

    expect(await screen.findByText('Выделите код в редакторе и скопируйте его вручную.')).toBeInTheDocument()
  })
})

describe('конфликт версий', () => {
  async function runIntoConflict() {
    await openRoom()
    room = { ...room, version: 2, code: 'код собеседника' }
    fireEvent.change(editor(), { target: { value: 'мой код' } })
    await screen.findByText('Другой участник изменил код', {}, { timeout: 2500 })
  }

  it('показывает общую версию, не трогая черновик, и «Принять общую версию» заменяет его', async () => {
    const user = userEvent.setup()
    await runIntoConflict()

    expect(saveStatus()).toHaveTextContent('Нужно выбрать версию')
    expect(editor()).toHaveValue('мой код')
    expect(screen.getByLabelText('Язык решения')).toBeDisabled()
    await user.click(screen.getByText('Посмотреть общую версию'))
    expect(screen.getByText('код собеседника', { selector: 'pre' })).toBeVisible()
    await user.click(screen.getByRole('button', { name: 'Скопировать мой черновик' }))
    expect(await navigator.clipboard.readText()).toBe('мой код')

    await user.click(screen.getByRole('button', { name: 'Принять общую версию' }))

    expect(editor()).toHaveValue('код собеседника')
    expect(saveStatus()).toHaveTextContent('Код сохранён')
    expect(screen.queryByText('Другой участник изменил код')).not.toBeInTheDocument()
  })

  it('«Сохранить мой черновик вместо неё» отправляет мой код поверх новой версии', async () => {
    const user = userEvent.setup()
    await runIntoConflict()

    await user.click(screen.getByRole('button', { name: 'Сохранить мой черновик вместо неё' }))

    await waitFor(() => expect(saveStatus()).toHaveTextContent('Код сохранён'), { timeout: 2500 })
    expect(patches().at(-1)).toEqual({ version: 2, code: 'мой код', language: 'js' })
    expect(room.code).toBe('мой код')
  })

  it('собеседование завершили, пока я печатал: черновик не пропадает, его можно забрать', async () => {
    const user = userEvent.setup()
    await openRoom()
    room = { ...room, version: 2, endedAt: '2026-10-06T00:30:00Z' }
    fireEvent.change(editor(), { target: { value: 'недописанное решение' } })

    expect(await screen.findByText('Комната завершена. Скопируйте несохранённый черновик до выхода.', {}, { timeout: 2500 })).toBeInTheDocument()
    expect(editor()).toHaveValue('недописанное решение')
    expect(editor()).toHaveAttribute('readonly')
    expect(screen.getByRole('button', { name: 'Сохранить мой черновик вместо неё' })).toBeDisabled()
    await user.click(screen.getAllByRole('button', { name: 'Скопировать мой черновик' })[0])
    expect(await navigator.clipboard.readText()).toBe('недописанное решение')
  })
})

describe('консоль комнаты', () => {
  it('ошибки TypeScript показаны построчно, а код не запускается', async () => {
    const user = userEvent.setup()
    compileAnswer = () => Response.json({ js: '', diagnostics: [{ line: 1, message: "Type 'string' is not assignable to type 'number'." }, { line: 3, message: "Cannot find name 'total'." }] })
    await openRoom()
    await user.selectOptions(screen.getByLabelText('Язык решения'), 'ts')

    await user.click(screen.getByRole('button', { name: 'Запустить' }))

    const alert = await screen.findByText(/Строка 1:/)
    expect(alert).toHaveAttribute('role', 'alert')
    expect(alert.textContent).toBe("Строка 1: Type 'string' is not assignable to type 'number'.\nСтрока 3: Cannot find name 'total'.")
    expect(run).not.toHaveBeenCalled()
  })

  it('свои проверки участника показывают счёт и причину падения', async () => {
    const user = userEvent.setup()
    run.mockResolvedValue(outcome({
      status: 'failed', passedCount: 1, totalCount: 2,
      tests: [{ name: 'сумма', hidden: false, passed: true, durationMs: 1 }, { name: 'пустой ввод', hidden: false, passed: false, durationMs: 1, message: 'ожидалось 0, получено undefined' }],
    }))
    await openRoom()

    await user.click(screen.getByRole('button', { name: 'Запустить' }))

    expect(await screen.findByText('Ваши проверки: 1 из 2')).toBeInTheDocument()
    expect(screen.getByText('✓ сумма')).toBeInTheDocument()
    expect(screen.getByText('✗ пустой ввод')).toBeInTheDocument()
    expect(screen.getByText('ожидалось 0, получено undefined')).toBeInTheDocument()
  })

  it('долгий прогон можно остановить, и его поздний результат не появится', async () => {
    const user = userEvent.setup()
    const pending = deferred<TrainerRunResult>()
    run.mockReturnValue(pending.promise)
    await openRoom()

    await user.click(screen.getByRole('button', { name: 'Запустить' }))
    expect(screen.getByRole('button', { name: 'Запустить' })).toBeDisabled()
    expect(screen.getByText('· Выполняется…')).toBeInTheDocument()
    await user.click(screen.getByRole('button', { name: 'Остановить' }))

    expect(cancel).toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Запустить' })).toBeEnabled()
    expect(screen.queryByRole('button', { name: 'Остановить' })).not.toBeInTheDocument()
    await act(async () => pending.resolve(outcome({ consoleOutput: ['поздний вывод'] })))
    expect(screen.queryByText('поздний вывод')).not.toBeInTheDocument()
  })

  it('сочетание клавиш в редакторе запускает код, а в завершённой комнате — нет', async () => {
    const user = userEvent.setup()
    const view = await openRoom()
    await user.click(screen.getByRole('button', { name: 'Сочетание запуска' }))
    await waitFor(() => expect(run).toHaveBeenCalledOnce())
    view.unmount()

    room = { ...room, endedAt: '2026-10-06T00:30:00Z' }
    await openRoom()
    await user.click(screen.getByRole('button', { name: 'Сочетание запуска' }))

    expect(run).toHaveBeenCalledOnce()
  })

  it('сочетание клавиш в редакторе проекта обновляет предпросмотр', async () => {
    const user = userEvent.setup()
    runAnswer = () => Response.json({ preview: { html: '<h1>Комната</h1>' } })
    await openRoom()
    await user.selectOptions(screen.getByLabelText('Язык решения'), 'react')

    await user.click(await screen.findByRole('button', { name: 'Сочетание запуска' }))

    expect(await screen.findByLabelText('HTML предпросмотра')).toHaveTextContent('<h1>Комната</h1>')
  })

  it('отказ компилятора TypeScript показан текстом сервера', async () => {
    const user = userEvent.setup()
    compileAnswer = () => Response.json({ error: 'Компилятор перегружен, попробуйте позже' }, { status: 503 })
    await openRoom()
    await user.selectOptions(screen.getByLabelText('Язык решения'), 'ts')

    await user.click(screen.getByRole('button', { name: 'Запустить' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Компилятор перегружен, попробуйте позже')
    expect(run).not.toHaveBeenCalled()
    expect(screen.getByRole('button', { name: 'Запустить' })).toBeEnabled()
  })

  it('автозапуск прогоняет код один раз после паузы в наборе', async () => {
    await openRoom()
    vi.useFakeTimers()
    fireEvent.click(screen.getByRole('checkbox', { name: 'Автозапуск' }))

    fireEvent.change(editor(), { target: { value: 'console.log(2)' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(600) })
    fireEvent.change(editor(), { target: { value: 'console.log(3)' } })
    await act(async () => { await vi.advanceTimersByTimeAsync(1199) })
    expect(run).not.toHaveBeenCalled()
    await act(async () => { await vi.advanceTimersByTimeAsync(1) })

    expect(run).toHaveBeenCalledOnce()
    expect(run).toHaveBeenCalledWith(expect.objectContaining({ userCode: 'console.log(3)' }))
  })

  it('правка файлов frontend-проекта сохраняется в общую комнату', async () => {
    const user = userEvent.setup()
    await openRoom()
    await user.selectOptions(screen.getByLabelText('Язык решения'), 'react')
    const files = JSON.stringify({ 'App.tsx': 'export default () => <h1>Собеседование</h1>' })

    fireEvent.change(await screen.findByLabelText('Файлы проекта'), { target: { value: files } })

    await waitFor(() => expect(patches().at(-1)).toEqual({ version: expect.any(Number), code: files, language: 'react' }), { timeout: 2500 })
  })

  it('обрыв сети при закрытии прежнего предпросмотра не запускает второй Next.js', async () => {
    const user = userEvent.setup()
    await openRoom()
    await user.selectOptions(screen.getByLabelText('Язык решения'), 'next')
    await user.click(screen.getByRole('button', { name: 'Запустить' }))
    await screen.findByLabelText('Адрес предпросмотра')
    releaseAnswer = async () => { throw new TypeError('Failed to fetch') }

    await user.click(screen.getByRole('button', { name: 'Запустить' }))

    expect(await screen.findByText('Не удалось закрыть прежний предпросмотр. Повторите запуск.')).toBeInTheDocument()
    expect(vi.mocked(fetch).mock.calls.filter(([url]) => String(url).endsWith('/run'))).toHaveLength(1)
  })

  it('отказ среды выполнения показан текстом сервера', async () => {
    const user = userEvent.setup()
    runAnswer = () => Response.json({ error: 'Среда выполнения Go перегружена' }, { status: 503 })
    await openRoom()
    await user.selectOptions(screen.getByLabelText('Язык решения'), 'go')

    await user.click(screen.getByRole('button', { name: 'Запустить' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Среда выполнения Go перегружена')
  })

  // Дефект: InterviewWorkspace.tsx:103 (и :120 для компиляции) читает ответ через
  // response.json() без защиты: текстовый ответ прокси превращается в ошибку
  // парсера JSON на английском вместо «Не удалось запустить код».
  it.fails('сбой прокси при запуске Go объяснён по-русски — дефект: показывается ошибка разбора JSON', async () => {
    const user = userEvent.setup()
    runAnswer = () => new Response('Gateway Timeout', { status: 504 })
    await openRoom()
    await user.selectOptions(screen.getByLabelText('Язык решения'), 'go')

    await user.click(screen.getByRole('button', { name: 'Запустить' }))

    expect(await screen.findByRole('alert')).toHaveTextContent('Не удалось запустить код')
  })
})
