import type { TrainerTopicSeed } from './types'

/**
 * Тема 10. LeetCode Easy.
 *
 * Отсекающий минимум: эти задачи дают на первом техническом этапе почти везде —
 * и в российском бигтехе, и за рубежом. Ожидается не просто рабочее решение,
 * а оптимальное по сложности.
 */
export const leetcodeEasy: TrainerTopicSeed = {
  slug: 'leetcode-easy',
  title: 'LeetCode: Easy',
  description: 'Two Sum, Valid Parentheses, FizzBuzz и другая обязательная классика',
  category: 'leetcode',
  icon: '🟢',
  order: 10,
  tasks: [
    {
      slug: 'two-sum',
      title: 'Two Sum',
      difficulty: 'easy',
      checkMode: 'unit',
      languages: ['js', 'ts'],
      entryName: 'twoSum',
      tags: ['leetcode', 'arrays'],
      companies: ['yandex', 'ozon', 'avito', 'faang'],
      leetcodeNumber: 1,
      sourceUrl: 'https://leetcode.com/problems/two-sum/',
      descriptionMd: `Дан массив чисел \`nums\` и число \`target\`. Верните индексы двух элементов, сумма
которых равна \`target\`.

- ровно одно решение гарантировано;
- один и тот же элемент нельзя использовать дважды;
- индексы возвращаются в порядке возрастания.

\`\`\`js
twoSum([2, 7, 11, 15], 9) // [0, 1]
twoSum([3, 2, 4], 6)      // [1, 2]
twoSum([3, 3], 6)         // [0, 1]
\`\`\`

Вложенные циклы дают O(n²). Нужно O(n).`,
      starterCode: `function twoSum(nums, target) {
  // Ваш код здесь
}
`,
      starterCodeTs: `function twoSum(nums: number[], target: number): number[] {
  // Ваш код здесь
}
`,
      solutionCode: `function twoSum(nums, target) {
  // Карта «нужное число → его индекс»: на каждом шаге проверяем,
  // встречали ли мы уже дополнение до target.
  const seen = new Map()

  for (let i = 0; i < nums.length; i++) {
    const complement = target - nums[i]

    if (seen.has(complement)) return [seen.get(complement), i]

    seen.set(nums[i], i)
  }

  return []
}
`,
      solutionCodeTs: `function twoSum(nums: number[], target: number): number[] {
  const seen = new Map<number, number>()

  for (let i = 0; i < nums.length; i++) {
    const complement = target - nums[i]
    const found = seen.get(complement)

    if (found !== undefined) return [found, i]

    seen.set(nums[i], i)
  }

  return []
}
`,
      solutionNotes: `Вместо поиска пары перебором мы на каждом шаге спрашиваем: «а не встречалось ли
уже число, которого не хватает до \`target\`?» Ответ в хеш-таблице — за O(1),
значит весь алгоритм — O(n) времени и O(n) памяти.

Порядок внутри цикла важен: сначала проверка, потом запись. Если записать
раньше, элемент найдёт сам себя — и на \`twoSum([3, 2, 4], 6)\` вернётся \`[0, 0]\`.

Индексы автоматически идут по возрастанию: \`seen.get(complement)\` — это индекс
встреченного ранее элемента, то есть заведомо меньший.

Дубликаты (\`[3, 3]\`) работают именно благодаря этому порядку: второе \`3\` найдёт
в карте первое.`,
      hints: [
        'Храните в Map уже встреченные числа и их индексы.',
        'На каждом шаге ищите target - nums[i] среди встреченных.',
        'Сначала проверяйте, потом записывайте — иначе элемент найдёт сам себя.',
      ],
      cases: [
        { name: 'пример из условия', args: [[2, 7, 11, 15], 9], expected: [0, 1] },
        { name: 'решение не в начале', args: [[3, 2, 4], 6], expected: [1, 2] },
        { name: 'одинаковые числа', args: [[3, 3], 6], expected: [0, 1] },
        { name: 'отрицательные числа', args: [[-1, -2, -3, -4], -6], expected: [1, 3], hidden: true },
        { name: 'ноль в сумме', args: [[0, 4, 3, 0], 0], expected: [0, 3], hidden: true },
      ],
      testCode: `test('большой массив обрабатывается за линейное время', function () {
  const big = Array.from({ length: 100000 }, function (_unused, i) { return i })
  expect(twoSum(big, 199997)).toEqual([99998, 99999])
})`,
    },

    {
      slug: 'valid-parentheses',
      title: 'Valid Parentheses',
      difficulty: 'easy',
      checkMode: 'unit',
      languages: ['js', 'ts'],
      entryName: 'isValid',
      tags: ['leetcode', 'strings', 'data-structures'],
      companies: ['yandex', 'ozon', 'tbank', 'faang'],
      leetcodeNumber: 20,
      sourceUrl: 'https://leetcode.com/problems/valid-parentheses/',
      descriptionMd: `Дана строка из символов \`()[]{}\`. Определите, корректна ли последовательность
скобок.

Последовательность корректна, когда каждая открывающая скобка закрыта скобкой
того же типа и в правильном порядке.

\`\`\`js
isValid('()[]{}')  // true
isValid('([)]')    // false — порядок нарушен
isValid('(]')      // false — тип не совпал
isValid('(')       // false — не закрыта
isValid('')        // true
\`\`\``,
      starterCode: `function isValid(text) {
  // Ваш код здесь
}
`,
      starterCodeTs: `function isValid(text: string): boolean {
  // Ваш код здесь
}
`,
      solutionCode: `function isValid(text) {
  const pairs = { ')': '(', ']': '[', '}': '{' }
  const stack = []

  for (const char of text) {
    if (char === '(' || char === '[' || char === '{') {
      stack.push(char)
      continue
    }

    // Закрывающая скобка обязана закрыть последнюю открытую.
    if (stack.pop() !== pairs[char]) return false
  }

  // Непустой стек означает незакрытые скобки.
  return stack.length === 0
}
`,
      solutionCodeTs: `function isValid(text: string): boolean {
  const pairs: Record<string, string> = { ')': '(', ']': '[', '}': '{' }
  const stack: string[] = []

  for (const char of text) {
    if (char === '(' || char === '[' || char === '{') {
      stack.push(char)
      continue
    }

    if (stack.pop() !== pairs[char]) return false
  }

  return stack.length === 0
}
`,
      solutionNotes: `Задача — каноничный пример того, зачем нужен стек: «последняя открытая скобка
должна закрыться первой» — это буквально определение LIFO.

Финальная проверка \`stack.length === 0\` обязательна и её чаще всего забывают.
Без неё строка \`'((('\` пройдёт как корректная: ни одного несоответствия не было,
но и ни одна скобка не закрыта.

\`stack.pop()\` на пустом стеке возвращает \`undefined\`, что не совпадёт ни с одной
скобкой, — поэтому лишняя закрывающая скобка отсекается тем же сравнением, без
отдельной проверки.

Сложность — O(n) по времени и O(n) по памяти в худшем случае (все скобки
открывающие).`,
      hints: [
        'Открывающие скобки кладите в стек, закрывающие — сверяйте с вершиной.',
        'В конце стек обязан быть пустым.',
        'pop на пустом стеке даёт undefined — отдельная проверка не нужна.',
      ],
      cases: [
        { name: 'все типы по порядку', args: ['()[]{}'], expected: true },
        { name: 'нарушен порядок', args: ['([)]'], expected: false },
        { name: 'не совпал тип', args: ['(]'], expected: false },
        { name: 'не закрыта', args: ['('], expected: false },
        { name: 'лишняя закрывающая', args: [')'], expected: false },
        { name: 'пустая строка', args: [''], expected: true },
        { name: 'вложенные', args: ['{[()]}'], expected: true, hidden: true },
        { name: 'много незакрытых', args: ['((('], expected: false, hidden: true },
      ],
    },

    {
      slug: 'fizzbuzz',
      title: 'FizzBuzz',
      difficulty: 'easy',
      checkMode: 'unit',
      languages: ['js', 'ts'],
      entryName: 'fizzBuzz',
      tags: ['leetcode'],
      leetcodeNumber: 412,
      sourceUrl: 'https://leetcode.com/problems/fizz-buzz/',
      descriptionMd: `Классическая разминка. Верните массив строк от \`1\` до \`n\`, где:

- кратные 3 заменены на \`'Fizz'\`;
- кратные 5 — на \`'Buzz'\`;
- кратные и 3, и 5 — на \`'FizzBuzz'\`;
- остальные — само число строкой.

\`\`\`js
fizzBuzz(5) // ['1', '2', 'Fizz', '4', 'Buzz']
\`\`\``,
      starterCode: `function fizzBuzz(n) {
  // Ваш код здесь
}
`,
      starterCodeTs: `function fizzBuzz(n: number): string[] {
  // Ваш код здесь
}
`,
      solutionCode: `function fizzBuzz(n) {
  const result = []

  for (let i = 1; i <= n; i++) {
    let line = ''
    if (i % 3 === 0) line += 'Fizz'
    if (i % 5 === 0) line += 'Buzz'

    result.push(line || String(i))
  }

  return result
}
`,
      solutionCodeTs: `function fizzBuzz(n: number): string[] {
  const result: string[] = []

  for (let i = 1; i <= n; i++) {
    let line = ''
    if (i % 3 === 0) line += 'Fizz'
    if (i % 5 === 0) line += 'Buzz'

    result.push(line || String(i))
  }

  return result
}
`,
      solutionNotes: `Сборка строки из двух независимых условий избавляет от отдельной ветки для
пятнадцати. Прямолинейный вариант с \`if (i % 15 === 0)\` работает, но повторяет
условия: добавится третий делитель — придётся переписывать все комбинации.

\`line || String(i)\` опирается на то, что пустая строка ложна. Читается это
как «если ничего не накопилось — берём само число».

Проверку \`i % 15\` многие пишут первой, и это правильный порядок для варианта с
тремя ветками: иначе кратные пятнадцати перехватит условие про тройку.`,
      hints: [
        'Собирайте строку из двух независимых условий — тогда ветка для 15 не понадобится.',
        'Пустая строка ложна: line || String(i) даёт нужный запасной вариант.',
      ],
      cases: [
        { name: 'до пяти', args: [5], expected: ['1', '2', 'Fizz', '4', 'Buzz'] },
        { name: 'до пятнадцати', args: [15], expected: ['1', '2', 'Fizz', '4', 'Buzz', 'Fizz', '7', '8', 'Fizz', 'Buzz', '11', 'Fizz', '13', '14', 'FizzBuzz'] },
        { name: 'один', args: [1], expected: ['1'] },
        { name: 'ноль', args: [0], expected: [] },
        { name: 'до трёх', args: [3], expected: ['1', '2', 'Fizz'], hidden: true },
      ],
    },

    {
      slug: 'contains-duplicate',
      title: 'Contains Duplicate',
      difficulty: 'easy',
      checkMode: 'unit',
      languages: ['js', 'ts'],
      entryName: 'containsDuplicate',
      tags: ['leetcode', 'arrays'],
      companies: ['ozon', 'faang'],
      leetcodeNumber: 217,
      sourceUrl: 'https://leetcode.com/problems/contains-duplicate/',
      descriptionMd: `Определите, встречается ли в массиве хотя бы одно число дважды.

\`\`\`js
containsDuplicate([1, 2, 3, 1]) // true
containsDuplicate([1, 2, 3])    // false
containsDuplicate([])           // false
\`\`\`

Нужна сложность O(n). Решение должно выходить досрочно, как только дубликат
найден.`,
      starterCode: `function containsDuplicate(nums) {
  // Ваш код здесь
}
`,
      starterCodeTs: `function containsDuplicate(nums: number[]): boolean {
  // Ваш код здесь
}
`,
      solutionCode: `function containsDuplicate(nums) {
  const seen = new Set()

  for (const value of nums) {
    // Выходим сразу: досматривать остаток массива незачем.
    if (seen.has(value)) return true
    seen.add(value)
  }

  return false
}
`,
      solutionCodeTs: `function containsDuplicate(nums: number[]): boolean {
  const seen = new Set<number>()

  for (const value of nums) {
    if (seen.has(value)) return true
    seen.add(value)
  }

  return false
}
`,
      solutionNotes: `Однострочник \`new Set(nums).size !== nums.length\` даёт тот же ответ, но всегда
проходит весь массив. Явный цикл выходит на первом дубликате — на массиве в
миллион элементов с дубликатом во второй позиции разница огромна.

Сортировка с проверкой соседей тоже решает задачу, но это O(n log n) и порча
исходного массива.

\`Set\` сравнивает по \`SameValueZero\`, поэтому \`NaN\` корректно считается дубликатом
самого себя — в отличие от \`indexOf\`, который \`NaN\` не находит вовсе.`,
      hints: [
        'Set плюс ранний выход — O(n) и без лишнего прохода.',
        'new Set(nums).size !== nums.length тоже работает, но всегда проходит весь массив.',
      ],
      cases: [
        { name: 'дубликат есть', args: [[1, 2, 3, 1]], expected: true },
        { name: 'дубликатов нет', args: [[1, 2, 3]], expected: false },
        { name: 'пустой массив', args: [[]], expected: false },
        { name: 'один элемент', args: [[1]], expected: false },
        { name: 'все одинаковые', args: [[7, 7, 7]], expected: true, hidden: true },
        { name: 'NaN считается дубликатом', args: [[NaN, NaN]], expected: true, hidden: true },
      ],
    },

    {
      slug: 'best-time-to-buy-sell',
      title: 'Best Time to Buy and Sell Stock',
      difficulty: 'easy',
      checkMode: 'unit',
      languages: ['js', 'ts'],
      entryName: 'maxProfit',
      tags: ['leetcode', 'arrays'],
      companies: ['yandex', 'tbank', 'faang'],
      leetcodeNumber: 121,
      sourceUrl: 'https://leetcode.com/problems/best-time-to-buy-and-sell-stock/',
      descriptionMd: `Дан массив \`prices\`, где \`prices[i]\` — цена акции в день \`i\`.

Выберите один день для покупки и **более поздний** день для продажи так, чтобы
прибыль была максимальной. Верните эту прибыль или \`0\`, если заработать нельзя.

\`\`\`js
maxProfit([7, 1, 5, 3, 6, 4]) // 5 — купить за 1, продать за 6
maxProfit([7, 6, 4, 3, 1])    // 0 — цена только падает
\`\`\`

Нужен один проход, O(n).`,
      starterCode: `function maxProfit(prices) {
  // Ваш код здесь
}
`,
      starterCodeTs: `function maxProfit(prices: number[]): number {
  // Ваш код здесь
}
`,
      solutionCode: `function maxProfit(prices) {
  let minPrice = Infinity
  let best = 0

  for (const price of prices) {
    // Минимум обновляется до подсчёта прибыли, поэтому продажа
    // всегда оказывается не раньше покупки.
    if (price < minPrice) minPrice = price
    else if (price - minPrice > best) best = price - minPrice
  }

  return best
}
`,
      solutionCodeTs: `function maxProfit(prices: number[]): number {
  let minPrice = Infinity
  let best = 0

  for (const price of prices) {
    if (price < minPrice) minPrice = price
    else if (price - minPrice > best) best = price - minPrice
  }

  return best
}
`,
      solutionNotes: `Вся задача сводится к вопросу: «какая была минимальная цена **до** сегодняшнего
дня?» Ответ на него достаточно хранить в одной переменной — отсюда один проход
и O(1) памяти.

Порядок условий гарантирует корректность по времени: цена сначала может стать
новым минимумом, и только у более поздних дней появится шанс с ней сравниться.
Продажа раньше покупки невозможна по построению.

Начальное значение прибыли — ноль, а не \`-Infinity\`: по условию сделку можно не
заключать.

Эта же схема — основа алгоритма Кадане для задачи о максимальной подпоследовательности.`,
      hints: [
        'Достаточно помнить минимальную цену слева от текущего дня.',
        'Обновляйте минимум до подсчёта прибыли — тогда продажа не окажется раньше покупки.',
        'Начальная прибыль — ноль: сделку можно не заключать.',
      ],
      cases: [
        { name: 'обычный случай', args: [[7, 1, 5, 3, 6, 4]], expected: 5 },
        { name: 'цена только падает', args: [[7, 6, 4, 3, 1]], expected: 0 },
        { name: 'один день', args: [[5]], expected: 0 },
        { name: 'пустой массив', args: [[]], expected: 0 },
        { name: 'рост в конце', args: [[3, 2, 6, 5, 0, 3]], expected: 4, hidden: true },
        { name: 'одинаковые цены', args: [[2, 2, 2]], expected: 0, hidden: true },
      ],
    },

    {
      slug: 'merge-sorted-arrays',
      title: 'Merge Two Sorted Arrays',
      difficulty: 'easy',
      checkMode: 'unit',
      languages: ['js', 'ts'],
      entryName: 'mergeSorted',
      tags: ['leetcode', 'arrays'],
      companies: ['ozon', 'avito'],
      leetcodeNumber: 88,
      sourceUrl: 'https://leetcode.com/problems/merge-sorted-array/',
      descriptionMd: `Даны два массива, отсортированных по возрастанию. Верните новый отсортированный
массив, содержащий все элементы обоих.

\`\`\`js
mergeSorted([1, 3, 5], [2, 4, 6]) // [1, 2, 3, 4, 5, 6]
mergeSorted([], [1, 2])           // [1, 2]
\`\`\`

Нужна сложность O(n + m). Склеить массивы и отсортировать — это O(n log n),
такое решение не принимается.`,
      starterCode: `function mergeSorted(first, second) {
  // Ваш код здесь
}
`,
      starterCodeTs: `function mergeSorted(first: number[], second: number[]): number[] {
  // Ваш код здесь
}
`,
      solutionCode: `function mergeSorted(first, second) {
  const result = []
  let i = 0
  let j = 0

  while (i < first.length && j < second.length) {
    if (first[i] <= second[j]) result.push(first[i++])
    else result.push(second[j++])
  }

  // Ровно один из хвостов непустой — дописываем его целиком.
  while (i < first.length) result.push(first[i++])
  while (j < second.length) result.push(second[j++])

  return result
}
`,
      solutionCodeTs: `function mergeSorted(first: number[], second: number[]): number[] {
  const result: number[] = []
  let i = 0
  let j = 0

  while (i < first.length && j < second.length) {
    if (first[i] <= second[j]) result.push(first[i++])
    else result.push(second[j++])
  }

  while (i < first.length) result.push(first[i++])
  while (j < second.length) result.push(second[j++])

  return result
}
`,
      solutionNotes: `Это шаг слияния из сортировки слиянием. Два указателя идут по своим массивам,
и на каждом шаге в результат уходит меньший из текущих элементов — отсюда
O(n + m).

Нестрогое сравнение \`<=\` делает слияние стабильным: при равенстве первым идёт
элемент из первого массива. Для чисел это незаметно, для объектов — важно.

Два цикла-«дозаписи» после основного обязательны: когда один массив кончился,
остаток второго уже отсортирован и просто дописывается. Опускать их —
распространённая ошибка, из-за которой теряется хвост.`,
      hints: [
        'Два указателя, на каждом шаге берётся меньший элемент.',
        'После основного цикла допишите оставшийся хвост — их два, сработает один.',
      ],
      cases: [
        { name: 'чередование', args: [[1, 3, 5], [2, 4, 6]], expected: [1, 2, 3, 4, 5, 6] },
        { name: 'первый пуст', args: [[], [1, 2]], expected: [1, 2] },
        { name: 'второй пуст', args: [[1, 2], []], expected: [1, 2] },
        { name: 'оба пусты', args: [[], []], expected: [] },
        { name: 'не пересекаются', args: [[1, 2], [3, 4]], expected: [1, 2, 3, 4], hidden: true },
        { name: 'дубликаты', args: [[1, 1], [1, 2]], expected: [1, 1, 1, 2], hidden: true },
        { name: 'разная длина', args: [[1], [2, 3, 4, 5]], expected: [1, 2, 3, 4, 5], hidden: true },
      ],
    },

    {
      slug: 'max-depth-binary-tree',
      title: 'Maximum Depth of Binary Tree',
      difficulty: 'easy',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'maxDepth',
      tags: ['leetcode', 'data-structures', 'recursion'],
      companies: ['faang'],
      leetcodeNumber: 104,
      sourceUrl: 'https://leetcode.com/problems/maximum-depth-of-binary-tree/',
      descriptionMd: `Дано бинарное дерево — узлы вида \`{ value, left, right }\`, пустое поддерево — \`null\`.

Верните максимальную глубину: количество узлов на самом длинном пути от корня до
листа.

\`\`\`js
maxDepth({ value: 1, left: { value: 2, left: null, right: null }, right: null }) // 2
maxDepth(null) // 0
\`\`\`

Решение должно выдерживать вырожденное дерево-цепочку глубиной в десятки тысяч
узлов — рекурсия здесь переполнит стек.`,
      starterCode: `function maxDepth(root) {
  // Ваш код здесь
}
`,
      solutionCode: `function maxDepth(root) {
  if (root === null) return 0

  // Обход в ширину по слоям: глубина — это количество слоёв.
  // Рекурсия на дереве-цепочке переполнила бы стек.
  let depth = 0
  let level = [root]

  while (level.length > 0) {
    depth += 1
    const next = []

    for (const node of level) {
      if (node.left) next.push(node.left)
      if (node.right) next.push(node.right)
    }

    level = next
  }

  return depth
}
`,
      solutionNotes: `Рекурсивное решение (\`1 + Math.max(maxDepth(left), maxDepth(right))\`) — самое
короткое и на сбалансированном дереве совершенно нормальное: глубина там
логарифмическая.

Но дерево может выродиться в цепочку — например, если его строили вставкой
отсортированных значений. Тогда глубина рекурсии равна количеству узлов, и на
десятках тысяч узлов стек переполняется. Тест проверяет именно это.

Послойный обход в ширину расходует память под самый широкий слой, зато его
глубина не ограничена стеком вызовов. Глубина дерева здесь — просто число
обработанных слоёв.

На собеседовании стоит назвать оба варианта и объяснить, когда какой уместен.`,
      hints: [
        'Рекурсия короче, но переполнит стек на дереве-цепочке.',
        'Считайте слои обходом в ширину: глубина — это число слоёв.',
      ],
      setupCode: `function node(value, left, right) {
  return { value: value, left: left || null, right: right || null }
}
`,
      testCode: `test('пустое дерево', function () {
  expect(maxDepth(null)).toBe(0)
})

test('один узел', function () {
  expect(maxDepth(node(1))).toBe(1)
})

test('сбалансированное дерево', function () {
  const tree = node(1, node(2, node(4), node(5)), node(3))
  expect(maxDepth(tree)).toBe(3)
})

test('перекошенное дерево', function () {
  const tree = node(1, node(2, node(3)), null)
  expect(maxDepth(tree)).toBe(3)
})

test('глубже правая ветвь', function () {
  const tree = node(1, node(2), node(3, null, node(4, null, node(5))))
  expect(maxDepth(tree)).toBe(4)
})

test('цепочка из 30000 узлов не роняет стек', function () {
  let tree = node(30000)
  for (let i = 29999; i >= 1; i--) tree = node(i, tree, null)

  expect(maxDepth(tree)).toBe(30000)
})`,
    },

    {
      slug: 'palindrome-number',
      title: 'Palindrome Number',
      difficulty: 'easy',
      checkMode: 'unit',
      languages: ['js', 'ts'],
      entryName: 'isPalindromeNumber',
      tags: ['leetcode'],
      leetcodeNumber: 9,
      sourceUrl: 'https://leetcode.com/problems/palindrome-number/',
      descriptionMd: `Определите, является ли целое число палиндромом — читается ли оно одинаково слева
направо и справа налево.

\`\`\`js
isPalindromeNumber(121)  // true
isPalindromeNumber(-121) // false — минус мешает
isPalindromeNumber(10)   // false
\`\`\`

**Условие задачи:** решить без преобразования числа в строку.`,
      starterCode: `function isPalindromeNumber(n) {
  // Ваш код здесь
}
`,
      starterCodeTs: `function isPalindromeNumber(n: number): boolean {
  // Ваш код здесь
}
`,
      solutionCode: `function isPalindromeNumber(n) {
  // Отрицательные не палиндромы из-за минуса; числа, кратные 10
  // (кроме нуля), тоже — ведущего нуля у числа не бывает.
  if (n < 0 || (n % 10 === 0 && n !== 0)) return false

  let reversedHalf = 0
  let rest = n

  // Разворачиваем только половину: как только развёрнутый хвост
  // догнал остаток, середина пройдена.
  while (rest > reversedHalf) {
    reversedHalf = reversedHalf * 10 + (rest % 10)
    rest = Math.floor(rest / 10)
  }

  // Нечётная длина: средняя цифра оказалась в reversedHalf, её отбрасываем.
  return rest === reversedHalf || rest === Math.floor(reversedHalf / 10)
}
`,
      solutionCodeTs: `function isPalindromeNumber(n: number): boolean {
  if (n < 0 || (n % 10 === 0 && n !== 0)) return false

  let reversedHalf = 0
  let rest = n

  while (rest > reversedHalf) {
    reversedHalf = reversedHalf * 10 + (rest % 10)
    rest = Math.floor(rest / 10)
  }

  return rest === reversedHalf || rest === Math.floor(reversedHalf / 10)
}
`,
      solutionNotes: `Разворот только половины числа — тот ответ, ради которого задачу и дают.
Наивный вариант разворачивает число целиком и в языках с 32-битными целыми
рискует переполнением; здесь переполниться нечему по построению.

Два отсечения в начале экономят весь цикл. Отрицательные числа отпадают из-за
минуса. Числа, кратные десяти, — потому что палиндром обязан начинаться с нуля,
а у чисел ведущих нулей не бывает. Ноль при этом надо не потерять — он палиндром.

Условие выхода \`rest > reversedHalf\` — момент, когда развёрнутый хвост стал не
меньше оставшейся части, то есть середина пройдена.

Для нечётной длины средняя цифра оказывается лишней в \`reversedHalf\`, поэтому
сравнений два.`,
      hints: [
        'Отрицательные и кратные десяти (кроме нуля) отсекаются сразу.',
        'Достаточно развернуть половину числа: цикл идёт, пока остаток больше развёрнутой части.',
        'При нечётной длине средняя цифра лишняя — отбросьте её делением на десять.',
      ],
      cases: [
        { name: 'палиндром', args: [121], expected: true },
        { name: 'отрицательное', args: [-121], expected: false },
        { name: 'кратное десяти', args: [10], expected: false },
        { name: 'ноль', args: [0], expected: true },
        { name: 'одна цифра', args: [7], expected: true },
        { name: 'чётная длина', args: [1221], expected: true, hidden: true },
        { name: 'не палиндром', args: [123], expected: false, hidden: true },
        { name: 'большое число', args: [1234554321], expected: true, hidden: true },
      ],
    },

    {
      slug: 'move-zeroes',
      title: 'Move Zeroes',
      difficulty: 'easy',
      checkMode: 'unit',
      languages: ['js', 'ts'],
      entryName: 'moveZeroes',
      tags: ['leetcode', 'arrays'],
      companies: ['ozon', 'faang'],
      leetcodeNumber: 283,
      sourceUrl: 'https://leetcode.com/problems/move-zeroes/',
      descriptionMd: `Переместите все нули в конец массива, сохранив относительный порядок ненулевых
элементов.

Массив изменяется **на месте**; функция возвращает тот же массив.

\`\`\`js
moveZeroes([0, 1, 0, 3, 12]) // [1, 3, 12, 0, 0]
\`\`\`

Создавать новый массив нельзя. Нужен один проход.`,
      starterCode: `function moveZeroes(nums) {
  // Ваш код здесь
}
`,
      starterCodeTs: `function moveZeroes(nums: number[]): number[] {
  // Ваш код здесь
}
`,
      solutionCode: `function moveZeroes(nums) {
  // insertAt — место, куда встанет следующий ненулевой элемент.
  let insertAt = 0

  for (let i = 0; i < nums.length; i++) {
    if (nums[i] !== 0) {
      nums[insertAt] = nums[i]
      insertAt += 1
    }
  }

  // Хвост добиваем нулями: все значимые элементы уже сдвинуты влево.
  for (let i = insertAt; i < nums.length; i++) nums[i] = 0

  return nums
}
`,
      solutionCodeTs: `function moveZeroes(nums: number[]): number[] {
  let insertAt = 0

  for (let i = 0; i < nums.length; i++) {
    if (nums[i] !== 0) {
      nums[insertAt] = nums[i]
      insertAt += 1
    }
  }

  for (let i = insertAt; i < nums.length; i++) nums[i] = 0

  return nums
}
`,
      solutionNotes: `Два указателя: \`i\` читает, \`insertAt\` пишет. Поскольку \`insertAt\` никогда не
обгоняет \`i\`, перезапись безопасна — мы затираем только уже прочитанные ячейки.

Второй проход по хвосту не портит сложность: суммарно всё равно O(n).

Вариант с обменом (\`swap\`) тоже корректен и делает меньше записей, когда нулей
мало. Вариант через \`filter\` плюс \`concat\` создаёт новый массив и нарушает
условие «на месте».

Порядок ненулевых элементов сохраняется сам собой: они переписываются в том же
порядке, в каком встречаются.`,
      hints: [
        'Два указателя: один читает, другой указывает, куда писать.',
        'После прохода добейте хвост нулями.',
        'Писать можно безопасно: указатель записи никогда не обгоняет указатель чтения.',
      ],
      cases: [
        { name: 'пример из условия', args: [[0, 1, 0, 3, 12]], expected: [1, 3, 12, 0, 0] },
        { name: 'нулей нет', args: [[1, 2, 3]], expected: [1, 2, 3] },
        { name: 'все нули', args: [[0, 0]], expected: [0, 0] },
        { name: 'пустой массив', args: [[]], expected: [] },
        { name: 'нули в начале', args: [[0, 0, 1]], expected: [1, 0, 0], hidden: true },
        { name: 'отрицательные', args: [[0, -1, 0, -2]], expected: [-1, -2, 0, 0], hidden: true },
      ],
      testCode: `test('массив меняется на месте', function () {
  const source = [0, 1, 2]
  const result = moveZeroes(source)

  expect(result).toBe(source)
  expect(source).toEqual([1, 2, 0])
})`,
    },

    {
      slug: 'roman-to-integer',
      title: 'Roman to Integer',
      difficulty: 'easy',
      checkMode: 'unit',
      languages: ['js', 'ts'],
      entryName: 'romanToInt',
      tags: ['leetcode', 'strings'],
      companies: ['faang'],
      leetcodeNumber: 13,
      sourceUrl: 'https://leetcode.com/problems/roman-to-integer/',
      descriptionMd: `Преобразуйте римское число в арабское.

Символы: \`I\` = 1, \`V\` = 5, \`X\` = 10, \`L\` = 50, \`C\` = 100, \`D\` = 500, \`M\` = 1000.

Обычно цифры идут по убыванию и складываются. Но если меньшая стоит перед
большей — она вычитается: \`IV\` = 4, \`IX\` = 9, \`XL\` = 40, \`CM\` = 900.

\`\`\`js
romanToInt('III')       // 3
romanToInt('LVIII')     // 58
romanToInt('MCMXCIV')   // 1994
\`\`\``,
      starterCode: `function romanToInt(roman) {
  // Ваш код здесь
}
`,
      starterCodeTs: `function romanToInt(roman: string): number {
  // Ваш код здесь
}
`,
      solutionCode: `function romanToInt(roman) {
  const values = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 }

  let total = 0

  for (let i = 0; i < roman.length; i++) {
    const current = values[roman[i]]
    const next = values[roman[i + 1]]

    // Меньшая цифра перед большей означает вычитание.
    if (next !== undefined && current < next) total -= current
    else total += current
  }

  return total
}
`,
      solutionCodeTs: `function romanToInt(roman: string): number {
  const values: Record<string, number> = { I: 1, V: 5, X: 10, L: 50, C: 100, D: 500, M: 1000 }

  let total = 0

  for (let i = 0; i < roman.length; i++) {
    const current = values[roman[i]]
    const next: number | undefined = values[roman[i + 1]]

    if (next !== undefined && current < next) total -= current
    else total += current
  }

  return total
}
`,
      solutionNotes: `Правило вычитания формулируется на уровне пары символов, а не списком
исключений: цифра вычитается, если следующая больше неё. Один проход, никакого
разбора шести особых случаев (\`IV\`, \`IX\`, \`XL\`, \`XC\`, \`CD\`, \`CM\`).

За последним символом ничего нет — \`values[roman[i + 1]]\` даёт \`undefined\`, и
проверка сама уводит в ветку сложения. Отдельное условие на конец строки не
нужно.

Сложность — O(n) по времени и O(1) по памяти: таблица значений фиксированного
размера.`,
      hints: [
        'Сравнивайте текущую цифру со следующей: если следующая больше — вычитайте.',
        'За последним символом стоит undefined — отдельная проверка конца строки не нужна.',
      ],
      cases: [
        { name: 'простое сложение', args: ['III'], expected: 3 },
        { name: 'вычитание', args: ['IV'], expected: 4 },
        { name: 'девять', args: ['IX'], expected: 9 },
        { name: 'составное', args: ['LVIII'], expected: 58 },
        { name: 'сложный случай', args: ['MCMXCIV'], expected: 1994 },
        { name: 'один символ', args: ['M'], expected: 1000, hidden: true },
        { name: 'сорок', args: ['XL'], expected: 40, hidden: true },
        { name: 'максимум', args: ['MMMCMXCIX'], expected: 3999, hidden: true },
      ],
    },
  ],
}
