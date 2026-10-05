import { beforeAll, describe, expect, it } from 'vitest'

import { TRAINER_CATALOG, flattenCatalog } from '@/data/trainer'
import { practical } from '@/data/trainer/18-practical'
import { runInNodeVm, specFromSeed } from '../../helpers/trainer-sandbox'
import { compileSeedTypeScript, warmUpTypeScript } from '../../helpers/trainer-typescript'

const tasks = new Map(flattenCatalog(TRAINER_CATALOG).map(({ task }) => [task.slug, task]))

type Mutation = {
  slug: string
  flaw: string
  before: string
  after: string
}

const mutations: Mutation[] = [
  { slug: 'cursor-pagination', flaw: 'включает уже просмотренную запись', before: 'compare(row, cursor) > 0', after: 'compare(row, cursor) >= 0' },
  { slug: 'cursor-pagination', flaw: 'сравнивает курсор только по времени', before: "a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)", after: 'a.createdAt - b.createdAt' },
  { slug: 'reconcile-versioned-entities', flaw: 'равная версия затирает текущую', before: 'row.version > old.version', after: 'row.version >= old.version' },
  { slug: 'reconcile-versioned-entities', flaw: 'последний ответ побеждает независимо от версии', before: 'row.version > old.version', after: 'true' },
  { slug: 'json-merge-patch', flaw: 'null записывается вместо удаления свойства', before: 'delete result[key]', after: 'result[key] = null' },
  { slug: 'json-merge-patch', flaw: 'массив сливается по индексам', before: " && !Array.isArray(value)", after: '' },
  { slug: 'allocate-money', flaw: 'округление теряет сохранение общей суммы', before: 'Math.floor(total * weight / sum)', after: 'Math.round(total * weight / sum)' },
  { slug: 'allocate-money', flaw: 'остатки раздаются по индексу вместо величины', before: 'b.remainder - a.remainder || a.index - b.index', after: 'a.index - b.index' },
  { slug: 'form-error-summary', flaw: 'массивы формы игнорируются', before: 'else if (value !== null)', after: 'else if (value !== null && !Array.isArray(value))' },
  { slug: 'form-error-summary', flaw: 'пустые сообщения становятся ошибками', before: "if (value !== '')", after: 'if (true)' },
  { slug: 'stable-null-sort', flaw: 'null переносится в начало при desc', before: "if (a.score === null) return b.score === null ? 0 : 1", after: "if (a.score === null) return b.score === null ? 0 : direction === 'asc' ? 1 : -1" },
  { slug: 'stable-null-sort', flaw: 'сортирует исходный массив', before: 'rows.slice().sort', after: 'rows.sort' },
  { slug: 'parse-query-parameters', flaw: 'теряет знак равно внутри значения', before: 'pair.slice(index + 1)', after: "pair.slice(index + 1).split('=')[0]" },
  { slug: 'parse-query-parameters', flaw: 'один фильтр затирает предыдущий', before: 'result[key].push(value)', after: 'result[key] = [value]' },
  { slug: 'dependency-build-order', flaw: 'зависимости собираются в обратном порядке имён', before: '.sort()', after: '.sort().reverse()' },
  { slug: 'dependency-build-order', flaw: 'цикл считается частичной успешной сборкой', before: 'if (ready.length === 0) return null', after: 'if (ready.length === 0) return result' },
  { slug: 'collect-api-pages', flaw: 'пустой курсор считается концом', before: 'page.nextCursor === null', after: '!page.nextCursor' },
  { slug: 'collect-api-pages', flaw: 'цикл молча возвращает неполные данные', before: "throw new Error('Cursor cycle')", after: 'return result' },
  { slug: 'latest-request-wins', flaw: 'устаревший ответ меняет интерфейс', before: 'if (own === sequence) commit(value)', after: 'commit(value)' },
  { slug: 'latest-request-wins', flaw: 'не обновляет номер нового запроса', before: 'const own = ++sequence', after: 'const own = sequence' },
  { slug: 'deep-equal', flaw: 'одинаковое количество ключей ошибочно достаточно', before: 'Object.prototype.hasOwnProperty.call(b, key) && ', after: '' },
  { slug: 'flatten-object', flaw: 'пустые структуры теряются при обходе', before: 'if (!isPlain || entries.length === 0)', after: 'if (!isPlain)' },
  { slug: 'get-by-path', flaw: 'ложные значения подменяются default', before: 'current === undefined ? defaultValue : current', after: '!current ? defaultValue : current' },
  { slug: 'deep-merge', flaw: 'ложные значения источника игнорируются', before: 'if (value === undefined) continue', after: 'if (!value) continue' },
  { slug: 'chunk', flaw: 'отрицательный размер становится положительным', before: 'function chunk(array, size) {', after: 'function chunk(array, size) { size = Math.abs(size)' },
  { slug: 'uniq-by', flaw: 'ключи разных типов приводятся к строке', before: 'const itemKey = getKey(item)', after: 'const itemKey = String(getKey(item))' },
  { slug: 'two-sum', flaw: 'индекс ноль считается отсутствующим', before: 'if (seen.has(complement))', after: 'if (seen.get(complement))' },
  { slug: 'valid-parentheses', flaw: 'не проверяет незакрытый хвост', before: 'return stack.length === 0', after: 'return true' },
  { slug: 'contains-duplicate', flaw: 'indexOf не распознаёт NaN', before: 'function containsDuplicate(nums) {', after: 'function containsDuplicate(nums) { return nums.some((n, i) => nums.indexOf(n) !== i)' },
  { slug: 'best-time-to-buy-sell', flaw: 'сбрасывает лучшую прибыль на каждом шаге', before: 'else if (price - minPrice > best) best = price - minPrice', after: 'else best = price - minPrice' },
]

describe('качество проверок прикладных задач', () => {
  beforeAll(warmUpTypeScript, 60000)

  it('у каждой исполняемой новой задачи есть публичный прогон и скрытые кейсы', () => {
    for (const task of practical.tasks.filter(task => task.checkMode === 'unit')) {
      expect(task.cases?.some(item => item.hidden), task.slug).toBe(true)
      expect(task.cases?.some(item => !item.hidden) || Boolean(task.testCode), task.slug).toBe(true)
    }
  })

  it.each(mutations)('$slug: отвергает решение, которое $flaw', async ({ slug, before, after }) => {
    const task = tasks.get(slug)
    if (!task) throw new Error(`Задача ${slug} не найдена`)
    expect(task.solutionCode.includes(before), 'мутация должна изменять эталон, а не стать пустой проверкой').toBe(true)
    const wrong = task.solutionCode.replace(before, after)
    const result = await runInNodeVm(specFromSeed(task, 'js', wrong))
    expect(result.status).not.toBe('passed')
    expect(result.tests.some(test => !test.passed), 'нужен провал проверки поведения, а не синтаксическая ошибка мутанта').toBe(true)
  })

  it.each([
    {
      slug: 'ts-event-payload-map',
      wrong: `type EventArgs<Events, K extends keyof Events> = Events[K] extends void ? [] : [Events[K]]`,
    },
    {
      slug: 'ts-deep-patch',
      wrong: `type DeepPatch<T> = T extends object ? { [K in keyof T]?: DeepPatch<T[K]> } : T`,
    },
  ])('$slug: отклоняет слишком широкое преобразование типов', async ({ slug, wrong }) => {
    const task = tasks.get(slug)
    if (!task) throw new Error(`Задача ${slug} не найдена`)
    const diagnostics = await compileSeedTypeScript(task, wrong)
    expect(diagnostics.some(item => item.category === 'error')).toBe(true)
  })
})
