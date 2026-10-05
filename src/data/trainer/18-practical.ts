import type { TrainerTaskSeed, TrainerTopicSeed } from './types'
import { raw } from '@/lib/trainer/literal'

function typeTask(task: Omit<TrainerTaskSeed, 'languages' | 'checkMode' | 'starterCode' | 'solutionCode'> & {
  starterCodeTs: string
  solutionCodeTs: string
}): TrainerTaskSeed {
  return { ...task, languages: ['ts'], checkMode: 'types', starterCode: task.starterCodeTs, solutionCode: task.solutionCodeTs }
}

export const practical: TrainerTopicSeed = {
  slug: 'practical-development',
  title: 'Практика разработки',
  description: 'Пагинация API, гонки запросов, денежные расчёты, формы и типизированные события',
  category: 'javascript',
  icon: '🛠️',
  order: 18,
  tasks: [
    {
      slug: 'cursor-pagination',
      title: 'Пагинация по составному курсору',
      difficulty: 'medium',
      languages: ['js', 'ts'],
      checkMode: 'unit',
      entryName: 'paginate',
      tags: ['arrays', 'algorithms'],
      descriptionMd: `API выдаёт записи { id: string, createdAt: number }. Реализуйте paginate(rows, cursor, limit).

Верните { items, nextCursor }: записи упорядочены по createdAt, затем по id (обычное сравнение строк через <). Курсор — пара { createdAt, id } последней просмотренной записи или null. Отберите только записи строго после курсора. Самой записи курсора в массиве может уже не быть.

items содержит максимум limit записей. nextCursor равен паре последней возвращённой записи, только если остались следующие записи; иначе null. При limit <= 0 верните пустую страницу. Входной массив не меняйте. Пары уникальны, limit — целое число.

Пример: paginate([{ id: 'b', createdAt: 1 }, { id: 'a', createdAt: 1 }], null, 1) возвращает { items: [{ id: 'a', createdAt: 1 }], nextCursor: { createdAt: 1, id: 'a' } }.`,
      starterCode: `function paginate(rows, cursor, limit) {
  // Ваш код здесь
}`,
      starterCodeTs: `type Row = { id: string; createdAt: number }
function paginate(rows: Row[], cursor: Row | null, limit: number): { items: Row[]; nextCursor: Row | null } {
  // Ваш код здесь
}`,
      solutionCode: `function paginate(rows, cursor, limit) {
  if (limit <= 0) return { items: [], nextCursor: null }
  const compare = (a, b) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  const sorted = rows.filter(row => cursor === null || compare(row, cursor) > 0).sort(compare)
  const items = sorted.slice(0, limit)
  const last = items[items.length - 1]
  return { items, nextCursor: sorted.length > limit ? { id: last.id, createdAt: last.createdAt } : null }
}`,
      solutionCodeTs: `type Row = { id: string; createdAt: number }
function paginate(rows: Row[], cursor: Row | null, limit: number): { items: Row[]; nextCursor: Row | null } {
  if (limit <= 0) return { items: [], nextCursor: null }
  const compare = (a: Row, b: Row) => a.createdAt - b.createdAt || (a.id < b.id ? -1 : a.id > b.id ? 1 : 0)
  const sorted = rows.filter(row => cursor === null || compare(row, cursor) > 0).sort(compare)
  const items = sorted.slice(0, limit)
  const last = items[items.length - 1]
  return { items, nextCursor: sorted.length > limit ? { id: last.id, createdAt: last.createdAt } : null }
}`,
      solutionNotes: 'Курсор сравнивается как пара, а не ищется по индексу: удаление записи не должно возвращать читателя в начало. Сортировка выполняется на новом массиве.',
      hints: ['Один компаратор нужен и сортировке, и фильтру курсора.', 'Для nextCursor нужно знать, осталась ли хотя бы одна запись.'],
      cases: [
        { name: 'одинаковое время', args: [[{ id: 'b', createdAt: 1 }, { id: 'a', createdAt: 1 }], null, 1], expected: { items: [{ id: 'a', createdAt: 1 }], nextCursor: { id: 'a', createdAt: 1 } } },
        { name: 'конец списка', args: [[{ id: 'a', createdAt: 1 }], null, 1], expected: { items: [{ id: 'a', createdAt: 1 }], nextCursor: null } },
        { name: 'пустой список', args: [[], null, 5], expected: { items: [], nextCursor: null } },
        { name: 'удалённый курсор', args: [[{ id: 'a', createdAt: 1 }, { id: 'c', createdAt: 1 }, { id: 'z', createdAt: 2 }], { id: 'b', createdAt: 1 }, 1], expected: { items: [{ id: 'c', createdAt: 1 }], nextCursor: { id: 'c', createdAt: 1 } }, hidden: true },
        { name: 'курсором нельзя вернуть ту же запись', args: [[{ id: 'a', createdAt: 1 }, { id: 'b', createdAt: 1 }], { id: 'a', createdAt: 1 }, 1], expected: { items: [{ id: 'b', createdAt: 1 }], nextCursor: null }, hidden: true },
        { name: 'после последней записи', args: [[{ id: 'a', createdAt: 1 }], { id: 'z', createdAt: 2 }, 3], expected: { items: [], nextCursor: null }, hidden: true },
        { name: 'нулевой лимит', args: [[{ id: 'a', createdAt: 1 }], null, 0], expected: { items: [], nextCursor: null }, hidden: true },
      ],
      testCode: `test('не сортирует входной массив на месте', function () {
  const rows = [{ id: 'b', createdAt: 2 }, { id: 'a', createdAt: 1 }]
  paginate(rows, null, 10)
  expect(rows.map(row => row.id)).toEqual(['b', 'a'])
})`,
    },
    {
      slug: 'reconcile-versioned-entities',
      title: 'Слияние ответов API по версии',
      difficulty: 'medium',
      languages: ['js', 'ts'],
      checkMode: 'unit',
      entryName: 'reconcile',
      tags: ['objects', 'arrays'],
      descriptionMd: `Два ответа API могут прийти в разном порядке. Напишите reconcile(current, incoming) для записей { id: string, version: number, value: string }.

Для каждого id сохраняется запись с максимальной version. При равных версиях выигрывает уже сохранённая запись. Порядок результата — порядок первого появления id: сначала current, затем новые id из incoming. Повторы возможны в обоих массивах. Не изменяйте входные массивы и объекты.

Пример: текущая запись с version: 3 не заменяется пришедшей позже записью с version: 2. Пустые массивы допустимы.`,
      starterCode: `function reconcile(current, incoming) {
  // Ваш код здесь
}`,
      starterCodeTs: `type Entity = { id: string; version: number; value: string }
function reconcile(current: Entity[], incoming: Entity[]): Entity[] {
  // Ваш код здесь
}`,
      solutionCode: `function reconcile(current, incoming) {
  const byId = new Map()
  for (const row of [...current, ...incoming]) {
    const old = byId.get(row.id)
    if (!old || row.version > old.version) byId.set(row.id, row)
  }
  return [...byId.values()]
}`,
      solutionCodeTs: `type Entity = { id: string; version: number; value: string }
function reconcile(current: Entity[], incoming: Entity[]): Entity[] {
  const byId = new Map<string, Entity>()
  for (const row of [...current, ...incoming]) {
    const old = byId.get(row.id)
    if (!old || row.version > old.version) byId.set(row.id, row)
  }
  return [...byId.values()]
}`,
      solutionNotes: 'Map сохраняет позицию ключа при замене значения. Строгое сравнение версии не даёт равной версии затереть выбранную запись.',
      cases: [
        { name: 'новая версия', args: [[{ id: 'a', version: 1, value: 'old' }], [{ id: 'a', version: 2, value: 'new' }]], expected: [{ id: 'a', version: 2, value: 'new' }] },
        { name: 'добавление', args: [[], [{ id: 'b', version: 1, value: 'B' }]], expected: [{ id: 'b', version: 1, value: 'B' }] },
        { name: 'оба массива пусты', args: [[], []], expected: [] },
        { name: 'старая и равная версии', args: [[{ id: 'a', version: 3, value: 'keep' }], [{ id: 'a', version: 2, value: 'old' }, { id: 'a', version: 3, value: 'equal' }]], expected: [{ id: 'a', version: 3, value: 'keep' }], hidden: true },
        { name: 'повторы и стабильный порядок', args: [[{ id: 'z', version: 1, value: 'Z' }, { id: 'a', version: 1, value: 'A' }], [{ id: 'b', version: 1, value: 'B' }, { id: 'z', version: 2, value: 'Z2' }, { id: 'b', version: 2, value: 'B2' }]], expected: [{ id: 'z', version: 2, value: 'Z2' }, { id: 'a', version: 1, value: 'A' }, { id: 'b', version: 2, value: 'B2' }], hidden: true },
        { name: 'id похож на свойство прототипа', args: [[], [{ id: '__proto__', version: 0, value: 'safe' }]], expected: [{ id: '__proto__', version: 0, value: 'safe' }], hidden: true },
      ],
      testCode: `test('источники не изменяются', function () {
  const row = Object.freeze({ id: 'a', version: 1, value: 'A' })
  const current = Object.freeze([row])
  expect(reconcile(current, [])).toEqual([row])
  expect(current.length).toBe(1)
})`,
    },
    {
      slug: 'json-merge-patch',
      title: 'Частичное обновление JSON-документа',
      difficulty: 'medium',
      languages: ['js', 'ts'],
      checkMode: 'unit',
      entryName: 'mergePatch',
      tags: ['objects', 'recursion'],
      descriptionMd: `Реализуйте mergePatch(target, patch) для JSON-значений. Если patch — объект (не null и не массив), его свойства рекурсивно накладываются на target; target другого типа при этом считается пустым объектом. Значение null внутри объекта patch удаляет свойство. Массивы и примитивы заменяют target целиком.

Не изменяйте target и patch. Ключи __proto__, constructor и prototype в объектах patch пропускайте на любой глубине. Входные данные ацикличны. Глубокое копирование нетронутых веток не требуется.

Пример: mergePatch({ name: 'Анна', city: 'Москва' }, { city: null, age: 25 }) возвращает { name: 'Анна', age: 25 }. Сам patch === null возвращает null, а не удаление документа.`,
      starterCode: `function mergePatch(target, patch) {
  // Ваш код здесь
}`,
      starterCodeTs: `type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
function mergePatch(target: Json, patch: Json): Json {
  // Ваш код здесь
}`,
      solutionCode: `function mergePatch(target, patch) {
  const isObject = value => value !== null && typeof value === 'object' && !Array.isArray(value)
  if (!isObject(patch)) return patch
  const result = isObject(target) ? { ...target } : {}
  for (const key of Object.keys(patch)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) continue
    if (patch[key] === null) delete result[key]
    else result[key] = mergePatch(Object.prototype.hasOwnProperty.call(result, key) ? result[key] : null, patch[key])
  }
  return result
}`,
      solutionCodeTs: `type Json = null | boolean | number | string | Json[] | { [key: string]: Json }
function mergePatch(target: Json, patch: Json): Json {
  const isObject = (value: Json): value is { [key: string]: Json } => value !== null && typeof value === 'object' && !Array.isArray(value)
  if (!isObject(patch)) return patch
  const result: { [key: string]: Json } = isObject(target) ? { ...target } : {}
  for (const key of Object.keys(patch)) {
    if (['__proto__', 'constructor', 'prototype'].includes(key)) continue
    if (patch[key] === null) delete result[key]
    else result[key] = mergePatch(Object.prototype.hasOwnProperty.call(result, key) ? result[key] : null, patch[key])
  }
  return result
}`,
      solutionNotes: 'Различайте null на верхнем уровне и null как значение свойства. Массив заменяется полностью. Собственные свойства и фильтр опасных ключей защищают рекурсивный обход.',
      cases: [
        { name: 'добавление и удаление', args: [{ name: 'Анна', city: 'Москва' }, { city: null, age: 25 }], expected: { name: 'Анна', age: 25 } },
        { name: 'вложенное обновление', args: [{ profile: { a: 1, b: 2 } }, { profile: { b: 3 } }], expected: { profile: { a: 1, b: 3 } } },
        { name: 'замена массива', args: [{ tags: ['a', 'b'] }, { tags: ['c'] }], expected: { tags: ['c'] } },
        { name: 'null на верхнем уровне', args: [{ a: 1 }, null], expected: null, hidden: true },
        { name: 'объект поверх примитива', args: [42, { nested: { a: 1, b: null } }], expected: { nested: { a: 1 } }, hidden: true },
        { name: 'опасные ключи', args: [{ ok: 1 }, raw(`JSON.parse('{"__proto__":{"polluted":true},"nested":{"constructor":1,"prototype":2,"x":3}}')`)], expected: { ok: 1, nested: { x: 3 } }, hidden: true },
      ],
      testCode: `test('не изменяет вложенные данные', function () {
  const target = { a: { b: 1, c: 2 } }
  const patch = { a: { b: null } }
  expect(mergePatch(target, patch)).toEqual({ a: { c: 2 } })
  expect(target).toEqual({ a: { b: 1, c: 2 } })
  expect(patch).toEqual({ a: { b: null } })
  expect({}.polluted).toBe(undefined)
})`,
    },
    {
      slug: 'allocate-money',
      title: 'Распределение суммы без потерянных копеек',
      difficulty: 'medium',
      languages: ['js', 'ts'],
      checkMode: 'unit',
      entryName: 'allocate',
      tags: ['arrays', 'algorithms'],
      descriptionMd: `Распределите целое количество копеек total пропорционально целым весам weights. Используйте метод наибольших остатков: сначала округлите каждую долю вниз, затем выдайте оставшиеся копейки в порядке убывания дробного остатка. При равных остатках меньший индекс выигрывает.

Верните целочисленный массив, сумма которого точно равна total. Нулевой вес получает ноль. total >= 0, weights неотрицательны; суммарный вес положителен. Для пустого weights допустим только total === 0 — верните []. Произведения total * weight укладываются в безопасное целое JS. Входной массив не меняйте.

allocate(10, [1, 1, 1]) → [4, 3, 3]; allocate(7, [1, 2]) → [2, 5].`,
      starterCode: `function allocate(total, weights) {
  // Ваш код здесь
}`,
      starterCodeTs: `function allocate(total: number, weights: number[]): number[] {
  // Ваш код здесь
}`,
      solutionCode: `function allocate(total, weights) {
  const sum = weights.reduce((a, b) => a + b, 0)
  const result = weights.map(weight => Math.floor(total * weight / sum))
  const order = weights.map((weight, index) => ({ index, remainder: total * weight % sum }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index)
  let left = total - result.reduce((a, b) => a + b, 0)
  for (const item of order) {
    if (left === 0) break
    result[item.index] += 1
    left -= 1
  }
  return result
}`,
      solutionCodeTs: `function allocate(total: number, weights: number[]): number[] {
  const sum = weights.reduce((a, b) => a + b, 0)
  const result = weights.map(weight => Math.floor(total * weight / sum))
  const order = weights.map((weight, index) => ({ index, remainder: total * weight % sum }))
    .sort((a, b) => b.remainder - a.remainder || a.index - b.index)
  let left = total - result.reduce((a, b) => a + b, 0)
  for (const item of order) {
    if (left === 0) break
    result[item.index] += 1
    left -= 1
  }
  return result
}`,
      solutionNotes: 'Сравнивайте остатки целочисленного деления, чтобы одинаковые дробные доли не расходились из-за представления float. Округление каждой доли через Math.round не сохраняет общую сумму.',
      cases: [
        { name: 'равные доли', args: [10, [1, 1, 1]], expected: [4, 3, 3] },
        { name: 'разные веса', args: [7, [1, 2]], expected: [2, 5] },
        { name: 'без суммы', args: [0, [2, 3]], expected: [0, 0] },
        { name: 'нулевой вес', args: [2, [0, 1, 1, 1]], expected: [0, 1, 1, 0], hidden: true },
        { name: 'остатки важнее индекса', args: [5, [1, 3, 3]], expected: [1, 2, 2], hidden: true },
        { name: 'один получатель', args: [12345, [7]], expected: [12345], hidden: true },
        { name: 'пустое распределение', args: [0, []], expected: [], hidden: true },
      ],
    },
    {
      slug: 'form-error-summary',
      title: 'Ошибки вложенной формы',
      difficulty: 'easy',
      languages: ['js', 'ts'],
      checkMode: 'unit',
      entryName: 'summarizeErrors',
      tags: ['objects', 'recursion'],
      descriptionMd: `Форма хранит дерево ошибок: строки — сообщения, объекты и массивы — вложенные поля, null — отсутствие ошибки. Напишите summarizeErrors(tree), возвращающую массив { path: string, message: string }.

Путь состоит из ключей через точку; индексы массива тоже сегменты пути. Корневая строка имеет path: ''. Пустые строки и null пропускаются. Порядок обхода — Object.keys для объектов и возрастающие индексы для массивов. Вход не меняйте. Ключи не содержат точек, дерево ациклично.

summarizeErrors({ email: 'Неверный адрес', users: [null, { name: 'Обязательно' }] }) → [{ path: 'email', message: 'Неверный адрес' }, { path: 'users.1.name', message: 'Обязательно' }].`,
      starterCode: `function summarizeErrors(tree) {
  // Ваш код здесь
}`,
      starterCodeTs: `type ErrorTree = null | string | ErrorTree[] | { [key: string]: ErrorTree }
function summarizeErrors(tree: ErrorTree): { path: string; message: string }[] {
  // Ваш код здесь
}`,
      solutionCode: `function summarizeErrors(tree) {
  const result = []
  function visit(value, path) {
    if (typeof value === 'string') {
      if (value !== '') result.push({ path, message: value })
    } else if (value !== null) {
      for (const key of Object.keys(value)) visit(value[key], path === '' ? key : path + '.' + key)
    }
  }
  visit(tree, '')
  return result
}`,
      solutionCodeTs: `type ErrorTree = null | string | ErrorTree[] | { [key: string]: ErrorTree }
function summarizeErrors(tree: ErrorTree): { path: string; message: string }[] {
  const result: { path: string; message: string }[] = []
  function visit(value: ErrorTree, path: string): void {
    if (typeof value === 'string') {
      if (value !== '') result.push({ path, message: value })
    } else if (Array.isArray(value)) {
      value.forEach((item, index) => visit(item, path === '' ? String(index) : path + '.' + index))
    } else if (value !== null) {
      for (const key of Object.keys(value)) visit(value[key], path === '' ? key : path + '.' + key)
    }
  }
  visit(tree, '')
  return result
}`,
      solutionNotes: 'Путь передаётся вниз отдельным аргументом. Массив — часть дерева, а не список сообщений, который можно просто склеить.',
      cases: [
        { name: 'вложенные поля', args: [{ email: 'Неверный адрес', users: [null, { name: 'Обязательно' }] }], expected: [{ path: 'email', message: 'Неверный адрес' }, { path: 'users.1.name', message: 'Обязательно' }] },
        { name: 'нет ошибок', args: [{ a: '', b: null }], expected: [] },
        { name: 'корневая ошибка', args: ['Ошибка формы'], expected: [{ path: '', message: 'Ошибка формы' }] },
        { name: 'корневой массив', args: [['A', null, ['B']]], expected: [{ path: '0', message: 'A' }, { path: '2.0', message: 'B' }], hidden: true },
        { name: 'пустые структуры', args: [{ a: [], b: {}, c: { d: 'D' } }], expected: [{ path: 'c.d', message: 'D' }], hidden: true },
        { name: 'null', args: [null], expected: [], hidden: true },
      ],
    },
    {
      slug: 'stable-null-sort',
      title: 'Стабильная сортировка таблицы',
      difficulty: 'easy',
      languages: ['js', 'ts'],
      checkMode: 'unit',
      entryName: 'sortRows',
      tags: ['arrays', 'algorithms'],
      descriptionMd: `Напишите sortRows(rows, direction) для записей { id: string, score: number | null }. direction — 'asc' или 'desc'. Числа сортируются в указанном направлении; null всегда в конце. Равные числа и записи с null сохраняют исходный порядок. Верните новый массив, не сортируя rows на месте.

Пример: [{ id: 'a', score: null }, { id: 'b', score: 2 }, { id: 'c', score: 1 }] в desc даёт порядок b, c, a. Нулевое значение — число, а не отсутствие данных.`,
      starterCode: `function sortRows(rows, direction) {
  // Ваш код здесь
}`,
      starterCodeTs: `type Row = { id: string; score: number | null }
function sortRows(rows: Row[], direction: 'asc' | 'desc'): Row[] {
  // Ваш код здесь
}`,
      solutionCode: `function sortRows(rows, direction) {
  return rows.slice().sort((a, b) => {
    if (a.score === null) return b.score === null ? 0 : 1
    if (b.score === null) return -1
    return (a.score - b.score) * (direction === 'asc' ? 1 : -1)
  })
}`,
      solutionCodeTs: `type Row = { id: string; score: number | null }
function sortRows(rows: Row[], direction: 'asc' | 'desc'): Row[] {
  return rows.slice().sort((a, b) => {
    if (a.score === null) return b.score === null ? 0 : 1
    if (b.score === null) return -1
    return (a.score - b.score) * (direction === 'asc' ? 1 : -1)
  })
}`,
      solutionNotes: 'Обработайте null до применения направления. Умножение всего компаратора на -1 перенесло бы null в начало при desc. Современный Array.sort стабилен.',
      cases: [
        { name: 'возрастание', args: [[{ id: 'a', score: 2 }, { id: 'b', score: 1 }], 'asc'], expected: [{ id: 'b', score: 1 }, { id: 'a', score: 2 }] },
        { name: 'убывание с null', args: [[{ id: 'a', score: null }, { id: 'b', score: 2 }, { id: 'c', score: 1 }], 'desc'], expected: [{ id: 'b', score: 2 }, { id: 'c', score: 1 }, { id: 'a', score: null }] },
        { name: 'пустая таблица', args: [[], 'asc'], expected: [] },
        { name: 'нулевые и отрицательные', args: [[{ id: 'n', score: null }, { id: 'z', score: 0 }, { id: 'm', score: -2 }], 'asc'], expected: [{ id: 'm', score: -2 }, { id: 'z', score: 0 }, { id: 'n', score: null }], hidden: true },
        { name: 'стабильность', args: [[{ id: 'n1', score: null }, { id: 'a', score: 2 }, { id: 'b', score: 2 }, { id: 'n2', score: null }], 'desc'], expected: [{ id: 'a', score: 2 }, { id: 'b', score: 2 }, { id: 'n1', score: null }, { id: 'n2', score: null }], hidden: true },
      ],
      testCode: `test('возвращает новый массив', function () {
  const rows = [{ id: 'b', score: 2 }, { id: 'a', score: 1 }]
  expect(sortRows(rows, 'asc')).not.toBe(rows)
  expect(rows.map(row => row.id)).toEqual(['b', 'a'])
})`,
    },
    {
      slug: 'parse-query-parameters',
      title: 'Параметры фильтра из query string',
      difficulty: 'medium',
      languages: ['js', 'ts'],
      checkMode: 'unit',
      entryName: 'parseQuery',
      tags: ['strings', 'web-api'],
      descriptionMd: `Напишите parseQuery(text), возвращающую объект: каждому ключу соответствует массив всех значений в порядке появления. Необязательный начальный ? удаляется. Пары разделяются &, пустые пары пропускаются, ключ и значение разделяются по первому =. Если = нет, значение — пустая строка.

Декодируйте percent-encoding через decodeURIComponent, а + превращайте в пробел. Если декодирование отдельного ключа или значения бросает ошибку, оставьте эту часть после замены +, как есть. Пустой ключ допустим. Ключи __proto__ и constructor должны быть обычными собственными ключами, без изменения прототипов. URLSearchParams недоступен в песочнице.

parseQuery('?tag=js&tag=ts&q=a+b') → { tag: ['js', 'ts'], q: ['a b'] }.`,
      starterCode: `function parseQuery(text) {
  // Ваш код здесь
}`,
      starterCodeTs: `function parseQuery(text: string): Record<string, string[]> {
  // Ваш код здесь
}`,
      solutionCode: `function parseQuery(text) {
  const result = Object.create(null)
  function decode(part) {
    const normalized = part.replace(/\\+/g, ' ')
    try { return decodeURIComponent(normalized) } catch { return normalized }
  }
  for (const pair of text.replace(/^\\?/, '').split('&')) {
    if (pair === '') continue
    const index = pair.indexOf('=')
    const key = decode(index < 0 ? pair : pair.slice(0, index))
    const value = decode(index < 0 ? '' : pair.slice(index + 1))
    if (!Object.prototype.hasOwnProperty.call(result, key)) result[key] = []
    result[key].push(value)
  }
  return result
}`,
      solutionCodeTs: `function parseQuery(text: string): Record<string, string[]> {
  const result: Record<string, string[]> = Object.create(null)
  function decode(part: string): string {
    const normalized = part.replace(/\\+/g, ' ')
    try { return decodeURIComponent(normalized) } catch { return normalized }
  }
  for (const pair of text.replace(/^\\?/, '').split('&')) {
    if (pair === '') continue
    const index = pair.indexOf('=')
    const key = decode(index < 0 ? pair : pair.slice(0, index))
    const value = decode(index < 0 ? '' : pair.slice(index + 1))
    if (!Object.prototype.hasOwnProperty.call(result, key)) result[key] = []
    result[key].push(value)
  }
  return result
}`,
      solutionNotes: 'split по всем знакам = потеряет часть значения. Объект без прототипа позволяет безопасно хранить произвольные ключи. Декодирование обеих частей выполняется независимо.',
      cases: [
        { name: 'повторяющийся фильтр', args: ['?tag=js&tag=ts&q=a+b'], expected: { tag: ['js', 'ts'], q: ['a b'] } },
        { name: 'без значения', args: ['flag&empty='], expected: { flag: [''], empty: [''] } },
        { name: 'пустые пары', args: ['?&&'], expected: {} },
        { name: 'знак равно внутри значения', args: ['token=a=b%3Dc'], expected: { token: ['a=b=c'] }, hidden: true },
        { name: 'юникод и кодированный плюс', args: ['%D0%B8%D0%BC%D1%8F=%D0%90%D0%BD%D0%BD%D0%B0&x=%2B'], expected: { имя: ['Анна'], x: ['+'] }, hidden: true },
        { name: 'сломанный percent', args: ['x=%ZZ+y&%E0%A4=ok'], expected: { x: ['%ZZ y'], '%E0%A4': ['ok'] }, hidden: true },
        { name: 'ключи прототипа', args: ['__proto__=a&constructor=b&=zero'], expected: raw(`JSON.parse('{"__proto__":["a"],"constructor":["b"],"":["zero"]}')`), hidden: true },
      ],
    },
    {
      slug: 'dependency-build-order',
      title: 'Порядок сборки зависимых модулей',
      difficulty: 'medium',
      languages: ['js', 'ts'],
      checkMode: 'unit',
      entryName: 'buildOrder',
      tags: ['algorithms', 'data-structures'],
      descriptionMd: `Напишите buildOrder(modules), где modules — объект: имя модуля → массив его зависимостей. Верните порядок сборки, в котором все зависимости уже собраны до модуля. Имя, встречающееся только в зависимостях, тоже должно попасть в результат.

Если доступны несколько модулей, каждый раз выбирайте лексикографически наименьшее имя (обычный Array.sort()). Повтор зависимости не создаёт дополнительного ребра. Если есть цикл, верните null для всей сборки. Пустой граф даёт []. Вход не меняйте.

buildOrder({ app: ['ui', 'api'], ui: ['core'], api: ['core'] }) → ['core', 'api', 'ui', 'app'].`,
      starterCode: `function buildOrder(modules) {
  // Ваш код здесь
}`,
      starterCodeTs: `function buildOrder(modules: Record<string, string[]>): string[] | null {
  // Ваш код здесь
}`,
      solutionCode: `function buildOrder(modules) {
  const dependencies = new Map()
  for (const [name, deps] of Object.entries(modules)) {
    dependencies.set(name, new Set(deps))
    for (const dep of deps) if (!dependencies.has(dep)) dependencies.set(dep, new Set())
  }
  const result = []
  while (dependencies.size > 0) {
    const ready = [...dependencies.keys()].filter(name => dependencies.get(name).size === 0).sort()
    if (ready.length === 0) return null
    const name = ready[0]
    result.push(name)
    dependencies.delete(name)
    for (const deps of dependencies.values()) deps.delete(name)
  }
  return result
}`,
      solutionCodeTs: `function buildOrder(modules: Record<string, string[]>): string[] | null {
  const dependencies = new Map<string, Set<string>>()
  for (const [name, deps] of Object.entries(modules)) {
    dependencies.set(name, new Set(deps))
    for (const dep of deps) if (!dependencies.has(dep)) dependencies.set(dep, new Set())
  }
  const result: string[] = []
  while (dependencies.size > 0) {
    const ready = [...dependencies.keys()].filter(name => dependencies.get(name)?.size === 0).sort()
    if (ready.length === 0) return null
    const name = ready[0]
    result.push(name)
    dependencies.delete(name)
    for (const deps of dependencies.values()) deps.delete(name)
  }
  return result
}`,
      solutionNotes: 'Это топологическая сортировка. Если не осталось вершин без зависимостей, оставшаяся часть содержит цикл. Set устраняет дубли ребра; множество готовых модулей пересчитывается после каждого выбора.',
      cases: [
        { name: 'общая зависимость', args: [{ app: ['ui', 'api'], ui: ['core'], api: ['core'] }], expected: ['core', 'api', 'ui', 'app'] },
        { name: 'независимые модули', args: [{ z: [], a: [] }], expected: ['a', 'z'] },
        { name: 'пустой граф', args: [{}], expected: [] },
        { name: 'цикл', args: [{ a: ['b'], b: ['a'], free: [] }], expected: null, hidden: true },
        { name: 'самозависимость', args: [{ a: ['a'] }], expected: null, hidden: true },
        { name: 'повторяющееся ребро', args: [{ b: ['a', 'a'] }], expected: ['a', 'b'], hidden: true },
        { name: 'новая готовая вершина раньше старой', args: [{ z: [], b: ['a'] }], expected: ['a', 'b', 'z'], hidden: true },
      ],
    },
    {
      slug: 'collect-api-pages',
      title: 'Сбор всех страниц асинхронного API',
      difficulty: 'medium',
      languages: ['js'],
      checkMode: 'unit',
      entryName: 'collectPages',
      tags: ['async', 'promise', 'web-api'],
      descriptionMd: `Напишите async collectPages(loadPage). loadPage(cursor) возвращает Promise<{ items: unknown[], nextCursor: string | null }>. Первый запрос получает null, затем передаётся nextCursor предыдущего ответа. Соберите items всех страниц в один массив, не изменяя ответы API.

nextCursor === null означает конец, а пустая строка — действительный курсор. Пустая страница не означает конец. Запросы выполняются последовательно. Если курсор для следующего запроса уже использовался, бросьте Error('Cursor cycle') до повторного запроса. Ошибку loadPage пробросьте исходным объектом. Настоящая сеть не нужна: зависимость передана аргументом.`,
      starterCode: `async function collectPages(loadPage) {
  // Ваш код здесь
}`,
      solutionCode: `async function collectPages(loadPage) {
  const used = new Set()
  const result = []
  let cursor = null
  while (true) {
    if (used.has(cursor)) throw new Error('Cursor cycle')
    used.add(cursor)
    const page = await loadPage(cursor)
    result.push(...page.items)
    if (page.nextCursor === null) return result
    cursor = page.nextCursor
  }
}`,
      solutionNotes: 'Условие окончания проверяет именно null. Set использованных курсоров защищает от бесконечного обхода, включая цикл длинее одной страницы.',
      hints: ['Пустой массив items ничего не говорит о следующей странице.', 'Запоминайте курсор перед запросом, а не только предыдущий курсор.'],
      cases: [
        { name: 'одна пустая страница', args: [raw(`async () => ({ items: [], nextCursor: null })`)], expected: [], hidden: true },
        { name: 'пустая строка как курсор', args: [raw(`async cursor => cursor === null ? { items: ['first'], nextCursor: '' } : { items: ['last'], nextCursor: null }`)], expected: ['first', 'last'], hidden: true },
        { name: 'сохранение сложных значений', args: [raw(`async cursor => cursor === null ? { items: [{ id: 1 }, null], nextCursor: 'more' } : { items: [false, 0], nextCursor: null }`)], expected: [{ id: 1 }, null, false, 0], hidden: true },
      ],
      testCode: `test('собирает все страницы и передаёт курсор', async function () {
  const seen = []
  const result = await collectPages(async function (cursor) {
    seen.push(cursor)
    return cursor === null ? { items: [1, 2], nextCursor: 'p2' } : { items: [3], nextCursor: null }
  })
  expect(result).toEqual([1, 2, 3])
  expect(seen).toEqual([null, 'p2'])
})
test('пустые страницы и пустой курсор не завершают обход', async function () {
  const seen = []
  expect(await collectPages(async cursor => {
    seen.push(cursor)
    if (cursor === null) return { items: [], nextCursor: '' }
    if (cursor === '') return { items: [], nextCursor: 'end' }
    return { items: [0, false, null], nextCursor: null }
  })).toEqual([0, false, null])
  expect(seen).toEqual([null, '', 'end'])
})
test('останавливает цикл до повторного запроса', async function () {
  const seen = []
  await expect(collectPages(async cursor => {
    seen.push(cursor)
    return { items: [], nextCursor: cursor === 'a' ? 'b' : 'a' }
  })).rejects.toThrow('Cursor cycle')
  expect(seen).toEqual([null, 'a', 'b'])
})
test('не заменяет ошибку API', async function () {
  const error = new Error('Network failed')
  let captured
  try { await collectPages(async () => { throw error }) } catch (value) { captured = value }
  expect(captured).toBe(error)
})
test('не изменяет массивы ответа', async function () {
  const items = Object.freeze([1, 2])
  expect(await collectPages(async () => ({ items, nextCursor: null }))).toEqual([1, 2])
})
test('нет параллельных запросов', async function () {
  let active = 0
  let maximum = 0
  const promise = collectPages(async cursor => {
    active += 1
    maximum = Math.max(maximum, active)
    await new Promise(resolve => setTimeout(resolve, 10))
    active -= 1
    return { items: [cursor], nextCursor: cursor === null ? 'next' : null }
  })
  await __clock.runAll()
  expect(await promise).toEqual([null, 'next'])
  expect(maximum).toBe(1)
})`,
    },
    {
      slug: 'latest-request-wins',
      title: 'Защита поиска от устаревшего ответа',
      difficulty: 'medium',
      languages: ['js'],
      checkMode: 'unit',
      entryName: 'runLatestScenario',
      tags: ['async', 'closures', 'web-api'],
      descriptionMd: `В поиске ответ старого запроса может прийти после нового и затереть результаты. Реализуйте createLatest(load, commit), возвращающую функцию run(query).

Каждый run вызывает load(query). Успех приводит к commit(value), только если этот запуск остаётся последним начатым. Устаревший успех всё равно разрешает свой Promise значением, но не меняет интерфейс. Ошибка пробрасывается исходным объектом и не вызывает commit. Ошибка последнего запроса не делает более старый запрос снова актуальным. Синхронное исключение load тоже должно стать отклонённым Promise. Отменять реальные запросы не требуется.`,
      starterCode: `function createLatest(load, commit) {
  // Ваш код здесь
}`,
      solutionCode: `function createLatest(load, commit) {
  let sequence = 0
  return async function run(query) {
    const own = ++sequence
    const value = await load(query)
    if (own === sequence) commit(value)
    return value
  }
}`,
      solutionNotes: 'Порядковый номер фиксирует порядок начала, а не завершения. Номер не уменьшается после ошибки: устаревший успех остаётся устаревшим.',
      setupCode: `async function runLatestScenario(order) {
  const pending = []
  const seen = []
  const run = createLatest(() => new Promise(resolve => pending.push(resolve)), value => seen.push(value))
  const requests = order.map((_value, index) => run(String(index)))
  for (const index of order) {
    pending[index](index)
    await requests[index]
  }
  return seen
}`,
      cases: [
        { name: 'три ответа в обратном порядке', args: [[2, 1, 0]], expected: [2], hidden: true },
        { name: 'последний запрос завершился последним', args: [[0, 1, 2]], expected: [2], hidden: true },
        { name: 'четыре ответа с перемешанным порядком', args: [[1, 3, 0, 2]], expected: [3], hidden: true },
      ],
      testCode: `test('последовательный успех обновляет результат', async function () {
  const seen = []
  const run = createLatest(async query => query.toUpperCase(), value => seen.push(value))
  expect(await run('a')).toBe('A')
  expect(await run('b')).toBe('B')
  expect(seen).toEqual(['A', 'B'])
})
test('старый ответ не затирает новый', async function () {
  const pending = {}
  const seen = []
  const run = createLatest(query => new Promise(resolve => { pending[query] = resolve }), value => seen.push(value))
  const old = run('old')
  const fresh = run('new')
  pending.new('NEW')
  expect(await fresh).toBe('NEW')
  pending.old('OLD')
  expect(await old).toBe('OLD')
  expect(seen).toEqual(['NEW'])
})
test('ошибка последнего не оживляет старый ответ', async function () {
  const pending = {}
  const seen = []
  const error = new Error('Failed')
  const run = createLatest(query => new Promise((resolve, reject) => { pending[query] = { resolve, reject } }), value => seen.push(value))
  const old = run('old')
  const fresh = run('new')
  const observed = fresh.catch(value => value)
  pending.new.reject(error)
  expect(await observed).toBe(error)
  pending.old.resolve('OLD')
  expect(await old).toBe('OLD')
  expect(seen).toEqual([])
})
test('одинаковые query являются разными запусками', async function () {
  const pending = []
  const seen = []
  const run = createLatest(() => new Promise(resolve => pending.push(resolve)), value => seen.push(value))
  const first = run('same')
  const second = run('same')
  pending[0](1)
  await first
  expect(seen).toEqual([])
  pending[1](2)
  await second
  expect(seen).toEqual([2])
})
test('синхронная ошибка возвращается через Promise', async function () {
  const error = new Error('Sync failure')
  const run = createLatest(() => { throw error }, () => { throw new Error('commit must not run') })
  const result = run('query')
  expect(typeof result.then).toBe('function')
  expect(await result.catch(value => value)).toBe(error)
})
test('независимые экземпляры не конфликтуют', async function () {
  const seen = []
  const a = createLatest(async () => 0, value => seen.push(value))
  const b = createLatest(async () => false, value => seen.push(value))
  await Promise.all([a('a'), b('b')])
  expect(seen).toEqual([0, false])
})`,
    },
    typeTask({
      slug: 'ts-event-payload-map',
      title: 'Типизированные аргументы событий',
      difficulty: 'medium',
      tags: ['generics', 'type-level'],
      descriptionMd: `Реализуйте EventArgs<Events, K extends keyof Events>. Events сопоставляет имя события типу полезной нагрузки.

Если тип нагрузки ровно void или undefined, EventArgs должен быть пустым кортежем []; иначе — кортежем из одного аргумента [payload: Events[K]]. Объединение string | undefined всё ещё требует один аргумент. Нагрузка never тоже остаётся одним аргументом типа never. Несуществующее имя события должно запрещаться ограничением K.

EventArgs<{ ready: void; message: { text: string } }, 'ready'> → []; для 'message' → [{ text: string }]. Эти типы можно использовать как rest-параметры emit.`,
      starterCodeTs: `type EventArgs<Events, K extends keyof Events> = never`,
      solutionCodeTs: `type EventArgs<Events, K extends keyof Events> = [Events[K]] extends [never]
  ? [payload: Events[K]]
  : [Events[K]] extends [void]
    ? []
    : [payload: Events[K]]`,
      solutionNotes: 'Квадратные скобки убирают распределение conditional type по union. never проверяется отдельно, поскольку он подтип любого типа.',
      typeHarness: `type EventsFixture = { ready: void; missing: undefined; message: { text: string }; maybe: string | undefined; impossible: never; count: number }
type case1 = Expect<Equal<EventArgs<EventsFixture, 'ready'>, []>>
type case2 = Expect<Equal<EventArgs<EventsFixture, 'missing'>, []>>
type case3 = Expect<Equal<EventArgs<EventsFixture, 'message'>, [{ text: string }]>>
type case4 = Expect<Equal<EventArgs<EventsFixture, 'maybe'>, [string | undefined]>>
type case5 = Expect<Equal<EventArgs<EventsFixture, 'impossible'>, [never]>>
type case6 = Expect<Equal<EventArgs<EventsFixture, 'count'>, [number]>>
// @ts-expect-error — неизвестное событие
type case7 = EventArgs<EventsFixture, 'unknown'>
declare function emit<K extends keyof EventsFixture>(event: K, ...args: EventArgs<EventsFixture, K>): void
emit('ready')
emit('message', { text: 'hi' })
// @ts-expect-error — нагрузка обязательна
emit('message')
// @ts-expect-error — ready не принимает нагрузку
emit('ready', 1)`,
    }),
    typeTask({
      slug: 'ts-deep-patch',
      title: 'Тип частичного обновления настроек',
      difficulty: 'medium',
      tags: ['generics', 'type-level', 'recursion'],
      descriptionMd: `Реализуйте DeepPatch<T> для частичного обновления настроек. Свойства объектов становятся необязательными рекурсивно. Массивы и кортежи (в том числе readonly) заменяются целиком: их тип не изменяется. Функции и Date также сохраняются как есть. Примитивы, null и undefined не меняются. Модификатор readonly свойства объекта сохраняется.

Пример: DeepPatch<{ ui: { theme: string }; tags: string[] }> допускает { ui: {} }, но tags, если передан, должен быть целым string[]. Это тип PATCH-запроса с атомарной заменой массивов, а не частичное обновление по индексам.`,
      starterCodeTs: `type DeepPatch<T> = never`,
      solutionCodeTs: `type DeepPatch<T> = T extends Date | readonly unknown[] | ((...args: never[]) => unknown)
  ? T
  : T extends object
    ? { [K in keyof T]?: DeepPatch<T[K]> }
    : T`,
      solutionNotes: 'Особые типы проверяются до object. Mapped type сохраняет readonly исходного поля; добавленный ? делает поле необязательным. Conditional type распределяется по объединению.',
      typeHarness: `type ConfigFixture = { readonly ui: { theme: string; nested: { size: number } }; tags: string[]; tuple: readonly [string, number]; onSave: (id: string) => boolean; created: Date }
type ExpectedFixture = { readonly ui?: { theme?: string; nested?: { size?: number } }; tags?: string[]; tuple?: readonly [string, number]; onSave?: (id: string) => boolean; created?: Date }
type case1 = Expect<Equal<DeepPatch<ConfigFixture>, ExpectedFixture>>
type case2 = Expect<Equal<DeepPatch<string | null | undefined>, string | null | undefined>>
type case3 = Expect<Equal<DeepPatch<readonly number[]>, readonly number[]>>
type case4 = Expect<Equal<DeepPatch<{ a: number } | { b: string }>, { a?: number } | { b?: string }>>
const validPatch: DeepPatch<ConfigFixture> = { ui: { nested: {} }, tags: ['a'] }
// @ts-expect-error — массив не становится объектом необязательных индексов
const invalidArray: DeepPatch<ConfigFixture> = { tags: { 0: 'a' } }
// @ts-expect-error — функция сохраняет сигнатуру
const invalidCallback: DeepPatch<ConfigFixture> = { onSave: (id: number) => true }
// @ts-expect-error — readonly свойства сохраняется
validPatch.ui = { theme: 'dark' }`,
    }),
  ],
}
