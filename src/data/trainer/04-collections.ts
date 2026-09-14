import type { TrainerTopicSeed } from './types'

/**
 * Тема 4. Массивы и объекты.
 *
 * Глубокое клонирование с циклическими ссылками, структурное сравнение и
 * безопасный доступ по пути — то, что просят написать руками чаще всего,
 * потому что в этих задачах видно, понимает ли человек ссылочную природу
 * объектов.
 */
export const collections: TrainerTopicSeed = {
  slug: 'collections',
  title: 'Массивы и объекты',
  description: 'deepClone, deepEqual, flatten, groupBy и доступ по пути',
  category: 'javascript',
  icon: '🗂️',
  order: 4,
  tasks: [
    {
      slug: 'deep-clone',
      title: 'Глубокое клонирование',
      difficulty: 'hard',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'deepClone',
      tags: ['objects'],
      companies: ['yandex', 'ozon', 'avito', 'sber', 'faang'],
      descriptionMd: `Реализуйте \`deepClone(value)\` — глубокую копию значения.

Поддержите:

- вложенные объекты и массивы;
- \`Date\`, \`RegExp\`, \`Map\`, \`Set\`;
- **циклические ссылки** — клон должен повторять структуру, а не уходить в
  бесконечную рекурсию;
- примитивы и функции возвращаются как есть (функции не копируются).

\`\`\`js
const source = { a: 1, nested: { b: 2 } }
source.self = source

const copy = deepClone(source)
copy.nested === source.nested // false
copy.self === copy            // true
\`\`\`

\`structuredClone\` использовать нельзя.`,
      starterCode: `function deepClone(value) {
  // Ваш код здесь
}
`,
      solutionCode: `function deepClone(value, seen = new WeakMap()) {
  if (value === null || typeof value !== 'object') return value

  if (seen.has(value)) return seen.get(value)

  if (value instanceof Date) return new Date(value.getTime())
  if (value instanceof RegExp) return new RegExp(value.source, value.flags)

  if (value instanceof Map) {
    const copy = new Map()
    seen.set(value, copy)
    value.forEach((item, key) => copy.set(deepClone(key, seen), deepClone(item, seen)))
    return copy
  }

  if (value instanceof Set) {
    const copy = new Set()
    seen.set(value, copy)
    value.forEach((item) => copy.add(deepClone(item, seen)))
    return copy
  }

  if (Array.isArray(value)) {
    const copy = []
    seen.set(value, copy)
    value.forEach((item, index) => {
      copy[index] = deepClone(item, seen)
    })
    return copy
  }

  const copy = Object.create(Object.getPrototypeOf(value))
  seen.set(value, copy)
  for (const key of Object.keys(value)) {
    copy[key] = deepClone(value[key], seen)
  }
  return copy
}
`,
      solutionNotes: `Циклические ссылки решает \`WeakMap\` «оригинал → копия». Копия кладётся туда
**до** обхода вложенных значений — иначе рекурсия успела бы вернуться к тому же
объекту и зациклиться.

\`WeakMap\`, а не \`Map\`: ключи не удерживаются от сборки мусора, и после
клонирования большое дерево не остаётся в памяти.

Порядок проверок важен: \`Date\`, \`RegExp\`, \`Map\`, \`Set\` — тоже объекты, и без
отдельных веток они превратились бы в пустые \`{}\`.

\`Object.create(Object.getPrototypeOf(value))\` сохраняет прототип, поэтому
экземпляр класса остаётся экземпляром того же класса.

Самая частая ошибка — \`JSON.parse(JSON.stringify(value))\`: теряются \`undefined\`,
функции, \`Date\` превращается в строку, а на цикле код просто падает.`,
      hints: [
        'Заведите WeakMap «оригинал → копия» и передавайте её в рекурсию.',
        'Копию кладите в WeakMap ДО обхода вложенных значений — иначе цикл не разорвать.',
        'Date, RegExp, Map и Set нужно обработать до общей ветки объектов.',
      ],
      testCode: `test('вложенные объекты копируются', function () {
  const source = { a: 1, nested: { b: 2, deep: { c: 3 } } }
  const copy = deepClone(source)

  expect(copy).toEqual(source)
  expect(copy.nested).not.toBe(source.nested)
  expect(copy.nested.deep).not.toBe(source.nested.deep)
})

test('массивы копируются', function () {
  const source = [1, [2, [3]]]
  const copy = deepClone(source)

  expect(copy).toEqual(source)
  expect(copy[1]).not.toBe(source[1])
})

test('циклическая ссылка не ломает клонирование', function () {
  const source = { name: 'корень' }
  source.self = source

  const copy = deepClone(source)

  expect(copy.name).toBe('корень')
  expect(copy.self).toBe(copy)
  expect(copy.self).not.toBe(source)
})

test('Date и RegExp', function () {
  const source = { date: new Date(1700000000000), re: /abc/gi }
  const copy = deepClone(source)

  expect(copy.date).toBeInstanceOf(Date)
  expect(copy.date.getTime()).toBe(1700000000000)
  expect(copy.date).not.toBe(source.date)
  expect(String(copy.re)).toBe('/abc/gi')
})

test('Map и Set', function () {
  const source = { map: new Map([['k', { v: 1 }]]), set: new Set([1, 2]) }
  const copy = deepClone(source)

  expect(copy.map).toBeInstanceOf(Map)
  expect(copy.map.get('k')).toEqual({ v: 1 })
  expect(copy.map.get('k')).not.toBe(source.map.get('k'))
  expect(copy.set).toBeInstanceOf(Set)
  expect(copy.set.has(2)).toBe(true)
})

test('примитивы возвращаются как есть', function () {
  expect(deepClone(42)).toBe(42)
  expect(deepClone('строка')).toBe('строка')
  expect(deepClone(null)).toBe(null)
  expect(deepClone(undefined)).toBeUndefined()
})

test('прототип сохраняется', function () {
  class Point {
    constructor(x) { this.x = x }
  }
  const copy = deepClone(new Point(1))

  expect(copy).toBeInstanceOf(Point)
  expect(copy.x).toBe(1)
})`,
    },

    {
      slug: 'flatten-array',
      title: 'Развернуть вложенный массив',
      difficulty: 'easy',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'flatten',
      tags: ['arrays', 'recursion'],
      companies: ['yandex', 'ozon', 'faang'],
      descriptionMd: `Реализуйте \`flatten(array, depth)\` — разворачивание вложенных массивов на
указанную глубину.

- \`depth\` по умолчанию \`1\`;
- \`Infinity\` разворачивает все уровни;
- \`depth <= 0\` возвращает поверхностную копию.

\`\`\`js
flatten([1, [2, [3, [4]]], 5])           // [1, 2, [3, [4]], 5]
flatten([1, [2, [3, [4]]], 5], 2)        // [1, 2, 3, [4], 5]
flatten([1, [2, [3, [4]]], 5], Infinity) // [1, 2, 3, 4, 5]
\`\`\`

Метод \`Array.prototype.flat\` использовать нельзя.`,
      starterCode: `function flatten(array, depth = 1) {
  // Ваш код здесь
}
`,
      solutionCode: `function flatten(array, depth = 1) {
  if (depth <= 0) return array.slice()

  return array.reduce((acc, item) => {
    if (Array.isArray(item)) acc.push(...flatten(item, depth - 1))
    else acc.push(item)
    return acc
  }, [])
}
`,
      solutionNotes: `Рекурсия с уменьшением глубины — прямое выражение условия задачи: на каждом
уровне вложенности тратится единица \`depth\`.

\`Infinity - 1\` остаётся \`Infinity\`, поэтому бесконечная глубина работает без
особой ветки.

Условие \`depth <= 0\` возвращает **копию**, а не сам массив: иначе вызывающий код
мог бы случайно испортить исходные данные.

Осторожно с \`push(...items)\`: на очень больших массивах spread упирается в лимит
аргументов функции. Для промышленного кода надёжнее цикл или \`concat\`.`,
      hints: [
        'Каждый уровень рекурсии уменьшает depth на единицу.',
        'Infinity - 1 всё ещё Infinity — особая ветка не нужна.',
        'При depth <= 0 возвращайте копию, а не исходный массив.',
      ],
      cases: [
        { name: 'глубина по умолчанию', args: [[1, [2, [3, [4]]], 5]], expected: [1, 2, [3, [4]], 5] },
        { name: 'глубина 2', args: [[1, [2, [3, [4]]], 5], 2], expected: [1, 2, 3, [4], 5] },
        { name: 'бесконечная глубина', args: [[1, [2, [3, [4]]], 5], Infinity], expected: [1, 2, 3, 4, 5] },
        { name: 'плоский массив', args: [[1, 2, 3]], expected: [1, 2, 3] },
        { name: 'пустой массив', args: [[]], expected: [] },
        { name: 'глубина 0 — копия', args: [[1, [2]], 0], expected: [1, [2]], hidden: true },
        { name: 'пустые вложенные массивы', args: [[1, [], [[]], 2], Infinity], expected: [1, 2], hidden: true },
      ],
      testCode: `test('возвращается новый массив', function () {
  const source = [1, [2]]
  expect(flatten(source, 0)).not.toBe(source)
})`,
    },

    {
      slug: 'group-by',
      title: 'Группировка по ключу',
      difficulty: 'easy',
      checkMode: 'unit',
      languages: ['js', 'ts'],
      entryName: 'groupBy',
      tags: ['arrays', 'objects'],
      companies: ['yandex', 'avito', 'tbank'],
      descriptionMd: `Реализуйте \`groupBy(items, key)\` — группировку элементов массива.

\`key\` может быть строкой (имя свойства) или функцией, вычисляющей ключ.

\`\`\`js
const users = [
  { name: 'Аня', city: 'Москва' },
  { name: 'Борис', city: 'Казань' },
  { name: 'Вера', city: 'Москва' },
]

groupBy(users, 'city')
// { Москва: [{...Аня}, {...Вера}], Казань: [{...Борис}] }

groupBy([1.2, 1.8, 2.3], Math.floor)
// { 1: [1.2, 1.8], 2: [2.3] }
\`\`\`

Сложность — линейная, за один проход.`,
      starterCode: `function groupBy(items, key) {
  // Ваш код здесь
}
`,
      starterCodeTs: `function groupBy<T>(
  items: T[],
  key: string | ((item: T) => string | number),
): Record<string, T[]> {
  // Ваш код здесь
}
`,
      solutionCode: `function groupBy(items, key) {
  const getKey = typeof key === 'function' ? key : (item) => item[key]

  return items.reduce((groups, item) => {
    const groupKey = String(getKey(item))
    if (!groups[groupKey]) groups[groupKey] = []
    groups[groupKey].push(item)
    return groups
  }, Object.create(null))
}
`,
      solutionCodeTs: `function groupBy<T>(
  items: T[],
  key: string | ((item: T) => string | number),
): Record<string, T[]> {
  const getKey =
    typeof key === 'function' ? key : (item: T): string | number =>
      (item as Record<string, unknown>)[key] as string | number

  return items.reduce<Record<string, T[]>>((groups, item) => {
    const groupKey = String(getKey(item))
    if (!groups[groupKey]) groups[groupKey] = []
    groups[groupKey].push(item)
    return groups
  }, Object.create(null) as Record<string, T[]>)
}
`,
      solutionNotes: `Нормализация \`key\` в функцию в самом начале избавляет от проверки типа внутри
цикла — код читается ровнее и работает чуть быстрее.

\`Object.create(null)\` вместо \`{}\` — защита от коллизий с наследуемыми свойствами.
С обычным литералом группа с ключом \`constructor\` или \`toString\` попала бы в
проверку \`if (!groups[groupKey])\` как «уже существует», и элементы потерялись бы.

Ключи объекта всегда строки, поэтому \`String(...)\` применяется явно — так
результат предсказуем и для числовых ключей.`,
      hints: [
        'Приведите key к функции один раз, до цикла.',
        'Object.create(null) спасает от ключей вроде constructor и toString.',
        'Один проход reduce — линейная сложность, вложенные циклы не нужны.',
      ],
      cases: [
        {
          name: 'группировка по свойству',
          args: [
            [
              { name: 'Аня', city: 'Москва' },
              { name: 'Борис', city: 'Казань' },
              { name: 'Вера', city: 'Москва' },
            ],
            'city',
          ],
          expected: {
            'Москва': [
              { name: 'Аня', city: 'Москва' },
              { name: 'Вера', city: 'Москва' },
            ],
            'Казань': [{ name: 'Борис', city: 'Казань' }],
          },
        },
        { name: 'пустой массив', args: [[], 'city'], expected: {} },
        {
          name: 'числовые ключи',
          args: [[{ n: 1 }, { n: 2 }, { n: 1 }], 'n'],
          expected: { '1': [{ n: 1 }, { n: 1 }], '2': [{ n: 2 }] },
          hidden: true,
        },
      ],
      testCode: `test('ключ-функция', function () {
  expect(groupBy([1.2, 1.8, 2.3], Math.floor)).toEqual({ 1: [1.2, 1.8], 2: [2.3] })
})

test('ключ constructor не ломает группировку', function () {
  const result = groupBy([{ type: 'constructor' }, { type: 'constructor' }], 'type')
  expect(result.constructor).toHaveLength(2)
})`,
    },

    {
      slug: 'deep-equal',
      title: 'Глубокое сравнение',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'deepEqual',
      tags: ['objects'],
      companies: ['yandex', 'ozon', 'faang'],
      descriptionMd: `Реализуйте \`deepEqual(a, b)\` — структурное сравнение двух значений.

- примитивы сравниваются строго, но \`NaN\` равен \`NaN\`;
- объекты и массивы сравниваются по содержимому;
- объекты с разным набором ключей не равны;
- массив и объект с теми же индексами не равны;
- \`null\` не равен \`{}\`;
- \`Date\` сравниваются по времени.

\`\`\`js
deepEqual({ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] }) // true
deepEqual({ a: 1 }, { a: 1, b: undefined })           // false
deepEqual(NaN, NaN)                                   // true
\`\`\``,
      starterCode: `function deepEqual(a, b) {
  // Ваш код здесь
}
`,
      solutionCode: `function deepEqual(a, b) {
  if (Object.is(a, b)) return true

  if (a === null || b === null) return false
  if (typeof a !== 'object' || typeof b !== 'object') return false

  if (Array.isArray(a) !== Array.isArray(b)) return false

  if (a instanceof Date || b instanceof Date) {
    return a instanceof Date && b instanceof Date && a.getTime() === b.getTime()
  }

  const keysA = Object.keys(a)
  const keysB = Object.keys(b)
  if (keysA.length !== keysB.length) return false

  return keysA.every(
    (key) => Object.prototype.hasOwnProperty.call(b, key) && deepEqual(a[key], b[key]),
  )
}
`,
      solutionNotes: `\`Object.is\` вместо \`===\` даёт бесплатное \`NaN === NaN\` и корректно различает
\`+0\` и \`-0\`.

Проверка \`Array.isArray(a) !== Array.isArray(b)\` нужна потому, что массив — это
объект с числовыми ключами: без неё \`[1, 2]\` совпал бы с \`{ 0: 1, 1: 2 }\`.

Сравнения длин ключей мало: у объектов может быть одинаковое количество, но
разные имена. Отсюда \`hasOwnProperty\` внутри \`every\` — иначе значение
подтянулось бы из прототипа.

Именно поэтому \`{ a: 1 }\` и \`{ a: 1, b: undefined }\` не равны: количество
собственных ключей разное, хотя \`b.b\` и в том, и в другом даёт \`undefined\`.`,
      hints: [
        'Object.is решает и NaN, и -0 одной проверкой.',
        'Массив от объекта отличайте явно: иначе [1,2] совпадёт с {0:1,1:2}.',
        'Сравните количество собственных ключей, а наличие каждого — через hasOwnProperty.',
      ],
      cases: [
        { name: 'вложенные структуры', args: [{ a: [1, { b: 2 }] }, { a: [1, { b: 2 }] }], expected: true },
        { name: 'разные значения', args: [{ a: 1 }, { a: 2 }], expected: false },
        { name: 'лишний ключ', args: [{ a: 1 }, { a: 1, b: undefined }], expected: false },
        { name: 'NaN равен NaN', args: [NaN, NaN], expected: true },
        { name: 'null и объект', args: [null, {}], expected: false },
        { name: 'массив и объект', args: [[1, 2], { 0: 1, 1: 2 }], expected: false, hidden: true },
        { name: 'даты по времени', args: [new Date(1000), new Date(1000)], expected: true, hidden: true },
        { name: 'разные даты', args: [new Date(1000), new Date(2000)], expected: false, hidden: true },
        { name: 'пустые объекты', args: [{}, {}], expected: true },
        { name: 'примитивы', args: [1, '1'], expected: false },
      ],
    },

    {
      slug: 'flatten-object',
      title: 'Плоский объект с точечными ключами',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'flattenObject',
      tags: ['objects', 'recursion'],
      companies: ['ozon', 'tbank'],
      descriptionMd: `Реализуйте \`flattenObject(object)\` — превращение вложенного объекта в плоский с
составными ключами через точку.

\`\`\`js
flattenObject({ a: { b: { c: 1 } }, d: 2 })
// { 'a.b.c': 1, d: 2 }

flattenObject({ list: [1, 2] })
// { 'list.0': 1, 'list.1': 2 }
\`\`\`

- вложенные массивы раскрываются по индексам;
- пустой объект или пустой массив как значение сохраняется целиком
  (\`{ a: {} }\` → \`{ a: {} }\`);
- \`null\` — это значение, а не объект для обхода.`,
      starterCode: `function flattenObject(object) {
  // Ваш код здесь
}
`,
      solutionCode: `function flattenObject(object) {
  const result = {}

  function walk(value, prefix) {
    const isPlain = value !== null && typeof value === 'object'
    const entries = isPlain ? Object.entries(value) : []

    if (!isPlain || entries.length === 0) {
      result[prefix] = value
      return
    }

    for (const [key, item] of entries) {
      walk(item, prefix ? prefix + '.' + key : key)
    }
  }

  for (const [key, value] of Object.entries(object)) {
    walk(value, key)
  }

  return result
}
`,
      solutionNotes: `Рекурсия с накоплением префикса — стандартный приём для обхода дерева, где
результат зависит от пути до узла.

\`Object.entries\` одинаково работает и с объектами, и с массивами (для массива
даёт строковые индексы), поэтому отдельная ветка под массивы не нужна.

Пустой объект и пустой массив обрабатываются как **листья**: спускаться в них
некуда, а потерять их нельзя. Это тот случай, который чаще всего забывают.

\`null\` проверяется первым: \`typeof null === 'object'\`, и без этой проверки код
попробовал бы обойти его как объект.`,
      hints: [
        'Рекурсивно обходите значения, накапливая префикс ключа.',
        'Object.entries работает и с массивами — отдельная ветка не нужна.',
        'Пустой объект и пустой массив — это листья: их надо записать как значение.',
      ],
      cases: [
        { name: 'глубокая вложенность', args: [{ a: { b: { c: 1 } }, d: 2 }], expected: { 'a.b.c': 1, d: 2 } },
        { name: 'массив по индексам', args: [{ list: [1, 2] }], expected: { 'list.0': 1, 'list.1': 2 } },
        { name: 'плоский объект', args: [{ a: 1, b: 2 }], expected: { a: 1, b: 2 } },
        { name: 'пустой объект', args: [{}], expected: {} },
        { name: 'пустой объект как значение', args: [{ a: {} }], expected: { a: {} }, hidden: true },
        { name: 'null как значение', args: [{ a: null }], expected: { a: null }, hidden: true },
        {
          name: 'смешанная структура',
          args: [{ user: { name: 'Аня', tags: ['a', 'b'] } }],
          expected: { 'user.name': 'Аня', 'user.tags.0': 'a', 'user.tags.1': 'b' },
          hidden: true,
        },
      ],
    },

    {
      slug: 'get-by-path',
      title: 'Безопасный доступ по пути',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'get',
      tags: ['objects'],
      companies: ['yandex', 'avito', 'wildberries'],
      descriptionMd: `Реализуйте \`get(object, path, defaultValue)\` — безопасное чтение вложенного
свойства.

\`path\` — строка вида \`'a.b.c'\` или \`'list[0].name'\`, либо массив ключей.

\`\`\`js
get({ a: { b: { c: 42 } } }, 'a.b.c')        // 42
get({ a: { b: {} } }, 'a.x.c', 'по умолчанию') // 'по умолчанию'
get({ list: [{ name: 'Аня' }] }, 'list[0].name') // 'Аня'
\`\`\`

Если по пути получилось \`undefined\`, возвращается \`defaultValue\`. Значение
\`null\`, лежащее в объекте, — это результат, а не повод вернуть значение по
умолчанию.`,
      starterCode: `function get(object, path, defaultValue) {
  // Ваш код здесь
}
`,
      solutionCode: `function get(object, path, defaultValue) {
  const keys = Array.isArray(path)
    ? path
    : String(path)
        .replace(/\\[(\\w+)\\]/g, '.$1')
        .split('.')
        .filter((key) => key.length > 0)

  let current = object

  for (const key of keys) {
    if (current === null || current === undefined) return defaultValue
    current = current[key]
  }

  return current === undefined ? defaultValue : current
}
`,
      solutionNotes: `Скобочная запись нормализуется в точечную одной заменой: \`list[0].name\`
превращается в \`list.0.name\`, и дальше путь обрабатывается единообразно.

\`filter(key => key.length > 0)\` убирает пустые сегменты, которые появляются от
ведущей точки после замены.

Проверка \`=== undefined\` в конце, а не \`!current\`: иначе законные \`0\`, \`''\` и
\`false\` подменялись бы значением по умолчанию. Это самая частая ошибка в такой
задаче.

Опциональная цепочка \`?.\` решает похожую задачу, но только когда путь известен
на этапе написания кода. \`get\` нужен для путей, приходящих из данных.`,
      hints: [
        'Приведите скобочную запись к точечной регулярным выражением.',
        'Идите по ключам циклом, прерываясь на null и undefined.',
        'В конце сравнивайте именно с undefined: 0, пустая строка и false — законные значения.',
      ],
      cases: [
        { name: 'глубокий путь', args: [{ a: { b: { c: 42 } } }, 'a.b.c'], expected: 42 },
        { name: 'путь обрывается', args: [{ a: { b: {} } }, 'a.x.c', 'по умолчанию'], expected: 'по умолчанию' },
        { name: 'индекс массива', args: [{ list: [{ name: 'Аня' }] }, 'list[0].name'], expected: 'Аня' },
        { name: 'путь массивом', args: [{ a: { b: 1 } }, ['a', 'b']], expected: 1 },
        { name: 'ноль — это значение', args: [{ a: 0 }, 'a', 'по умолчанию'], expected: 0 },
        { name: 'null — это значение', args: [{ a: null }, 'a', 'по умолчанию'], expected: null, hidden: true },
        { name: 'пустая строка — значение', args: [{ a: '' }, 'a', 'по умолчанию'], expected: '', hidden: true },
        { name: 'нет значения по умолчанию', args: [{}, 'a.b'], expected: undefined, hidden: true },
      ],
    },

    {
      slug: 'deep-merge',
      title: 'Глубокое слияние объектов',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'deepMerge',
      tags: ['objects'],
      companies: ['ozon', 'sber'],
      descriptionMd: `Реализуйте \`deepMerge(target, ...sources)\` — рекурсивное слияние объектов.

- вложенные объекты сливаются рекурсивно;
- массивы и примитивы **заменяются**, а не склеиваются;
- \`undefined\` в источнике не затирает значение в цели;
- исходные объекты не мутируются — возвращается новый объект.

\`\`\`js
deepMerge(
  { a: 1, nested: { x: 1, y: 2 } },
  { nested: { y: 20, z: 30 } },
)
// { a: 1, nested: { x: 1, y: 20, z: 30 } }
\`\`\``,
      starterCode: `function deepMerge(target, ...sources) {
  // Ваш код здесь
}
`,
      solutionCode: `function isPlainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value)
}

function deepMerge(target, ...sources) {
  const result = isPlainObject(target) ? { ...target } : {}

  for (const source of sources) {
    if (!isPlainObject(source)) continue

    for (const key of Object.keys(source)) {
      const value = source[key]
      if (value === undefined) continue

      result[key] =
        isPlainObject(value) && isPlainObject(result[key])
          ? deepMerge(result[key], value)
          : value
    }
  }

  return result
}
`,
      solutionNotes: `Копия \`{ ...target }\` в самом начале — то, что делает функцию чистой: дальше
меняется только она, исходные объекты остаются нетронутыми.

Рекурсия включается лишь тогда, когда **оба** значения — простые объекты. Если
в цели примитив, а в источнике объект (или наоборот), сливать нечего — значение
заменяется.

Массивы намеренно заменяются целиком: у слияния массивов нет одного очевидного
поведения (склеить? объединить по индексам? по идентификатору?), и любая
догадка здесь удивит вызывающий код.

Пропуск \`undefined\` делает функцию удобной для слияния конфигураций: не
переданный параметр не затирает значение по умолчанию.`,
      hints: [
        'Начните с поверхностной копии цели — так исходные объекты не пострадают.',
        'Рекурсия нужна только когда и в цели, и в источнике простые объекты.',
        'Массивы и примитивы заменяются целиком.',
      ],
      cases: [
        {
          name: 'вложенные объекты сливаются',
          args: [{ a: 1, nested: { x: 1, y: 2 } }, { nested: { y: 20, z: 30 } }],
          expected: { a: 1, nested: { x: 1, y: 20, z: 30 } },
        },
        { name: 'массивы заменяются', args: [{ list: [1, 2] }, { list: [3] }], expected: { list: [3] } },
        { name: 'undefined не затирает', args: [{ a: 1 }, { a: undefined }], expected: { a: 1 } },
        { name: 'несколько источников', args: [{ a: 1 }, { b: 2 }, { c: 3 }], expected: { a: 1, b: 2, c: 3 } },
        { name: 'null затирает', args: [{ a: 1 }, { a: null }], expected: { a: null }, hidden: true },
      ],
      testCode: `test('исходные объекты не мутируются', function () {
  const target = { nested: { x: 1 } }
  const source = { nested: { y: 2 } }

  deepMerge(target, source)

  expect(target).toEqual({ nested: { x: 1 } })
  expect(source).toEqual({ nested: { y: 2 } })
})`,
    },

    {
      slug: 'chunk',
      title: 'Разбиение массива на части',
      difficulty: 'easy',
      checkMode: 'unit',
      languages: ['js', 'ts'],
      entryName: 'chunk',
      tags: ['arrays'],
      descriptionMd: `Реализуйте \`chunk(array, size)\` — разбиение массива на подмассивы заданной длины.
Последний кусок может быть короче.

\`\`\`js
chunk([1, 2, 3, 4, 5], 2) // [[1, 2], [3, 4], [5]]
chunk([1, 2, 3], 5)       // [[1, 2, 3]]
\`\`\`

Если \`size\` меньше единицы, возвращается пустой массив.`,
      starterCode: `function chunk(array, size) {
  // Ваш код здесь
}
`,
      starterCodeTs: `function chunk<T>(array: T[], size: number): T[][] {
  // Ваш код здесь
}
`,
      solutionCode: `function chunk(array, size) {
  if (size < 1) return []

  const result = []
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size))
  }
  return result
}
`,
      solutionCodeTs: `function chunk<T>(array: T[], size: number): T[][] {
  if (size < 1) return []

  const result: T[][] = []
  for (let i = 0; i < array.length; i += size) {
    result.push(array.slice(i, i + size))
  }
  return result
}
`,
      solutionNotes: `Шаг цикла равен \`size\`, а \`slice\` сам обрезает выход за границу массива —
поэтому короткий последний кусок получается без отдельной ветки.

Проверка \`size < 1\` обязательна: при нуле или отрицательном шаге индекс не
растёт, и цикл становится бесконечным.`,
      hints: [
        'Идите по массиву шагом size и берите slice(i, i + size).',
        'slice сам обрежет последний кусок по длине массива.',
        'При size < 1 цикл станет бесконечным — обработайте это отдельно.',
      ],
      cases: [
        { name: 'ровное разбиение', args: [[1, 2, 3, 4], 2], expected: [[1, 2], [3, 4]] },
        { name: 'остаток короче', args: [[1, 2, 3, 4, 5], 2], expected: [[1, 2], [3, 4], [5]] },
        { name: 'size больше длины', args: [[1, 2, 3], 5], expected: [[1, 2, 3]] },
        { name: 'пустой массив', args: [[], 2], expected: [] },
        { name: 'size = 1', args: [[1, 2], 1], expected: [[1], [2]] },
        { name: 'size = 0', args: [[1, 2], 0], expected: [], hidden: true },
      ],
    },

    {
      slug: 'uniq-by',
      title: 'Уникальные элементы',
      difficulty: 'easy',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'uniqBy',
      tags: ['arrays'],
      companies: ['wildberries'],
      descriptionMd: `Реализуйте \`uniqBy(items, key)\` — удаление дубликатов.

- \`key\` — имя свойства или функция; если не передан, элементы сравниваются
  сами с собой;
- сохраняется **первое** вхождение и исходный порядок;
- сложность линейная.

\`\`\`js
uniqBy([1, 2, 2, 3, 1])                                  // [1, 2, 3]
uniqBy([{ id: 1 }, { id: 2 }, { id: 1 }], 'id')          // [{ id: 1 }, { id: 2 }]
uniqBy([1.2, 1.8, 2.1], Math.floor)                      // [1.2, 2.1]
\`\`\``,
      starterCode: `function uniqBy(items, key) {
  // Ваш код здесь
}
`,
      solutionCode: `function uniqBy(items, key) {
  const getKey =
    key === undefined ? (item) => item : typeof key === 'function' ? key : (item) => item[key]

  const seen = new Set()
  const result = []

  for (const item of items) {
    const itemKey = getKey(item)
    if (seen.has(itemKey)) continue

    seen.add(itemKey)
    result.push(item)
  }

  return result
}
`,
      solutionNotes: `\`Set\` даёт проверку вхождения за O(1), поэтому весь алгоритм линеен. Наивный
вариант с \`result.some(...)\` внутри цикла дал бы O(n²) — на этом и ловят.

\`Set\` сравнивает по \`SameValueZero\`: \`NaN\` считается равным \`NaN\`, а \`+0\` и \`-0\` —
одним значением. Для удаления дубликатов это ровно то поведение, которое нужно.

Элементы добавляются в результат сразу при первой встрече, поэтому порядок
сохраняется без сортировки.`,
      hints: [
        'Виденные ключи храните в Set — проверка вхождения будет за O(1).',
        'Приведите key к функции один раз, до цикла.',
      ],
      cases: [
        { name: 'числа', args: [[1, 2, 2, 3, 1]], expected: [1, 2, 3] },
        { name: 'по свойству', args: [[{ id: 1 }, { id: 2 }, { id: 1 }], 'id'], expected: [{ id: 1 }, { id: 2 }] },
        { name: 'пустой массив', args: [[]], expected: [] },
        { name: 'без дубликатов', args: [['a', 'b']], expected: ['a', 'b'] },
        { name: 'NaN считается дубликатом', args: [[NaN, NaN, 1]], expected: [NaN, 1], hidden: true },
      ],
      testCode: `test('ключ-функция', function () {
  expect(uniqBy([1.2, 1.8, 2.1], Math.floor)).toEqual([1.2, 2.1])
})

test('сохраняется первое вхождение', function () {
  const first = { id: 1, tag: 'первый' }
  const second = { id: 1, tag: 'второй' }
  expect(uniqBy([first, second], 'id')[0].tag).toBe('первый')
})`,
    },

    {
      slug: 'pick-omit',
      title: 'pick и omit',
      difficulty: 'easy',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'pick',
      tags: ['objects'],
      descriptionMd: `Реализуйте две функции работы с объектами:

- \`pick(object, keys)\` возвращает объект только с указанными ключами;
- \`omit(object, keys)\` возвращает объект без указанных ключей.

\`\`\`js
pick({ a: 1, b: 2, c: 3 }, ['a', 'c']) // { a: 1, c: 3 }
omit({ a: 1, b: 2, c: 3 }, ['b'])      // { a: 1, c: 3 }
\`\`\`

Ключей, которых нет в объекте, в результате \`pick\` быть не должно (а не со
значением \`undefined\`). Исходный объект не мутируется.`,
      starterCode: `function pick(object, keys) {
  // Ваш код здесь
}

function omit(object, keys) {
  // Ваш код здесь
}
`,
      solutionCode: `function pick(object, keys) {
  const result = {}

  for (const key of keys) {
    if (Object.prototype.hasOwnProperty.call(object, key)) {
      result[key] = object[key]
    }
  }

  return result
}

function omit(object, keys) {
  const excluded = new Set(keys)
  const result = {}

  for (const key of Object.keys(object)) {
    if (!excluded.has(key)) result[key] = object[key]
  }

  return result
}
`,
      solutionNotes: `В \`pick\` проверка \`hasOwnProperty\` решает сразу две задачи: не создаёт ключей со
значением \`undefined\` для отсутствующих свойств и не подтягивает значения из
прототипа.

В \`omit\` список исключений заворачивается в \`Set\` — иначе на каждый ключ объекта
шёл бы линейный поиск по массиву, и сложность стала бы O(n·m).

Обе функции создают новый объект и копируют значения поверхностно: вложенные
объекты остаются общими с исходным. Для конфигураций этого достаточно; если
нужна независимость — сначала \`deepClone\`.`,
      hints: [
        'В pick проверяйте hasOwnProperty — иначе появятся ключи со значением undefined.',
        'В omit заверните список исключаемых ключей в Set.',
      ],
      cases: [
        { name: 'pick выбирает ключи', args: [{ a: 1, b: 2, c: 3 }, ['a', 'c']], expected: { a: 1, c: 3 } },
        { name: 'pick без несуществующих ключей', args: [{ a: 1 }, ['a', 'nope']], expected: { a: 1 } },
        { name: 'pick с пустым списком', args: [{ a: 1 }, []], expected: {} },
      ],
      testCode: `test('omit убирает ключи', function () {
  expect(omit({ a: 1, b: 2, c: 3 }, ['b'])).toEqual({ a: 1, c: 3 })
})

test('omit с пустым списком возвращает копию', function () {
  const source = { a: 1 }
  const result = omit(source, [])
  expect(result).toEqual({ a: 1 })
  expect(result).not.toBe(source)
})

test('исходный объект не мутируется', function () {
  const source = { a: 1, b: 2 }
  pick(source, ['a'])
  omit(source, ['a'])
  expect(source).toEqual({ a: 1, b: 2 })
})`,
    },
  ],
}
