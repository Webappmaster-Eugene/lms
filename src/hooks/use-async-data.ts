'use client'

import { useCallback, useEffect, useState, type Dispatch, type SetStateAction } from 'react'

type AsyncData<T> = {
  data: T
  loading: boolean
  reload: () => void
  /** Оптимистичная правка загруженных данных — до того, как сервер подтвердит изменение. */
  setData: Dispatch<SetStateAction<T>>
}

/**
 * Загрузка данных из API: запрос отменяется при размонтировании и при смене `load`,
 * поэтому ответ, пришедший после ухода со страницы, не попадает в состояние.
 *
 * `load` обязана быть стабильной — оборачивайте её в useCallback, иначе эффект
 * перезапускается на каждом рендере.
 */
export function useAsyncData<T>(load: (signal: AbortSignal) => Promise<T>, fallback: T): AsyncData<T> {
  const [data, setData] = useState<T>(fallback)
  const [loading, setLoading] = useState(true)
  const [attempt, setAttempt] = useState(0)

  const reload = useCallback(() => setAttempt((n) => n + 1), [])

  useEffect(() => {
    const controller = new AbortController()

    load(controller.signal)
      .then((result) => {
        if (controller.signal.aborted) return
        setData(result)
        setLoading(false)
      })
      .catch(() => {
        if (controller.signal.aborted) return
        setLoading(false)
      })

    return () => controller.abort()
  }, [load, attempt])

  return { data, loading, reload, setData }
}
