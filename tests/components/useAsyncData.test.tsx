import { describe, expect, it, vi } from 'vitest'
import { act, renderHook, waitFor } from '@testing-library/react'
import { useCallback, useRef } from 'react'

import { useAsyncData } from '@/hooks/use-async-data'

/**
 * Общая загрузка данных для виджетов интерфейса.
 *
 * Запрос отменяется при размонтировании: ответ, пришедший к уже убранному
 * компоненту, попытался бы обновить состояние и оставил бы предупреждение
 * React вместо понятной ошибки.
 */

/** `load` обязана быть стабильной, иначе эффект перезапускается бесконечно. */
function useStableLoad<T>(fn: (signal: AbortSignal) => Promise<T>, fallback: T) {
  const ref = useRef(fn)
  const load = useCallback((signal: AbortSignal) => ref.current(signal), [])
  return useAsyncData(load, fallback)
}

describe('загрузка данных виджета', () => {
  describe('успешный ответ', () => {
    it('до ответа отдаётся запасное значение и признак загрузки', () => {
      const { result } = renderHook(() =>
        useStableLoad(() => new Promise<string[]>(() => {}), [] as string[]),
      )

      expect(result.current.loading).toBe(true)
      expect(result.current.data).toEqual([])
    })

    it('после ответа данные подставляются, загрузка снимается', async () => {
      const { result } = renderHook(() =>
        useStableLoad(async () => ['первое', 'второе'], [] as string[]),
      )

      await waitFor(() => expect(result.current.loading).toBe(false))
      expect(result.current.data).toEqual(['первое', 'второе'])
    })
  })

  describe('ошибка', () => {
    it('загрузка снимается, иначе виджет навсегда показывает спиннер', async () => {
      const { result } = renderHook(() =>
        useStableLoad(async () => {
          throw new Error('сеть недоступна')
        }, [] as string[]),
      )

      await waitFor(() => expect(result.current.loading).toBe(false))
    })

    it('данные остаются запасными, а не становятся undefined', async () => {
      const { result } = renderHook(() =>
        useStableLoad(async () => {
          throw new Error('сеть недоступна')
        }, ['запасное']),
      )

      await waitFor(() => expect(result.current.loading).toBe(false))
      expect(result.current.data).toEqual(['запасное'])
    })
  })

  describe('отмена', () => {
    it('в загрузку передаётся сигнал отмены', async () => {
      const load = vi.fn(async (_signal: AbortSignal) => [] as string[])
      renderHook(() => useStableLoad(load, [] as string[]))

      await waitFor(() => expect(load).toHaveBeenCalled())
      expect(load.mock.calls[0][0]).toBeInstanceOf(AbortSignal)
    })

    it('размонтирование отменяет запрос', async () => {
      let captured: AbortSignal | undefined
      const { unmount } = renderHook(() =>
        useStableLoad(async (signal) => {
          captured = signal
          return [] as string[]
        }, [] as string[]),
      )

      await waitFor(() => expect(captured).toBeDefined())
      unmount()

      expect(captured?.aborted).toBe(true)
    })

    it('ответ после размонтирования состояние не трогает', async () => {
      let resolve!: (value: string[]) => void
      const { result, unmount } = renderHook(() =>
        useStableLoad(() => new Promise<string[]>((r) => { resolve = r }), [] as string[]),
      )

      unmount()
      await act(async () => {
        resolve(['поздний ответ'])
      })

      expect(result.current.data).toEqual([])
    })
  })

  describe('повторный запрос', () => {
    it('reload вызывает загрузку заново', async () => {
      const load = vi.fn(async () => ['данные'])
      const { result } = renderHook(() => useStableLoad(load, [] as string[]))

      await waitFor(() => expect(result.current.loading).toBe(false))
      act(() => result.current.reload())

      await waitFor(() => expect(load).toHaveBeenCalledTimes(2))
    })

    it('reload стабилен между рендерами — его можно класть в зависимости', () => {
      const { result, rerender } = renderHook(() =>
        useStableLoad(async () => [] as string[], [] as string[]),
      )
      const first = result.current.reload
      rerender()

      expect(result.current.reload).toBe(first)
    })
  })

  describe('оптимистичная правка', () => {
    it('setData меняет данные до ответа сервера', async () => {
      const { result } = renderHook(() => useStableLoad(async () => ['с сервера'], [] as string[]))

      await waitFor(() => expect(result.current.loading).toBe(false))
      act(() => result.current.setData(['правка на клиенте']))

      expect(result.current.data).toEqual(['правка на клиенте'])
    })

    it('setData принимает функцию от предыдущего значения', async () => {
      const { result } = renderHook(() => useStableLoad(async () => ['первое'], [] as string[]))

      await waitFor(() => expect(result.current.loading).toBe(false))
      act(() => result.current.setData((prev) => [...prev, 'второе']))

      expect(result.current.data).toEqual(['первое', 'второе'])
    })
  })
})
