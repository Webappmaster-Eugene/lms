import { describe, expect, it } from 'vitest'

import { FRONTEND_ENTRY_TASKS } from '@/data/bootcamp-entry/frontend-tasks'
import { entryTaskSetOf, ENTRY_TASK_SETS } from '@/data/bootcamp-entry/sets'
import { entryTaskSpec } from '@/data/bootcamp-entry/tasks'
import { buildExecSpec, publicCases } from '@/lib/trainer/spec'
import { runInNodeVm, sandboxTestTimeoutMs } from '../helpers/trainer-sandbox'

const run = (slug: string, code: string) => {
  const task = FRONTEND_ENTRY_TASKS.find((item) => item.slug === slug)
  if (!task) throw new Error(`Нет задачи ${slug}`)
  return runInNodeVm(buildExecSpec(entryTaskSpec(task), 'js', code))
}

describe('вход в React + Next.js: проверяем JavaScript до обучения React', () => {
  it('программа выбирает собственный набор, прежний набор Node.js сохранён', () => {
    expect(entryTaskSetOf('rental-frontend-js').tasks).toBe(FRONTEND_ENTRY_TASKS)
    expect(entryTaskSetOf('rental-js').tasks).not.toBe(FRONTEND_ENTRY_TASKS)
    const slugs = ENTRY_TASK_SETS.flatMap((set) => set.tasks.map((task) => task.slug))
    expect(new Set(slugs).size).toBe(slugs.length)
  })

  it.each(FRONTEND_ENTRY_TASKS)('$slug: эталон проходит, заготовка не решает задание', async (task) => {
    expect(publicCases(entryTaskSpec(task))).toHaveLength(task.cases.length)
    const result = await run(task.slug, task.solutionCode)
    expect(result.status, JSON.stringify(result.tests.filter((test) => !test.passed))).toBe('passed')
    expect(result.passedCount).toBe(task.cases.length)
    expect((await run(task.slug, task.starterCode)).status).not.toBe('passed')
  }, sandboxTestTimeoutMs(3000))

  it.each([
    ['frontend-catalog-filter', 'фильтрация без проверки доступности', 'function availableIds(items, q) { return items.filter(x => x.name.toLowerCase().includes(q.trim().toLowerCase())).map(x => x.id) }'],
    ['frontend-catalog-filter', 'точное совпадение вместо поиска внутри названия', 'function availableIds(items, q) { return items.filter(x => x.available && x.name.toLowerCase() === q.trim().toLowerCase()).map(x => x.id) }'],
    ['frontend-search-query', 'нет кодирования пользовательского запроса', 'function catalogQuery(q, p) { return "?" + (q.trim() ? "q=" + q.trim() + "&" : "") + "offset=" + (p - 1) * 20 + "&limit=20" }'],
    ['frontend-search-query', 'первая страница начинается с offset 20', 'function catalogQuery(q, p) { return "?" + (q.trim() ? "q=" + encodeURIComponent(q.trim()) + "&" : "") + "offset=" + p * 20 + "&limit=20" }'],
    ['frontend-catalog-update', 'подмена объекта теряет прежние поля', 'function updateCatalog(items, patch) { return items.map(x => x.id === patch.id ? patch : x) }'],
    ['frontend-catalog-update', 'изменение исходного объекта', 'function updateCatalog(items, patch) { return items.map(x => { if (x.id === patch.id) Object.assign(x, patch); return x }) }'],
    ['frontend-catalog-update', 'добавление неизвестного ID', 'function updateCatalog(items, patch) { return items.some(x => x.id === patch.id) ? items.map(x => x.id === patch.id ? {...x, ...patch} : x) : [...items, patch] }'],
  ])('%s: тесты обнаруживают ошибку «%s»', async (slug, _reason, code) => {
    expect((await run(slug, code)).status).not.toBe('passed')
  }, sandboxTestTimeoutMs(3000))

  it('условия используют короткий дефис и не требуют React', () => {
    expect(FRONTEND_ENTRY_TASKS.map((task) => task.descriptionMd).join('\n')).not.toMatch(/[—–]/)
  })
})
