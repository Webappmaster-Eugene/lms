import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'

import { useCodeRunner } from '@/components/trainer/useCodeRunner'
import type { TrainerExecSpec } from '@/lib/trainer/types'

/**
 * Прогон решения ученика в iframe.
 *
 * sandbox без allow-same-origin даёт непрозрачный origin — с ним код ученика
 * получил бы доступ к сессии. Слушатель message висит на window, куда пишет
 * кто угодно, отсюда проверка источника.
 */

const SPEC: TrainerExecSpec = {
  checkMode: 'unit',
  language: 'js',
  setupCode: '',
  userCode: 'function solve() { return 1 }',
  testCode: `test('кейс', function () { expect(solve()).toBe(1) })`,
  cases: [],
  entryName: 'solve',
  expectedOutput: undefined,
  timeLimitMs: 2000,
}

const frames = () => document.querySelectorAll('iframe')

function replyFrom(frame: HTMLIFrameElement | null, payload: unknown, type = 'trainer-result') {
  window.dispatchEvent(
    new MessageEvent('message', { data: { type, payload }, source: frame?.contentWindow }),
  )
}

const PASSED_PAYLOAD = {
  status: 'passed',
  tests: [{ name: 'кейс', passed: true }],
  passedCount: 1,
  totalCount: 1,
  consoleOutput: [],
  totalMs: 3,
}

