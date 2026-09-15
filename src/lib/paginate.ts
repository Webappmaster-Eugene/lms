/**
 * Постраничный сбор всех документов Payload.
 *
 * Сортировка обязана быть детерминированной (`sort: 'id'`, либо поле плюс `id` вторым
 * ключом): при неоднозначном порядке строки между страницами дублируются и теряются.
 *
 * `maxPages` — предохранитель от бесконечного цикла, а не лимит выборки: при
 * срабатывании бросается ошибка, неполный список не возвращается.
 */

/** Минимум, который нужен от ответа `payload.find`. */
export type PaginatedPage<T> = {
  readonly docs: readonly T[]
  readonly hasNextPage: boolean
}

export type CollectAllPagesOptions = {
  /** Размер страницы. По умолчанию 500. */
  readonly pageSize?: number
  /** Предохранитель от бесконечного цикла. По умолчанию 100 страниц. */
  readonly maxPages?: number
  /** Что именно выбирается — попадёт в текст ошибки. */
  readonly label?: string
}

const DEFAULT_PAGE_SIZE = 500
const DEFAULT_MAX_PAGES = 100

export async function collectAllPages<T>(
  fetchPage: (args: { page: number; limit: number }) => Promise<PaginatedPage<T>>,
  options: CollectAllPagesOptions = {},
): Promise<T[]> {
  const {
    pageSize = DEFAULT_PAGE_SIZE,
    maxPages = DEFAULT_MAX_PAGES,
    label = 'выборка',
  } = options

  if (!Number.isInteger(pageSize) || pageSize < 1) {
    throw new RangeError(`pageSize должен быть целым положительным числом, получено: ${pageSize}`)
  }

  if (!Number.isInteger(maxPages) || maxPages < 1) {
    throw new RangeError(`maxPages должен быть целым положительным числом, получено: ${maxPages}`)
  }

  const docs: T[] = []

  for (let page = 1; page <= maxPages; page += 1) {
    const result = await fetchPage({ page, limit: pageSize })

    for (const doc of result.docs) docs.push(doc)

    if (!result.hasNextPage) return docs
  }

  throw new Error(
    `${label}: превышен предохранитель в ${maxPages} страниц по ${pageSize} документов ` +
      `(собрано ${docs.length}). Это не повод поднимать предел — сузьте запрос.`,
  )
}
