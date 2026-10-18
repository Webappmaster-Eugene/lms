import { act, renderHook } from '@testing-library/react'
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest'
import { useUrlSearchText } from '@/hooks/use-url-search-text'

/**
 * На медленной сети адрес догоняет ввод с опозданием. Раньше поле принимало любое новое
 * значение из адреса: «Основы веба» превращалось в «Основыа» — пропадали символы, набранные
 * за время запроса, и пробел, срезанный trim().
 */
let writes: string[]

beforeEach(() => {
  vi.useFakeTimers()
  writes = []
})
afterEach(() => vi.useRealTimers())

function setup(initial = '') {
  return renderHook(({ url }) => useUrlSearchText(url, (value) => writes.push(value), 300), { initialProps: { url: initial } })
}

describe('поиск, синхронизированный с адресом', () => {
  it('поздний ответ на собственный запрос не стирает продолжение ввода и пробел', () => {
    const view = setup()
    act(() => view.result.current[1]('Основы '))
    act(() => { vi.advanceTimersByTime(300) })
    expect(writes).toEqual(['Основы'])

    act(() => view.result.current[1]('Основы ве'))
    view.rerender({ url: 'Основы' })
    expect(view.result.current[0]).toBe('Основы ве')

    act(() => { vi.advanceTimersByTime(300) })
    view.rerender({ url: 'Основы ве' })
    expect(writes).toEqual(['Основы', 'Основы ве'])
    expect(view.result.current[0]).toBe('Основы ве')
  })

  it('пишет в адрес один раз после паузы и не пишет пробелы по краям', () => {
    const view = setup('react')
    act(() => view.result.current[1]('react '))
    act(() => { vi.advanceTimersByTime(1000) })
    expect(writes).toEqual([])
    act(() => view.result.current[1]('re'))
    act(() => { vi.advanceTimersByTime(100) })
    act(() => view.result.current[1]('redux'))
    act(() => { vi.advanceTimersByTime(299) })
    expect(writes).toEqual([])
    act(() => { vi.advanceTimersByTime(1) })
    expect(writes).toEqual(['redux'])
  })

  it('чужое изменение адреса — назад, сброс, ссылка — поле принимает', () => {
    const view = setup('hooks')
    view.rerender({ url: '' })
    expect(view.result.current[0]).toBe('')
    view.rerender({ url: 'hooks' })
    expect(view.result.current[0]).toBe('hooks')
    act(() => { vi.advanceTimersByTime(1000) })
    expect(writes).toEqual([])
  })
})
