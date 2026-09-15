import { describe, it, expect, vi } from 'vitest'

import { collectAllPages, type PaginatedPage } from '@/lib/paginate'

/**
 * Имитация `payload.find`: отдаёт документы страницами и запоминает,
 * с какими аргументами её вызывали.
 */
function fakeCollection(total: number) {
  const all = Array.from({ length: total }, (_, i) => ({ id: i + 1 }))
  const calls: Array<{ page: number; limit: number }> = []

  const fetchPage = async ({
    page,
    limit,
  }: {
    page: number
    limit: number
  }): Promise<PaginatedPage<{ id: number }>> => {
    calls.push({ page, limit })
    const from = (page - 1) * limit
    const docs = all.slice(from, from + limit)
    return { docs, hasNextPage: from + limit < total }
  }

  return { all, calls, fetchPage }
}

describe('collectAllPages', () => {
  it('собирает документы со всех страниц и сохраняет порядок', async () => {
    const { all, calls, fetchPage } = fakeCollection(1250)

    const docs = await collectAllPages(fetchPage, { pageSize: 500 })

    expect(docs).toEqual(all)
    expect(calls).toEqual([
      { page: 1, limit: 500 },
      { page: 2, limit: 500 },
      { page: 3, limit: 500 },
    ])
  })

  it('на ровном числе страниц не делает лишнего запроса', async () => {
    // Граничный случай: последняя страница заполнена целиком, но hasNextPage уже false
    const { calls, fetchPage } = fakeCollection(1000)

    const docs = await collectAllPages(fetchPage, { pageSize: 500 })

    expect(docs).toHaveLength(1000)
    expect(calls).toHaveLength(2)
  })

  it('пустая коллекция — один запрос и пустой результат', async () => {
    const { calls, fetchPage } = fakeCollection(0)

    await expect(collectAllPages(fetchPage)).resolves.toEqual([])
    expect(calls).toHaveLength(1)
  })

  it('не обрезает выборку молча: на предохранителе бросает ошибку', async () => {
    const { fetchPage } = fakeCollection(1000)

    const promise = collectAllPages(fetchPage, {
      pageSize: 10,
      maxPages: 3,
      label: 'уроки роадмапа «frontend-react»',
    })

    await expect(promise).rejects.toThrow(/уроки роадмапа «frontend-react»/)
    await expect(promise).rejects.toThrow(/собрано 30/)
  })

  it('ошибка предохранителя объясняет, что предел поднимать не надо', async () => {
    const { fetchPage } = fakeCollection(1000)

    await expect(
      collectAllPages(fetchPage, { pageSize: 10, maxPages: 2 }),
    ).rejects.toThrow(/сузьте запрос/)
  })

  it('ошибка запроса пробрасывается, а не превращается в неполный список', async () => {
    const fetchPage = vi
      .fn<(args: { page: number; limit: number }) => Promise<PaginatedPage<{ id: number }>>>()
      .mockResolvedValueOnce({ docs: [{ id: 1 }], hasNextPage: true })
      .mockRejectedValueOnce(new Error('соединение с БД потеряно'))

    await expect(collectAllPages(fetchPage, { pageSize: 1 })).rejects.toThrow(
      'соединение с БД потеряно',
    )
  })

  it.each([0, -1, 1.5, Number.NaN])('отвергает некорректный pageSize: %s', async (pageSize) => {
    const { fetchPage } = fakeCollection(10)

    await expect(collectAllPages(fetchPage, { pageSize })).rejects.toThrow(RangeError)
  })

  it.each([0, -1, 2.5, Number.NaN])('отвергает некорректный maxPages: %s', async (maxPages) => {
    const { fetchPage } = fakeCollection(10)

    await expect(collectAllPages(fetchPage, { maxPages })).rejects.toThrow(RangeError)
  })
})
