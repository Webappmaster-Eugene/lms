import { afterEach, describe, expect, it, vi } from 'vitest'

/**
 * Очередь загрузок файлов урока. Прокси отдаёт ученику не больше шести файлов сразу,
 * поэтому листалка обязана держать параллельность ниже этого предела сама.
 */
async function queue() {
  vi.resetModules()
  return (await import('@/lib/load-queue')).requestLoadSlot
}

afterEach(() => vi.useRealTimers())

describe('очередь загрузок файлов урока', () => {
  it('одновременно идёт не больше трёх загрузок, остальные ждут по порядку', async () => {
    const request = await queue()
    const started: number[] = []
    const releases = [1, 2, 3, 4, 5].map((id) => request(() => started.push(id)))
    expect(started).toEqual([1, 2, 3])
    releases[1]()
    expect(started).toEqual([1, 2, 3, 4])
    releases[0]()
    expect(started).toEqual([1, 2, 3, 4, 5])
  })

  it('срочная заявка обходит ожидающих: текущий слайд не ждёт соседних', async () => {
    const request = await queue()
    const started: string[] = []
    const busy = ['a', 'b', 'c'].map((id) => request(() => started.push(id)))
    request(() => started.push('сосед'))
    request(() => started.push('текущий'), true)
    busy[0]()
    expect(started.at(-1)).toBe('текущий')
  })

  it('снятая заявка не запускается и не занимает место', async () => {
    const request = await queue()
    const started: string[] = []
    const busy = ['a', 'b', 'c'].map((id) => request(() => started.push(id)))
    const cancel = request(() => started.push('ушёл со слайда'))
    request(() => started.push('следующий'))
    cancel()
    busy[0]()
    expect(started).toEqual(['a', 'b', 'c', 'следующий'])
  })

  it('повторное освобождение не отдаёт чужое место', async () => {
    const request = await queue()
    const started: number[] = []
    const first = request(() => started.push(1))
    request(() => started.push(2))
    request(() => started.push(3))
    request(() => started.push(4))
    request(() => started.push(5))
    first()
    first()
    expect(started).toEqual([1, 2, 3, 4])
  })

  it('зависшая загрузка через минуту уступает место', async () => {
    vi.useFakeTimers()
    const request = await queue()
    const started: number[] = []
    for (const id of [1, 2, 3, 4]) request(() => started.push(id))
    vi.advanceTimersByTime(59_000)
    expect(started).toEqual([1, 2, 3])
    vi.advanceTimersByTime(1_000)
    expect(started).toEqual([1, 2, 3, 4])
  })
})