describe('браузерный прогон решения', () => {
  beforeEach(() => {
    vi.useFakeTimers({ shouldAdvanceTime: true })
  })

  afterEach(() => {
    vi.useRealTimers()
    document.querySelectorAll('iframe').forEach((frame) => frame.remove())
  })

  describe('изоляция песочницы', () => {
    it('фрейм создаётся с allow-scripts', async () => {
      const { result } = renderHook(() => useCodeRunner())

      act(() => {
        void result.current.run(SPEC)
      })

      await waitFor(() => expect(frames()).toHaveLength(1))
      expect(frames()[0].getAttribute('sandbox')).toContain('allow-scripts')
    })

    it('allow-same-origin НЕ выдаётся — иначе код ученика дотянется до сессии', async () => {
      const { result } = renderHook(() => useCodeRunner())

      act(() => {
        void result.current.run(SPEC)
      })

      await waitFor(() => expect(frames()).toHaveLength(1))
      const sandbox = frames()[0].getAttribute('sandbox') ?? ''
      expect(sandbox).not.toContain('allow-same-origin')
    })

    it('фрейм скрыт и от глаз, и от скринридера', async () => {
      const { result } = renderHook(() => useCodeRunner())

      act(() => {
        void result.current.run(SPEC)
      })

      await waitFor(() => expect(frames()).toHaveLength(1))
      expect(frames()[0]).toHaveAttribute('aria-hidden', 'true')
      expect(frames()[0].style.display).toBe('none')
    })

    it('исходник уходит в base64, а не разметкой', async () => {
      const { result } = renderHook(() => useCodeRunner())

      act(() => {
        void result.current.run({ ...SPEC, userCode: 'function solve() { return "</scr" + "ipt>" }' })
      })

      await waitFor(() => expect(frames()).toHaveLength(1))
      const srcdoc = frames()[0].getAttribute('srcdoc') ?? ''
      expect(srcdoc).not.toContain('function solve()')
      expect(srcdoc).toContain('atob(')
    })

    it('iframe оставляет исполнение решения Worker и запрещает ему сетевые запросы', () => {
      const { result } = renderHook(() => useCodeRunner())
      act(() => { void result.current.run(SPEC) })
      const document = frames()[0].srcdoc
      expect(document).toContain('new Worker(url)')
      expect(document).toContain('worker.terminate()')
      expect(document).not.toContain('new Function(')
      expect(document).toContain("default-src 'none'")
      expect(document).toContain("worker-src blob:")
      expect(document).toContain("connect-src 'none'")
      expect(document).toContain("form-action 'none'")
    })
  })

  describe('приём результата', () => {
    it('пустая консоль разрешается только доверенной спецификацией комнаты', async () => {
      const { result } = renderHook(() => useCodeRunner())
      await act(async () => {
        const pending = result.current.run({ ...SPEC, allowNoTests: true, testCode: '' })
        replyFrom(frames()[0], { status: 'passed', tests: [], consoleOutput: ['42'] })
        expect(await pending).toMatchObject({ status: 'passed', totalCount: 0, passedCount: 0, consoleOutput: ['42'] })
      })
    })

    it('флаг пустой консоли из сообщения iframe не ослабляет обычный прогон', async () => {
      const { result } = renderHook(() => useCodeRunner())
      await act(async () => {
        const pending = result.current.run(SPEC)
        replyFrom(frames()[0], { status: 'passed', allowNoTests: true, tests: [], consoleOutput: ['42'] })
        expect(await pending).toMatchObject({ status: 'error', totalCount: 0 })
      })
    })

    it('ответ своего фрейма становится результатом', async () => {
      const { result } = renderHook(() => useCodeRunner())

      let run!: Promise<unknown>
      act(() => {
        run = result.current.run(SPEC)
      })
      await waitFor(() => expect(frames()).toHaveLength(1))

      const frame = frames()[0] as HTMLIFrameElement
      act(() => replyFrom(frame, PASSED_PAYLOAD))

      await expect(run).resolves.toMatchObject({ status: 'passed', passedCount: 1 })
    })

    it('сообщение от постороннего окна игнорируется', async () => {
      const { result } = renderHook(() => useCodeRunner())

      let settled = false
      act(() => {
        void result.current.run(SPEC).then(() => {
          settled = true
        })
      })
      await waitFor(() => expect(frames()).toHaveLength(1))

      act(() => replyFrom(null, { ...PASSED_PAYLOAD, status: 'passed' }))
      await Promise.resolve()

      expect(settled).toBe(false)
      expect(frames()).toHaveLength(1)
    })

    it('чужой тип сообщения игнорируется', async () => {
      const { result } = renderHook(() => useCodeRunner())

      let settled = false
      act(() => {
        void result.current.run(SPEC).then(() => {
          settled = true
        })
      })
      await waitFor(() => expect(frames()).toHaveLength(1))

      const frame = frames()[0] as HTMLIFrameElement
      act(() => replyFrom(frame, PASSED_PAYLOAD, 'какое-то-другое-событие'))
      await Promise.resolve()

      expect(settled).toBe(false)
    })

    it('после ответа фрейм убирается из документа', async () => {
      const { result } = renderHook(() => useCodeRunner())

      let run!: Promise<unknown>
      act(() => {
        run = result.current.run(SPEC)
      })
      await waitFor(() => expect(frames()).toHaveLength(1))

      const frame = frames()[0] as HTMLIFrameElement
      act(() => replyFrom(frame, PASSED_PAYLOAD))
      await run

      expect(frames()).toHaveLength(0)
    })
  })

  describe('зависшее решение', () => {
    it('обрывается по таймауту с понятным текстом', async () => {
      const { result } = renderHook(() => useCodeRunner())

      let run!: Promise<{ status: string; error?: string }>
      act(() => {
        run = result.current.run({ ...SPEC, timeLimitMs: 1000 }) as Promise<{
          status: string
          error?: string
        }>
      })
      await waitFor(() => expect(frames()).toHaveLength(1))

      await act(async () => {
        vi.advanceTimersByTime(1000 + 1500 + 10)
      })

      const outcome = await run
      expect(outcome.status).toBe('timeout')
      expect(outcome.error).toContain('1000')
      expect(outcome.error).toMatch(/бесконечный цикл/i)
    })

    it('резервный таймер удаляет фрейм, если bootstrap Worker не ответил', async () => {
      const { result } = renderHook(() => useCodeRunner())

      let run!: Promise<unknown>
      act(() => {
        run = result.current.run({ ...SPEC, timeLimitMs: 500 })
      })
      await waitFor(() => expect(frames()).toHaveLength(1))

      await act(async () => {
        vi.advanceTimersByTime(500 + 1500 + 10)
      })
      await run

      expect(frames()).toHaveLength(0)
    })
  })

  describe('отмена и повторный запуск', () => {
    it('cancel убирает фрейм', async () => {
      const { result } = renderHook(() => useCodeRunner())

      act(() => {
        void result.current.run(SPEC)
      })
      await waitFor(() => expect(frames()).toHaveLength(1))

      act(() => result.current.cancel())

      expect(frames()).toHaveLength(0)
    })

    it('отмена завершает Promise и не оставляет ожидающий интерфейс зависшим', async () => {
      const { result } = renderHook(() => useCodeRunner())
      let pending: Promise<unknown> | undefined
      act(() => { pending = result.current.run(SPEC) })
      act(() => result.current.cancel())
      await expect(pending).resolves.toMatchObject({ status: 'error', error: 'Выполнение отменено' })
    })

    it('повторный запуск не оставляет предыдущий фрейм', async () => {
      const { result } = renderHook(() => useCodeRunner())

      act(() => {
        void result.current.run(SPEC)
      })
      await waitFor(() => expect(frames()).toHaveLength(1))

      act(() => {
        void result.current.run(SPEC)
      })

      await waitFor(() => expect(frames()).toHaveLength(1))
    })

    it('повторный запуск отменяет ожидание первого, а новый принимает только свой ответ', async () => {
      const { result } = renderHook(() => useCodeRunner())
      let first: Promise<unknown> | undefined
      let second: Promise<unknown> | undefined
      act(() => { first = result.current.run(SPEC) })
      const previousFrame = frames()[0]
      act(() => { second = result.current.run(SPEC) })
      await expect(first).resolves.toMatchObject({ status: 'error', error: 'Выполнение отменено' })
      act(() => replyFrom(previousFrame, PASSED_PAYLOAD))
      expect(frames()).toHaveLength(1)
      act(() => replyFrom(frames()[0], PASSED_PAYLOAD))
      await expect(second).resolves.toMatchObject({ status: 'passed' })
    })

    it('размонтирование компонента снимает фрейм и слушатель', async () => {
      const { result, unmount } = renderHook(() => useCodeRunner())

      act(() => {
        void result.current.run(SPEC)
      })
      await waitFor(() => expect(frames()).toHaveLength(1))

      unmount()

      expect(frames()).toHaveLength(0)
    })
  })

})
