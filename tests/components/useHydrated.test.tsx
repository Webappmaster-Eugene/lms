import { describe, expect, it } from 'vitest'
import { renderHook } from '@testing-library/react'
import { renderToString } from 'react-dom/server'

import { useHydrated } from '@/hooks/use-hydrated'

/**
 * Хук существует ради расхождения сервера и клиента: на сервере он обязан
 * вернуть false, иначе разметка тем и порталов не совпадёт с клиентской
 * и React выбросит ошибку гидратации.
 */

function Probe() {
  return <>{useHydrated() ? 'клиент' : 'сервер'}</>
}

describe('признак завершённой гидратации', () => {
  it('при серверном рендере — false', () => {
    expect(renderToString(<Probe />)).toBe('сервер')
  })

  it('после монтирования в браузере — true', () => {
    const { result } = renderHook(() => useHydrated())

    expect(result.current).toBe(true)
  })

  it('значение стабильно между рендерами', () => {
    const { result, rerender } = renderHook(() => useHydrated())
    rerender()

    expect(result.current).toBe(true)
  })
})
