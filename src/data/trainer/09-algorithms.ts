import type { TrainerTopicSeed } from './types'

/**
 * Тема 9. Алгоритмы.
 *
 * Классика, которую на фронтенде спрашивают не ради самих алгоритмов, а чтобы
 * увидеть, умеет ли человек рассуждать о сложности и краевых случаях.
 */
export const algorithms: TrainerTopicSeed = {
  slug: 'algorithms',
  title: 'Алгоритмы',
  description: 'Бинарный поиск, сортировки, обходы графа, рекурсия и мемоизация',
  category: 'algorithms',
  icon: '📐',
  order: 9,
  tasks: [
    {
      slug: 'binary-search',
      title: 'Бинарный поиск',
      difficulty: 'easy',
      checkMode: 'unit',
      languages: ['js', 'ts'],
      entryName: 'binarySearch',
      tags: ['algorithms'],
      companies: ['yandex', 'ozon', 'faang'],
      descriptionMd: `Реализуйте \`binarySearch(sorted, target)\` — поиск в отсортированном по
возрастанию массиве.

Возвращается индекс найденного элемента или \`-1\`.

Сложность — O(log n). Линейный проход не подходит.

\`\`\`js
binarySearch([1, 3, 5, 7, 9], 7)  // 3
binarySearch([1, 3, 5], 4)        // -1
\`\`\`

Массив может быть большим — решение должно выдерживать сотни тысяч элементов.`,
      starterCode: `function binarySearch(sorted, target) {
  // Ваш код здесь
}
`,
      starterCodeTs: `function binarySearch(sorted: number[], target: number): number {
  // Ваш код здесь
}
`,
      solutionCode: `function binarySearch(sorted, target) {
  let low = 0
  let high = sorted.length - 1

  while (low <= high) {
    // Такая форма середины не переполняется на больших индексах,
    // в отличие от (low + high) / 2.
    const middle = low + Math.floor((high - low) / 2)
    const value = sorted[middle]

    if (value === target) return middle
    if (value < target) low = middle + 1
    else high = middle - 1
  }

  return -1
}
`,
      solutionCodeTs: `function binarySearch(sorted: number[], target: number): number {
  let low = 0
  let high = sorted.length - 1

  while (low <= high) {
    const middle = low + Math.floor((high - low) / 2)
    const value = sorted[middle]

    if (value === target) return middle
    if (value < target) low = middle + 1
    else high = middle - 1
  }

  return -1
}
`,
      solutionNotes: `Три места, где в бинарном поиске ошибаются чаще всего.

**Условие цикла.** Нужно \`low <= high\`, а не \`<\`: при строгом неравенстве
пропускается случай, когда границы сошлись в одну точку, и элемент из одного
элемента не находится.

**Сдвиг границ.** \`middle + 1\` и \`middle - 1\`, а не \`middle\`: иначе при
несовпадении диапазон не сужается и цикл зацикливается.

**Вычисление середины.** \`low + (high - low) / 2\` вместо \`(low + high) / 2\` —
защита от переполнения. В JavaScript числа 64-битные и до переполнения далеко,
но привычка правильная: в Java эта ошибка десятилетие жила в стандартной
библиотеке.

Сложность O(log n): на каждом шаге диапазон уменьшается вдвое. Для миллиона
элементов это двадцать сравнений вместо миллиона.`,
      hints: [
        'Условие цикла — low <= high, иначе пропустите случай из одного элемента.',
        'Границы сдвигайте на middle ± 1, иначе цикл не завершится.',
        'Середину считайте как low + (high - low) / 2.',
      ],
      cases: [
        { name: 'элемент в середине', args: [[1, 3, 5, 7, 9], 5], expected: 2 },
        { name: 'первый элемент', args: [[1, 3, 5], 1], expected: 0 },
        { name: 'последний элемент', args: [[1, 3, 5], 5], expected: 2 },
        { name: 'элемента нет', args: [[1, 3, 5], 4], expected: -1 },
        { name: 'пустой массив', args: [[], 1], expected: -1 },
        { name: 'один элемент — найден', args: [[42], 42], expected: 0, hidden: true },
        { name: 'один элемент — не найден', args: [[42], 1], expected: -1, hidden: true },
        { name: 'меньше всех', args: [[5, 6, 7], 1], expected: -1, hidden: true },
      ],
      testCode: `test('большой массив обрабатывается быстро', function () {
  const big = Array.from({ length: 200000 }, function (_unused, i) { return i * 2 })

  expect(binarySearch(big, 199998)).toBe(99999)
  expect(binarySearch(big, 199999)).toBe(-1)
})`,
    },

    {
      slug: 'quick-sort',
      title: 'Быстрая сортировка',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'quickSort',
      tags: ['algorithms', 'recursion'],
      companies: ['yandex', 'sber'],
      descriptionMd: `Реализуйте \`quickSort(numbers)\` — быструю сортировку.

- возвращается **новый** отсортированный массив, исходный не меняется;
- дубликаты сохраняются;
- встроенный \`sort\` использовать нельзя.

\`\`\`js
quickSort([3, 1, 2]) // [1, 2, 3]
\`\`\`

Решение должно справляться с уже отсортированным массивом из десяти тысяч
элементов — выбирайте опорный элемент так, чтобы не выродиться в O(n²) и не
переполнить стек.`,
      starterCode: `function quickSort(numbers) {
  // Ваш код здесь
}
`,
      solutionCode: `function quickSort(numbers) {
  const result = numbers.slice()

  function partition(low, high) {
    // Опорный — середина: на уже отсортированных данных крайний элемент
    // выродил бы сортировку в O(n²) и переполнил стек.
    const middle = low + Math.floor((high - low) / 2)
    const pivot = result[middle]

    let left = low
    let right = high

    while (left <= right) {
      while (result[left] < pivot) left += 1
      while (result[right] > pivot) right -= 1

      if (left <= right) {
        const temp = result[left]
        result[left] = result[right]
        result[right] = temp
        left += 1
        right -= 1
      }
    }

    return left
  }

  function sort(low, high) {
    if (low >= high) return

    const split = partition(low, high)
    sort(low, split - 1)
    sort(split, high)
  }

  sort(0, result.length - 1)
  return result
}
`,
      solutionNotes: `Опорный элемент берётся из середины, а не с края. Это не вкусовщина: на уже
отсортированном массиве крайний опорный делит его на части 1 и n−1, сложность
становится O(n²), а глубина рекурсии — n, что переполняет стек. Ровно этот
случай и проверяет тест на десять тысяч элементов.

Схема Хоара (два указателя навстречу) обменивает элементы на месте, поэтому
дополнительной памяти почти не нужно. Популярный вариант с тремя массивами
(\`less\`, \`equal\`, \`greater\`) короче, но тратит O(n) памяти на каждом уровне
рекурсии.

Копия \`numbers.slice()\` в начале делает функцию чистой: исходный массив не
меняется.

Сложность — O(n log n) в среднем, O(n²) в худшем случае. Быстрая сортировка
нестабильна: равные элементы могут поменяться местами.`,
      hints: [
        'Опорный элемент берите из середины — иначе на отсортированных данных получите O(n²) и переполнение стека.',
        'Схема Хоара: два указателя идут навстречу и меняют элементы местами.',
        'Скопируйте массив в начале, чтобы не менять исходный.',
      ],
      cases: [
        { name: 'обычный массив', args: [[3, 1, 2]], expected: [1, 2, 3] },
        { name: 'уже отсортирован', args: [[1, 2, 3]], expected: [1, 2, 3] },
        { name: 'обратный порядок', args: [[3, 2, 1]], expected: [1, 2, 3] },
        { name: 'дубликаты', args: [[2, 1, 2, 1]], expected: [1, 1, 2, 2] },
        { name: 'пустой массив', args: [[]], expected: [] },
        { name: 'один элемент', args: [[1]], expected: [1] },
        { name: 'отрицательные числа', args: [[3, -1, 0, -5]], expected: [-5, -1, 0, 3], hidden: true },
      ],
      testCode: `test('исходный массив не меняется', function () {
  const source = [3, 1, 2]
  quickSort(source)
  expect(source).toEqual([3, 1, 2])
})

test('отсортированный массив из 10000 элементов не роняет стек', function () {
  const sorted = Array.from({ length: 10000 }, function (_unused, i) { return i })
  const result = quickSort(sorted)

  expect(result).toHaveLength(10000)
  expect(result[0]).toBe(0)
  expect(result[9999]).toBe(9999)
})

test('случайный большой массив', function () {
  const source = []
  let seed = 7
  for (let i = 0; i < 2000; i++) {
    seed = (seed * 1103515245 + 12345) % 2147483648
    source.push(seed % 1000)
  }

  const result = quickSort(source)
  for (let i = 1; i < result.length; i++) {
    expect(result[i] >= result[i - 1]).toBe(true)
  }
})`,
    },

    {
      slug: 'merge-sort',
      title: 'Сортировка слиянием',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'mergeSort',
      tags: ['algorithms', 'recursion'],
      companies: ['ozon', 'faang'],
      descriptionMd: `Реализуйте \`mergeSort(items, compare)\` — сортировку слиянием.

- \`compare(a, b)\` возвращает отрицательное число, ноль или положительное, как в
  \`Array.prototype.sort\`; по умолчанию сравниваются числа по возрастанию;
- сортировка должна быть **стабильной**: элементы, равные по компаратору,
  сохраняют исходный взаимный порядок;
- возвращается новый массив.

Стабильность — главное отличие от быстрой сортировки и то, ради чего сортировку
слиянием обычно и вспоминают.`,
      starterCode: `function mergeSort(items, compare) {
  // Ваш код здесь
}
`,
      solutionCode: `function mergeSort(items, compare) {
  const cmp = compare || ((a, b) => a - b)

  if (items.length <= 1) return items.slice()

  const middle = Math.floor(items.length / 2)
  const left = mergeSort(items.slice(0, middle), cmp)
  const right = mergeSort(items.slice(middle), cmp)

  const result = []
  let i = 0
  let j = 0

  while (i < left.length && j < right.length) {
    // Нестрогое сравнение (<= 0) сохраняет стабильность:
    // при равенстве первым берётся элемент из левой половины.
    if (cmp(left[i], right[j]) <= 0) {
      result.push(left[i])
      i += 1
    } else {
      result.push(right[j])
      j += 1
    }
  }

  while (i < left.length) result.push(left[i++])
  while (j < right.length) result.push(right[j++])

  return result
}
`,
      solutionNotes: `Стабильность обеспечивает одно нестрогое сравнение: при \`cmp(...) <= 0\` первым
берётся элемент из левой половины, а левая половина в исходном массиве шла
раньше. Замените \`<=\` на \`<\` — и сортировка перестанет быть стабильной, хотя
результат на числах не изменится. Тест это ловит.

Сложность — O(n log n) **всегда**, независимо от входных данных: массив делится
пополам, и разделение не зависит от значений. В этом преимущество перед быстрой
сортировкой, у которой худший случай O(n²).

Плата — O(n) дополнительной памяти на слияние. Быстрая сортировка сортирует на
месте.

Именно стабильная сортировка слиянием (в варианте TimSort) стоит за
\`Array.prototype.sort\` в современных движках.`,
      hints: [
        'Делите массив пополам, сортируйте половины рекурсивно, затем сливайте.',
        'Стабильность даёт нестрогое сравнение при слиянии: <= 0, а не < 0.',
        'После основного цикла допишите остаток непустой половины.',
      ],
      cases: [
        { name: 'обычный массив', args: [[3, 1, 2]], expected: [1, 2, 3] },
        { name: 'уже отсортирован', args: [[1, 2, 3]], expected: [1, 2, 3] },
        { name: 'обратный порядок', args: [[5, 4, 3, 2, 1]], expected: [1, 2, 3, 4, 5] },
        { name: 'пустой массив', args: [[]], expected: [] },
        { name: 'дубликаты', args: [[2, 1, 2]], expected: [1, 2, 2], hidden: true },
      ],
      testCode: `test('сортировка стабильна', function () {
  const items = [
    { key: 1, tag: 'первый' },
    { key: 0, tag: 'нулевой' },
    { key: 1, tag: 'второй' },
    { key: 1, tag: 'третий' },
  ]

  const result = mergeSort(items, function (a, b) { return a.key - b.key })

  expect(result.map(function (item) { return item.tag }))
    .toEqual(['нулевой', 'первый', 'второй', 'третий'])
})

test('свой компаратор', function () {
  expect(mergeSort([1, 3, 2], function (a, b) { return b - a })).toEqual([3, 2, 1])
})

test('исходный массив не меняется', function () {
  const source = [3, 1, 2]
  mergeSort(source)
  expect(source).toEqual([3, 1, 2])
})

test('большой массив', function () {
  const source = Array.from({ length: 5000 }, function (_unused, i) { return 5000 - i })
  const result = mergeSort(source)

  expect(result[0]).toBe(1)
  expect(result[4999]).toBe(5000)
})`,
    },

    {
      slug: 'graph-bfs',
      title: 'Поиск в ширину',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'bfs',
      tags: ['algorithms', 'data-structures'],
      companies: ['yandex', 'faang'],
      descriptionMd: `Реализуйте \`bfs(graph, start)\` — обход графа в ширину.

Граф задан списком смежности: объект, где ключ — вершина, значение — массив
соседей.

Возвращается массив вершин в порядке посещения. Соседи обходятся в том порядке,
в котором они перечислены. Циклы и недостижимые вершины обрабатываются корректно.

\`\`\`js
const graph = { a: ['b', 'c'], b: ['d'], c: ['d'], d: [] }
bfs(graph, 'a') // ['a', 'b', 'c', 'd']
\`\`\`

Дополнительно реализуйте \`shortestPath(graph, from, to)\` — кратчайший путь в
невзвешенном графе (массив вершин или \`null\`, если пути нет).`,
      starterCode: `function bfs(graph, start) {
  // Ваш код здесь
}

function shortestPath(graph, from, to) {
  // Ваш код здесь
}
`,
      solutionCode: `function bfs(graph, start) {
  if (!(start in graph)) return []

  const visited = new Set([start])
  const order = []
  const queue = [start]
  let head = 0

  while (head < queue.length) {
    // Указатель вместо shift(): shift переиндексирует массив и даёт O(n).
    const vertex = queue[head]
    head += 1
    order.push(vertex)

    for (const neighbour of graph[vertex] || []) {
      if (visited.has(neighbour)) continue
      visited.add(neighbour)
      queue.push(neighbour)
    }
  }

  return order
}

function shortestPath(graph, from, to) {
  if (!(from in graph) || !(to in graph)) return null
  if (from === to) return [from]

  const previous = new Map([[from, null]])
  const queue = [from]
  let head = 0

  while (head < queue.length) {
    const vertex = queue[head]
    head += 1

    for (const neighbour of graph[vertex] || []) {
      if (previous.has(neighbour)) continue

      previous.set(neighbour, vertex)
      if (neighbour === to) {
        // Восстанавливаем путь по ссылкам назад и разворачиваем.
        const path = [to]
        let current = vertex
        while (current !== null) {
          path.push(current)
          current = previous.get(current)
        }
        return path.reverse()
      }

      queue.push(neighbour)
    }
  }

  return null
}
`,
      solutionNotes: `Вершина помечается посещённой **в момент постановки в очередь**, а не при
извлечении. Если пометить при извлечении, одна и та же вершина успеет попасть в
очередь несколько раз через разных соседей.

Очередь с указателем головы вместо \`shift()\` — то же соображение, что и в задаче
про очередь: \`shift\` переиндексирует массив, превращая обход в O(V²).

Обход в ширину находит кратчайший путь в невзвешенном графе именно потому, что
идёт по слоям: вершина на расстоянии k обнаруживается раньше любой вершины на
расстоянии k+1. Для взвешенного графа это уже не работает — там нужен Дейкстра.

Путь восстанавливается по карте «вершина → откуда пришли»: хранить целый путь
для каждой вершины было бы расточительно.`,
      hints: [
        'Помечайте вершину посещённой при постановке в очередь, а не при извлечении.',
        'Вместо shift() держите указатель на голову очереди.',
        'Для пути храните карту «вершина → предыдущая» и восстанавливайте её в конце.',
      ],
      setupCode: `const sampleGraph = {
  a: ['b', 'c'],
  b: ['d'],
  c: ['d'],
  d: [],
  island: [],
}

const cyclicGraph = { a: ['b'], b: ['c'], c: ['a'] }
`,
      testCode: `test('порядок обхода по слоям', function () {
  expect(bfs(sampleGraph, 'a')).toEqual(['a', 'b', 'c', 'd'])
})

test('цикл не зацикливает обход', function () {
  expect(bfs(cyclicGraph, 'a')).toEqual(['a', 'b', 'c'])
})

test('изолированная вершина', function () {
  expect(bfs(sampleGraph, 'island')).toEqual(['island'])
})

test('несуществующая вершина', function () {
  expect(bfs(sampleGraph, 'нет')).toEqual([])
})

test('кратчайший путь', function () {
  expect(shortestPath(sampleGraph, 'a', 'd')).toEqual(['a', 'b', 'd'])
})

test('путь до самой себя', function () {
  expect(shortestPath(sampleGraph, 'a', 'a')).toEqual(['a'])
})

test('пути нет', function () {
  expect(shortestPath(sampleGraph, 'a', 'island')).toBe(null)
})

test('путь в графе с циклом', function () {
  expect(shortestPath(cyclicGraph, 'a', 'c')).toEqual(['a', 'b', 'c'])
})`,
    },

    {
      slug: 'graph-dfs',
      title: 'Поиск в глубину',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'dfs',
      tags: ['algorithms', 'recursion'],
      companies: ['sber'],
      descriptionMd: `Реализуйте \`dfs(graph, start)\` — обход графа в глубину, **без рекурсии**.

Возвращается массив вершин в порядке посещения: из каждой вершины обход уходит
вглубь по первому непосещённому соседу и только потом возвращается.

\`\`\`js
const graph = { a: ['b', 'c'], b: ['d'], c: [], d: [] }
dfs(graph, 'a') // ['a', 'b', 'd', 'c']
\`\`\`

Дополнительно реализуйте \`hasCycle(graph)\` — есть ли в ориентированном графе цикл.

Рекурсивный обход на глубоком графе переполняет стек — поэтому в \`dfs\`
используйте явный стек.`,
      starterCode: `function dfs(graph, start) {
  // Ваш код здесь
}

function hasCycle(graph) {
  // Ваш код здесь
}
`,
      solutionCode: `function dfs(graph, start) {
  if (!(start in graph)) return []

  const visited = new Set()
  const order = []
  const stack = [start]

  while (stack.length > 0) {
    const vertex = stack.pop()
    if (visited.has(vertex)) continue

    visited.add(vertex)
    order.push(vertex)

    // Соседи кладутся в обратном порядке: стек развернёт их обратно,
    // и обход пойдёт по первому соседу, как при рекурсии.
    const neighbours = graph[vertex] || []
    for (let i = neighbours.length - 1; i >= 0; i--) {
      if (!visited.has(neighbours[i])) stack.push(neighbours[i])
    }
  }

  return order
}

function hasCycle(graph) {
  const WHITE = 0
  const GRAY = 1
  const BLACK = 2
  const colors = new Map()

  for (const vertex of Object.keys(graph)) colors.set(vertex, WHITE)

  function visit(vertex) {
    colors.set(vertex, GRAY)

    for (const neighbour of graph[vertex] || []) {
      const color = colors.get(neighbour)
      // Серый сосед — значит мы вернулись в вершину, которую ещё обрабатываем:
      // это ребро назад, то есть цикл.
      if (color === GRAY) return true
      if (color === WHITE && visit(neighbour)) return true
    }

    colors.set(vertex, BLACK)
    return false
  }

  for (const vertex of Object.keys(graph)) {
    if (colors.get(vertex) === WHITE && visit(vertex)) return true
  }

  return false
}
`,
      solutionNotes: `Стек разворачивает порядок: чтобы обход шёл по первому соседу, соседей нужно
класть в обратном порядке. Без этого получится корректный обход в глубину, но
порядок разойдётся с рекурсивным вариантом.

Проверка \`visited\` делается дважды — перед добавлением в стек и после
извлечения. Первая экономит память, вторая обязательна: вершина может попасть в
стек несколько раз через разных соседей до того, как её посетят.

Поиск цикла требует трёх состояний, а не двух. Белый — не тронут, серый — в
обработке прямо сейчас, чёрный — обработан полностью. Цикл — это ребро в
**серую** вершину: мы вернулись туда, откуда ещё не вышли. Ребро в чёрную
вершину цикла не образует — это просто повторный путь к уже разобранному
поддереву. Двух состояний тут недостаточно: ромб \`a→b, a→c, b→d, c→d\` ошибочно
считался бы циклом.`,
      hints: [
        'Явный стек вместо рекурсии: pop берёт следующую вершину.',
        'Соседей кладите в стек в обратном порядке, чтобы обход шёл по первому.',
        'Для поиска цикла нужно три состояния вершины, а не два.',
      ],
      setupCode: `const treeGraph = { a: ['b', 'c'], b: ['d'], c: [], d: [] }
const diamondGraph = { a: ['b', 'c'], b: ['d'], c: ['d'], d: [] }
const cyclicGraph = { a: ['b'], b: ['c'], c: ['a'] }
const selfLoop = { a: ['a'] }
`,
      testCode: `test('обход уходит вглубь', function () {
  expect(dfs(treeGraph, 'a')).toEqual(['a', 'b', 'd', 'c'])
})

test('цикл не зацикливает обход', function () {
  expect(dfs(cyclicGraph, 'a')).toEqual(['a', 'b', 'c'])
})

test('ромб обходится без повторов', function () {
  expect(dfs(diamondGraph, 'a')).toEqual(['a', 'b', 'd', 'c'])
})

test('несуществующая вершина', function () {
  expect(dfs(treeGraph, 'нет')).toEqual([])
})

test('глубокий граф не роняет стек', function () {
  const deep = {}
  for (let i = 0; i < 20000; i++) deep['v' + i] = i < 19999 ? ['v' + (i + 1)] : []

  expect(dfs(deep, 'v0')).toHaveLength(20000)
})

test('цикл находится', function () {
  expect(hasCycle(cyclicGraph)).toBe(true)
})

test('в дереве цикла нет', function () {
  expect(hasCycle(treeGraph)).toBe(false)
})

test('ромб — это не цикл', function () {
  expect(hasCycle(diamondGraph)).toBe(false)
})

test('петля — это цикл', function () {
  expect(hasCycle(selfLoop)).toBe(true)
})`,
    },

    {
      slug: 'fibonacci-memo',
      title: 'Фибоначчи с мемоизацией',
      difficulty: 'easy',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'fib',
      tags: ['recursion', 'performance'],
      companies: ['yandex'],
      descriptionMd: `Реализуйте \`fib(n)\` — n-е число Фибоначчи (\`fib(0) = 0\`, \`fib(1) = 1\`).

Наивная рекурсия \`fib(n-1) + fib(n-2)\` имеет сложность O(2ⁿ) и на \`n = 50\`
считается минутами. Нужна линейная сложность.

\`fib(90)\` должно посчитаться мгновенно и точно (это ещё в пределах безопасных
целых чисел).

Отрицательный \`n\` — \`RangeError\`.`,
      starterCode: `function fib(n) {
  // Ваш код здесь
}
`,
      solutionCode: `function fib(n) {
  if (!Number.isInteger(n) || n < 0) {
    throw new RangeError('n должно быть целым неотрицательным числом')
  }

  if (n < 2) return n

  // Итерация вместо рекурсии: O(n) времени и O(1) памяти,
  // и никакого риска переполнить стек.
  let previous = 0
  let current = 1

  for (let i = 2; i <= n; i++) {
    const next = previous + current
    previous = current
    current = next
  }

  return current
}
`,
      solutionNotes: `Наивная рекурсия пересчитывает одни и те же значения экспоненциальное число
раз: \`fib(5)\` вызывает \`fib(3)\` дважды, \`fib(2)\` — трижды. Отсюда O(2ⁿ).

Мемоизация сводит это к O(n) времени и O(n) памяти. Итеративный вариант даёт ту
же O(n) по времени, но O(1) по памяти и не рискует переполнить стек — поэтому
на собеседовании его и ждут как «правильный» ответ.

Держать нужно всего два предыдущих значения: третье и дальше уже не влияют.

С \`n = 79\` результат перестаёт помещаться в \`Number.MAX_SAFE_INTEGER\`, и дальше
точность теряется. Для больших \`n\` нужен \`BigInt\`.`,
      hints: [
        'Рекурсия без мемоизации пересчитывает одни и те же значения — это O(2ⁿ).',
        'Достаточно хранить два предыдущих числа.',
      ],
      cases: [
        { name: 'нулевое', args: [0], expected: 0 },
        { name: 'первое', args: [1], expected: 1 },
        { name: 'десятое', args: [10], expected: 55 },
        { name: 'двадцатое', args: [20], expected: 6765 },
        { name: 'пятидесятое', args: [50], expected: 12586269025, hidden: true },
        { name: 'семидесятое', args: [70], expected: 190392490709135, hidden: true },
      ],
      testCode: `test('большое n считается мгновенно', function () {
  expect(fib(78)).toBe(8944394323791464)
})

test('отрицательное n бросает RangeError', function () {
  expect(function () { fib(-1) }).toThrow(RangeError)
})

test('нецелое n бросает RangeError', function () {
  expect(function () { fib(1.5) }).toThrow(RangeError)
})`,
    },

    {
      slug: 'sieve-of-eratosthenes',
      title: 'Решето Эратосфена',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'primesUpTo',
      tags: ['algorithms'],
      descriptionMd: `Реализуйте \`primesUpTo(limit)\` — все простые числа до \`limit\` включительно.

Наивная проверка каждого числа на делимость даёт O(n√n). Решето Эратосфена
работает за O(n log log n) — практически линейно.

\`\`\`js
primesUpTo(10) // [2, 3, 5, 7]
primesUpTo(1)  // []
\`\`\`

Дополнительно реализуйте \`isPrime(n)\` — проверку одного числа за O(√n).

\`primesUpTo(1000000)\` должно отработать быстро.`,
      starterCode: `function primesUpTo(limit) {
  // Ваш код здесь
}

function isPrime(n) {
  // Ваш код здесь
}
`,
      solutionCode: `function primesUpTo(limit) {
  if (limit < 2) return []

  // Uint8Array вместо массива булевых: в разы меньше памяти на больших лимитах.
  const composite = new Uint8Array(limit + 1)
  const primes = []

  for (let candidate = 2; candidate <= limit; candidate++) {
    if (composite[candidate]) continue

    primes.push(candidate)

    // Вычёркивание начинается с квадрата: меньшие кратные уже вычеркнули
    // предыдущие простые.
    for (let multiple = candidate * candidate; multiple <= limit; multiple += candidate) {
      composite[multiple] = 1
    }
  }

  return primes
}

function isPrime(n) {
  if (!Number.isInteger(n) || n < 2) return false
  if (n < 4) return true
  if (n % 2 === 0) return false

  // Делители проверяются до корня: больший делитель обязательно
  // имеет парный меньший, который мы бы уже нашли.
  for (let divisor = 3; divisor * divisor <= n; divisor += 2) {
    if (n % divisor === 0) return false
  }

  return true
}
`,
      solutionNotes: `Вычёркивание начинается с \`candidate * candidate\`, а не с \`candidate * 2\`.
Все меньшие кратные уже вычеркнуты меньшими простыми: кратные шести вычеркнули
двойка и тройка. Это заметно сокращает работу.

\`Uint8Array\` вместо массива булевых значений — на лимите в миллион это мегабайт
вместо восьми и заметно лучше для кеша процессора.

В \`isPrime\` делители проверяются до корня, потому что делители идут парами:
если \`n = a · b\` и \`a > √n\`, то \`b < √n\` — и такой делитель мы бы уже нашли.
Условие пишется как \`divisor * divisor <= n\`, а не \`divisor <= Math.sqrt(n)\`:
умножение дешевле извлечения корня и не теряет точность.

Чётные отсеиваются заранее, поэтому шаг цикла равен двум — вдвое меньше итераций.`,
      hints: [
        'Вычёркивать кратные можно начиная с квадрата числа.',
        'Uint8Array экономит память по сравнению с массивом булевых.',
        'В isPrime достаточно проверить делители до корня из n.',
      ],
      cases: [
        { name: 'до десяти', args: [10], expected: [2, 3, 5, 7] },
        { name: 'до двух', args: [2], expected: [2] },
        { name: 'до единицы', args: [1], expected: [] },
        { name: 'до нуля', args: [0], expected: [] },
        { name: 'до тридцати', args: [30], expected: [2, 3, 5, 7, 11, 13, 17, 19, 23, 29], hidden: true },
      ],
      testCode: `test('isPrime на малых числах', function () {
  expect(isPrime(2)).toBe(true)
  expect(isPrime(3)).toBe(true)
  expect(isPrime(4)).toBe(false)
  expect(isPrime(1)).toBe(false)
  expect(isPrime(0)).toBe(false)
  expect(isPrime(-7)).toBe(false)
})

test('isPrime на больших числах', function () {
  expect(isPrime(7919)).toBe(true)
  expect(isPrime(7920)).toBe(false)
  expect(isPrime(104729)).toBe(true)
})

test('решето на миллионе отрабатывает быстро', function () {
  const primes = primesUpTo(1000000)

  expect(primes).toHaveLength(78498)
  expect(primes[0]).toBe(2)
  expect(primes[78497]).toBe(999983)
})

test('решето согласуется с isPrime', function () {
  const primes = primesUpTo(200)
  expect(primes.every(isPrime)).toBe(true)
})`,
    },

    {
      slug: 'flatten-recursion',
      title: 'Обход дерева без рекурсии',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'flattenTree',
      tags: ['recursion', 'data-structures'],
      companies: ['avito', 'tbank'],
      descriptionMd: `Дано дерево категорий: у каждого узла есть \`id\`, \`name\` и необязательный массив
\`children\`.

Реализуйте \`flattenTree(nodes)\` — превращение дерева в плоский список, где у
каждого элемента есть \`id\`, \`name\`, \`depth\` (глубина, корень — 0) и \`parentId\`
(\`null\` у корневых).

Порядок — как при обходе в глубину: родитель, затем всё его поддерево, затем
следующий брат.

\`\`\`js
flattenTree([
  { id: 1, name: 'Электроника', children: [{ id: 2, name: 'Телефоны' }] },
])
// [
//   { id: 1, name: 'Электроника', depth: 0, parentId: null },
//   { id: 2, name: 'Телефоны',    depth: 1, parentId: 1 },
// ]
\`\`\`

Реализация должна выдерживать дерево глубиной в десятки тысяч уровней —
рекурсия здесь переполнит стек.`,
      starterCode: `function flattenTree(nodes) {
  // Ваш код здесь
}
`,
      solutionCode: `function flattenTree(nodes) {
  const result = []
  // Стек хранит не только узел, но и его контекст: глубину и родителя.
  const stack = nodes
    .map((node) => ({ node, depth: 0, parentId: null }))
    .reverse()

  while (stack.length > 0) {
    const { node, depth, parentId } = stack.pop()

    result.push({ id: node.id, name: node.name, depth, parentId })

    const children = node.children || []
    for (let i = children.length - 1; i >= 0; i--) {
      stack.push({ node: children[i], depth: depth + 1, parentId: node.id })
    }
  }

  return result
}
`,
      solutionNotes: `Ключевая идея — класть в стек не голый узел, а узел вместе с его контекстом
(глубиной и родителем). При рекурсии этот контекст жил бы в аргументах вызова;
при явном стеке его нужно нести с собой.

Дети кладутся в обратном порядке, потому что стек развернёт их обратно — иначе
братья обошлись бы справа налево.

Рекурсивное решение здесь короче, но на дереве глубиной в десятки тысяч уровней
переполнит стек вызовов. Такое дерево — не выдумка: категории маркетплейса,
комментарии с ответами, дерево DOM в тяжёлом приложении.

Практическое применение — превратить дерево в плоский список для виртуального
скролла: рендерить видимый кусок плоского массива намного дешевле, чем
рекурсивно обходить дерево на каждый кадр.`,
      hints: [
        'В стек кладите объект с узлом, глубиной и родителем — контекст не должен теряться.',
        'Детей кладите в обратном порядке, чтобы стек развернул их обратно.',
      ],
      setupCode: `const catalog = [
  {
    id: 1,
    name: 'Электроника',
    children: [
      { id: 2, name: 'Телефоны', children: [{ id: 3, name: 'Смартфоны' }] },
      { id: 4, name: 'Ноутбуки' },
    ],
  },
  { id: 5, name: 'Одежда' },
]
`,
      testCode: `test('порядок обхода в глубину', function () {
  expect(flattenTree(catalog).map(function (item) { return item.id })).toEqual([1, 2, 3, 4, 5])
})

test('глубина считается верно', function () {
  const byId = new Map(flattenTree(catalog).map(function (item) { return [item.id, item] }))

  expect(byId.get(1).depth).toBe(0)
  expect(byId.get(2).depth).toBe(1)
  expect(byId.get(3).depth).toBe(2)
  expect(byId.get(5).depth).toBe(0)
})

test('родитель проставлен', function () {
  const byId = new Map(flattenTree(catalog).map(function (item) { return [item.id, item] }))

  expect(byId.get(1).parentId).toBe(null)
  expect(byId.get(3).parentId).toBe(2)
  expect(byId.get(4).parentId).toBe(1)
})

test('пустое дерево', function () {
  expect(flattenTree([])).toEqual([])
})

test('узел без детей', function () {
  expect(flattenTree([{ id: 1, name: 'Один' }]))
    .toEqual([{ id: 1, name: 'Один', depth: 0, parentId: null }])
})

test('глубокое дерево не роняет стек', function () {
  let deep = { id: 20000, name: 'лист' }
  for (let i = 19999; i >= 1; i--) deep = { id: i, name: 'узел ' + i, children: [deep] }

  const result = flattenTree([deep])

  expect(result).toHaveLength(20000)
  expect(result[19999].depth).toBe(19999)
})`,
    },
  ],
}
