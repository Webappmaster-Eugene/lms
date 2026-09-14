import type { TrainerTopicSeed } from './types'

/**
 * Тема 11. LeetCode Medium.
 *
 * Уровень, на котором отбирают middle и senior. Здесь уже недостаточно
 * рабочего решения: спрашивают сложность и просят улучшить наивный вариант.
 */
export const leetcodeMedium: TrainerTopicSeed = {
  slug: 'leetcode-medium',
  title: 'LeetCode: Medium',
  description: 'Скользящее окно, два указателя, алгоритм Кадане, слияние интервалов',
  category: 'leetcode',
  icon: '🟡',
  order: 11,
  tasks: [
    {
      slug: 'longest-substring',
      title: 'Longest Substring Without Repeating Characters',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['js', 'ts'],
      entryName: 'lengthOfLongestSubstring',
      tags: ['leetcode', 'strings'],
      companies: ['yandex', 'ozon', 'faang'],
      leetcodeNumber: 3,
      sourceUrl: 'https://leetcode.com/problems/longest-substring-without-repeating-characters/',
      descriptionMd: `Найдите длину самой длинной подстроки без повторяющихся символов.

\`\`\`js
lengthOfLongestSubstring('abcabcbb') // 3 — 'abc'
lengthOfLongestSubstring('bbbbb')    // 1 — 'b'
lengthOfLongestSubstring('pwwkew')   // 3 — 'wke'
\`\`\`

Перебор всех подстрок даёт O(n²) или хуже. Нужно O(n) — один проход.`,
      starterCode: `function lengthOfLongestSubstring(text) {
  // Ваш код здесь
}
`,
      starterCodeTs: `function lengthOfLongestSubstring(text: string): number {
  // Ваш код здесь
}
`,
      solutionCode: `function lengthOfLongestSubstring(text) {
  // Скользящее окно [left, right]. В карте — последняя позиция каждого символа.
  const lastSeen = new Map()
  let left = 0
  let best = 0

  for (let right = 0; right < text.length; right++) {
    const char = text[right]
    const seenAt = lastSeen.get(char)

    // Левую границу двигаем только вперёд: старая позиция символа
    // могла остаться за пределами текущего окна.
    if (seenAt !== undefined && seenAt >= left) left = seenAt + 1

    lastSeen.set(char, right)
    best = Math.max(best, right - left + 1)
  }

  return best
}
`,
      solutionCodeTs: `function lengthOfLongestSubstring(text: string): number {
  const lastSeen = new Map<string, number>()
  let left = 0
  let best = 0

  for (let right = 0; right < text.length; right++) {
    const char = text[right]
    const seenAt = lastSeen.get(char)

    if (seenAt !== undefined && seenAt >= left) left = seenAt + 1

    lastSeen.set(char, right)
    best = Math.max(best, right - left + 1)
  }

  return best
}
`,
      solutionNotes: `Скользящее окно: правая граница идёт вперёд всегда, левая — прыгает за
последнее вхождение повторившегося символа. Каждый символ обрабатывается один
раз, отсюда O(n).

Условие \`seenAt >= left\` — то место, где чаще всего ошибаются. Символ мог
встречаться раньше, но уже выпасть из окна; без этой проверки левая граница
поехала бы назад, и окно посчиталось бы неверно. Пример \`'abba'\`: дойдя до
второго \`a\`, мы видим его прошлую позицию 0, но окно уже начинается с 2 —
двигать границу нельзя.

Хранить именно **последнюю** позицию, а не факт присутствия, обязательно: иначе
левую границу некуда прыгать и приходится двигать её по одному символу, что
возвращает O(n²) в худшем случае.

Память — O(k), где k — размер алфавита.`,
      hints: [
        'Скользящее окно: правая граница идёт вперёд, левая прыгает за повтор.',
        'Храните последнюю позицию каждого символа, а не факт его наличия.',
        'Левую границу двигайте только вперёд — старое вхождение может быть вне окна.',
      ],
      cases: [
        { name: 'пример из условия', args: ['abcabcbb'], expected: 3 },
        { name: 'все одинаковые', args: ['bbbbb'], expected: 1 },
        { name: 'окно в середине', args: ['pwwkew'], expected: 3 },
        { name: 'пустая строка', args: [''], expected: 0 },
        { name: 'один символ', args: ['a'], expected: 1 },
        { name: 'символ вне окна', args: ['abba'], expected: 2, hidden: true },
        { name: 'все разные', args: ['abcdef'], expected: 6, hidden: true },
        { name: 'пробелы', args: ['a b a'], expected: 3, hidden: true },
      ],
    },

    {
      slug: 'maximum-subarray',
      title: 'Maximum Subarray (алгоритм Кадане)',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['js', 'ts'],
      entryName: 'maxSubArray',
      tags: ['leetcode', 'arrays'],
      companies: ['yandex', 'sber', 'faang'],
      leetcodeNumber: 53,
      sourceUrl: 'https://leetcode.com/problems/maximum-subarray/',
      descriptionMd: `Найдите непрерывный подмассив с максимальной суммой и верните эту сумму.

Подмассив содержит хотя бы один элемент.

\`\`\`js
maxSubArray([-2, 1, -3, 4, -1, 2, 1, -5, 4]) // 6 — подмассив [4, -1, 2, 1]
maxSubArray([-1])                             // -1
maxSubArray([5, 4, -1, 7, 8])                 // 23
\`\`\`

Перебор всех подмассивов — O(n²). Нужно O(n).`,
      starterCode: `function maxSubArray(nums) {
  // Ваш код здесь
}
`,
      starterCodeTs: `function maxSubArray(nums: number[]): number {
  // Ваш код здесь
}
`,
      solutionCode: `function maxSubArray(nums) {
  if (nums.length === 0) return 0

  let best = nums[0]
  let current = nums[0]

  for (let i = 1; i < nums.length; i++) {
    // Либо продолжаем прошлый подмассив, либо начинаем новый с текущего
    // элемента. Отрицательный накопленный хвост тащить за собой нет смысла.
    current = Math.max(nums[i], current + nums[i])
    best = Math.max(best, current)
  }

  return best
}
`,
      solutionCodeTs: `function maxSubArray(nums: number[]): number {
  if (nums.length === 0) return 0

  let best = nums[0]
  let current = nums[0]

  for (let i = 1; i < nums.length; i++) {
    current = Math.max(nums[i], current + nums[i])
    best = Math.max(best, current)
  }

  return best
}
`,
      solutionNotes: `Алгоритм Кадане строится на одном наблюдении: если сумма накопленного слева
подмассива стала отрицательной, тащить её дальше бессмысленно — выгоднее начать
заново с текущего элемента. Именно это и делает \`Math.max(nums[i], current + nums[i])\`.

Две переменные разделяют «лучший подмассив, кончающийся здесь» (\`current\`) и
«лучший подмассив вообще» (\`best\`). Путать их нельзя: \`current\` может падать,
\`best\` — только расти.

Начинать с нуля (\`best = 0\`) — классическая ошибка. На массиве целиком из
отрицательных чисел это дало бы 0, а правильный ответ — максимальный элемент.
Поэтому обе переменные инициализируются первым элементом.

Сложность — O(n) времени, O(1) памяти.`,
      hints: [
        'На каждом шаге выбирайте: продолжить накопленный подмассив или начать новый.',
        'Держите две величины: лучшую сумму, кончающуюся здесь, и лучшую вообще.',
        'Не начинайте с нуля — иначе массив из одних отрицательных чисел даст неверный ответ.',
      ],
      cases: [
        { name: 'пример из условия', args: [[-2, 1, -3, 4, -1, 2, 1, -5, 4]], expected: 6 },
        { name: 'один отрицательный', args: [[-1]], expected: -1 },
        { name: 'все положительные', args: [[5, 4, -1, 7, 8]], expected: 23 },
        { name: 'все отрицательные', args: [[-3, -1, -2]], expected: -1 },
        { name: 'один элемент', args: [[42]], expected: 42, hidden: true },
        { name: 'нули и отрицательные', args: [[-2, 0, -1]], expected: 0, hidden: true },
      ],
    },

    {
      slug: 'merge-intervals',
      title: 'Merge Intervals',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['js', 'ts'],
      entryName: 'mergeIntervals',
      tags: ['leetcode', 'arrays'],
      companies: ['yandex', 'ozon', 'faang'],
      leetcodeNumber: 56,
      sourceUrl: 'https://leetcode.com/problems/merge-intervals/',
      descriptionMd: `Дан массив интервалов \`[начало, конец]\`. Объедините все пересекающиеся интервалы
и верните результат.

Интервалы, касающиеся концами (\`[1, 4]\` и \`[4, 5]\`), считаются пересекающимися.

\`\`\`js
mergeIntervals([[1, 3], [2, 6], [8, 10], [15, 18]])
// [[1, 6], [8, 10], [15, 18]]

mergeIntervals([[1, 4], [4, 5]])
// [[1, 5]]
\`\`\`

Исходный массив не меняется. Задача регулярно встречается в Яндексе и Озоне.`,
      starterCode: `function mergeIntervals(intervals) {
  // Ваш код здесь
}
`,
      starterCodeTs: `function mergeIntervals(intervals: number[][]): number[][] {
  // Ваш код здесь
}
`,
      solutionCode: `function mergeIntervals(intervals) {
  if (intervals.length === 0) return []

  // Сортировка по началу — то, что делает задачу линейной после сортировки:
  // пересекаться может только соседний интервал.
  const sorted = intervals.slice().sort((a, b) => a[0] - b[0])
  const result = [sorted[0].slice()]

  for (let i = 1; i < sorted.length; i++) {
    const last = result[result.length - 1]
    const [start, end] = sorted[i]

    if (start <= last[1]) {
      // Пересечение: расширяем конец, но только если новый конец дальше —
      // текущий интервал может целиком лежать внутри предыдущего.
      last[1] = Math.max(last[1], end)
    } else {
      result.push([start, end])
    }
  }

  return result
}
`,
      solutionCodeTs: `function mergeIntervals(intervals: number[][]): number[][] {
  if (intervals.length === 0) return []

  const sorted = intervals.slice().sort((a, b) => a[0] - b[0])
  const result: number[][] = [sorted[0].slice()]

  for (let i = 1; i < sorted.length; i++) {
    const last = result[result.length - 1]
    const [start, end] = sorted[i]

    if (start <= last[1]) {
      last[1] = Math.max(last[1], end)
    } else {
      result.push([start, end])
    }
  }

  return result
}
`,
      solutionNotes: `Сортировка по началу — ключ ко всей задаче. После неё достаточно сравнивать
каждый интервал с последним добавленным: если он не пересекается с ним, то не
пересекается и ни с одним из предыдущих.

\`Math.max(last[1], end)\` обязателен. Интервал может целиком лежать внутри
предыдущего (\`[1, 10]\` и \`[2, 3]\`) — простое присваивание \`last[1] = end\`
сузило бы уже объединённый интервал.

Условие \`start <= last[1]\` (нестрогое) объединяет касающиеся интервалы. Со
строгим \`<\` \`[1, 4]\` и \`[4, 5]\` остались бы раздельными — уточняйте это на
собеседовании, требование зависит от постановки.

Копии \`slice()\` защищают исходные данные: без них сортировка переставила бы
элементы во входном массиве, а расширение конца испортило бы входные интервалы.

Сложность — O(n log n), целиком за счёт сортировки.`,
      hints: [
        'Отсортируйте по началу интервала — тогда пересекаться может только соседний.',
        'При пересечении берите максимум концов, а не конец текущего интервала.',
        'Скопируйте массив перед сортировкой, чтобы не портить входные данные.',
      ],
      cases: [
        { name: 'пример из условия', args: [[[1, 3], [2, 6], [8, 10], [15, 18]]], expected: [[1, 6], [8, 10], [15, 18]] },
        { name: 'касаются концами', args: [[[1, 4], [4, 5]]], expected: [[1, 5]] },
        { name: 'не пересекаются', args: [[[1, 2], [3, 4]]], expected: [[1, 2], [3, 4]] },
        { name: 'вложенный интервал', args: [[[1, 10], [2, 3]]], expected: [[1, 10]] },
        { name: 'не отсортированы', args: [[[8, 10], [1, 3], [2, 6]]], expected: [[1, 6], [8, 10]] },
        { name: 'пустой массив', args: [[]], expected: [] },
        { name: 'один интервал', args: [[[1, 5]]], expected: [[1, 5]], hidden: true },
        { name: 'все сливаются в один', args: [[[1, 4], [2, 5], [3, 6]]], expected: [[1, 6]], hidden: true },
      ],
      testCode: `test('исходный массив не меняется', function () {
  const source = [[3, 4], [1, 2]]
  mergeIntervals(source)
  expect(source).toEqual([[3, 4], [1, 2]])
})`,
    },

    {
      slug: 'group-anagrams',
      title: 'Group Anagrams',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'groupAnagrams',
      tags: ['leetcode', 'strings'],
      companies: ['ozon', 'faang'],
      leetcodeNumber: 49,
      sourceUrl: 'https://leetcode.com/problems/group-anagrams/',
      descriptionMd: `Сгруппируйте слова, являющиеся анаграммами друг друга.

Возвращается массив групп. Порядок групп — порядок появления первого слова
каждой группы; порядок слов внутри группы — исходный.

\`\`\`js
groupAnagrams(['eat', 'tea', 'tan', 'ate', 'nat', 'bat'])
// [['eat', 'tea', 'ate'], ['tan', 'nat'], ['bat']]
\`\`\`

Попарное сравнение всех слов даёт O(n²·k). Нужно быстрее.`,
      starterCode: `function groupAnagrams(words) {
  // Ваш код здесь
}
`,
      solutionCode: `function groupAnagrams(words) {
  // Ключ группы — отсортированные буквы слова: у анаграмм он совпадает.
  const groups = new Map()

  for (const word of words) {
    const key = [...word].sort().join('')

    if (!groups.has(key)) groups.set(key, [])
    groups.get(key).push(word)
  }

  return [...groups.values()]
}
`,
      solutionNotes: `Идея — канонический ключ: у анаграмм одинаковый мультимножество букв, значит
одинаковый отсортированный вид. Достаточно сгруппировать по нему за один проход.

Сложность — O(n · k log k), где k — длина слова: сортировка каждого слова. Можно
довести до O(n · k), если вместо сортировки строить ключ из счётчиков букв —
для длинных слов это заметно быстрее, но код получается длиннее.

\`Map\` сохраняет порядок вставки, поэтому порядок групп совпадает с порядком
первого появления слова каждой группы. С обычным объектом такой гарантии нет.

\`[...word]\` вместо \`word.split('')\` корректно обрабатывает суррогатные пары.`,
      hints: [
        'Отсортированные буквы слова — одинаковый ключ у всех анаграмм.',
        'Map сохранит порядок групп по первому появлению.',
        'Быстрее сортировки — ключ из счётчиков букв.',
      ],
      cases: [
        {
          name: 'пример из условия',
          args: [['eat', 'tea', 'tan', 'ate', 'nat', 'bat']],
          expected: [['eat', 'tea', 'ate'], ['tan', 'nat'], ['bat']],
        },
        { name: 'пустой массив', args: [[]], expected: [] },
        { name: 'одно слово', args: [['a']], expected: [['a']] },
        { name: 'пустые строки', args: [['', '']], expected: [['', '']], hidden: true },
        { name: 'анаграмм нет', args: [['abc', 'def']], expected: [['abc'], ['def']], hidden: true },
      ],
      testCode: `test('порядок внутри группы сохраняется', function () {
  expect(groupAnagrams(['ba', 'ab', 'ab'])).toEqual([['ba', 'ab', 'ab']])
})

test('большой набор слов', function () {
  const words = []
  for (let i = 0; i < 500; i++) words.push('abc', 'cba', 'xyz')

  const result = groupAnagrams(words)
  expect(result).toHaveLength(2)
  expect(result[0]).toHaveLength(1000)
  expect(result[1]).toHaveLength(500)
})`,
    },

    {
      slug: 'product-except-self',
      title: 'Product of Array Except Self',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['js', 'ts'],
      entryName: 'productExceptSelf',
      tags: ['leetcode', 'arrays'],
      companies: ['faang', 'tbank'],
      leetcodeNumber: 238,
      sourceUrl: 'https://leetcode.com/problems/product-except-self/',
      descriptionMd: `Верните массив, в котором \`result[i]\` — произведение всех элементов исходного
массива, **кроме** \`nums[i]\`.

\`\`\`js
productExceptSelf([1, 2, 3, 4])   // [24, 12, 8, 6]
productExceptSelf([-1, 1, 0, -3, 3]) // [0, 0, 9, 0, 0]
\`\`\`

Условия задачи:

- **деление использовать нельзя** (иначе ноль в массиве всё ломает);
- сложность O(n);
- дополнительная память O(1) — выходной массив не считается.`,
      starterCode: `function productExceptSelf(nums) {
  // Ваш код здесь
}
`,
      starterCodeTs: `function productExceptSelf(nums: number[]): number[] {
  // Ваш код здесь
}
`,
      solutionCode: `function productExceptSelf(nums) {
  const result = new Array(nums.length)

  // Первый проход: в result[i] кладём произведение всего, что слева от i.
  let prefix = 1
  for (let i = 0; i < nums.length; i++) {
    result[i] = prefix
    prefix *= nums[i]
  }

  // Второй проход справа: домножаем на произведение всего, что справа.
  // Суффикс хранится в переменной, поэтому лишней памяти не нужно.
  let suffix = 1
  for (let i = nums.length - 1; i >= 0; i--) {
    result[i] *= suffix
    suffix *= nums[i]
  }

  return result
}
`,
      solutionCodeTs: `function productExceptSelf(nums: number[]): number[] {
  const result = new Array<number>(nums.length)

  let prefix = 1
  for (let i = 0; i < nums.length; i++) {
    result[i] = prefix
    prefix *= nums[i]
  }

  let suffix = 1
  for (let i = nums.length - 1; i >= 0; i--) {
    result[i] *= suffix
    suffix *= nums[i]
  }

  return result
}
`,
      solutionNotes: `Произведение всех элементов кроме \`i\` — это произведение всего слева от \`i\`,
умноженное на произведение всего справа. Два прохода вычисляют обе половины.

Хитрость в том, что второй проход не требует отдельного массива суффиксов:
накопитель \`suffix\` хранит ровно то, что нужно текущей позиции, и обновляется
после использования. Поэтому дополнительная память — O(1).

Порядок внутри цикла критичен. В первом проходе \`result[i] = prefix\` идёт **до**
\`prefix *= nums[i]\` — иначе в произведение попал бы сам элемент \`i\`. Во втором
то же самое для суффикса.

Запрет деления в условии не формальность: решение «общее произведение поделить
на элемент» ломается на нуле (деление на ноль) и на двух нулях (там весь
результат нулевой). Префиксно-суффиксная схема обрабатывает нули сама собой.`,
      hints: [
        'Результат для i — это произведение всего слева на произведение всего справа.',
        'Первый проход слева пишет префиксы прямо в результат.',
        'Второй проход справа домножает, а суффикс держите в одной переменной.',
      ],
      cases: [
        { name: 'пример из условия', args: [[1, 2, 3, 4]], expected: [24, 12, 8, 6] },
        { name: 'с нулём', args: [[-1, 1, 0, -3, 3]], expected: [0, 0, 9, 0, 0] },
        { name: 'два нуля', args: [[0, 0, 1]], expected: [0, 0, 0] },
        { name: 'два элемента', args: [[2, 3]], expected: [3, 2] },
        { name: 'отрицательные', args: [[-1, -2, -3]], expected: [6, 3, 2], hidden: true },
        { name: 'единицы', args: [[1, 1, 1]], expected: [1, 1, 1], hidden: true },
      ],
    },

    {
      slug: 'three-sum',
      title: '3Sum',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'threeSum',
      tags: ['leetcode', 'arrays'],
      companies: ['yandex', 'faang'],
      leetcodeNumber: 15,
      sourceUrl: 'https://leetcode.com/problems/3sum/',
      descriptionMd: `Найдите все **уникальные** тройки чисел из массива, сумма которых равна нулю.

- тройки не должны повторяться;
- внутри тройки числа идут по возрастанию;
- тройки в результате отсортированы по возрастанию.

\`\`\`js
threeSum([-1, 0, 1, 2, -1, -4])
// [[-1, -1, 2], [-1, 0, 1]]

threeSum([0, 0, 0, 0])
// [[0, 0, 0]]
\`\`\`

Тройной цикл даёт O(n³). Нужно O(n²).`,
      starterCode: `function threeSum(nums) {
  // Ваш код здесь
}
`,
      solutionCode: `function threeSum(nums) {
  // После сортировки дубликаты стоят рядом, и их легко пропускать,
  // а внутренний поиск сводится к двум указателям.
  const sorted = nums.slice().sort((a, b) => a - b)
  const result = []

  for (let i = 0; i < sorted.length - 2; i++) {
    // Отсортированный массив: если первый элемент уже положительный,
    // сумма трёх нулём быть не может.
    if (sorted[i] > 0) break
    // Пропускаем повтор первого элемента тройки.
    if (i > 0 && sorted[i] === sorted[i - 1]) continue

    let left = i + 1
    let right = sorted.length - 1

    while (left < right) {
      const sum = sorted[i] + sorted[left] + sorted[right]

      if (sum < 0) {
        left += 1
      } else if (sum > 0) {
        right -= 1
      } else {
        result.push([sorted[i], sorted[left], sorted[right]])

        // Сдвигаем обе границы за дубликаты найденной тройки.
        while (left < right && sorted[left] === sorted[left + 1]) left += 1
        while (left < right && sorted[right] === sorted[right - 1]) right -= 1

        left += 1
        right -= 1
      }
    }
  }

  return result
}
`,
      solutionNotes: `Сортировка решает сразу три задачи: позволяет использовать два указателя,
ставит дубликаты рядом и даёт условие раннего выхода.

Уникальность обеспечивается в трёх местах, и пропуск любого из них ломает
ответ. Первый элемент: \`sorted[i] === sorted[i - 1]\` — пропускаем повтор.
Второй и третий: после найденной тройки прокручиваем оба указателя за
одинаковые значения. Без этого \`[0, 0, 0, 0]\` вернёт четыре одинаковые тройки.

Использовать \`Set\` со строковыми ключами вместо аккуратного пропуска — рабочий,
но расточительный приём: лишняя память и сериализация каждой тройки.

Досрочный выход по \`sorted[i] > 0\` не влияет на асимптотику, но на реальных
данных экономит заметную часть работы.

Сложность — O(n²): внешний цикл по n, внутри два указателя проходят остаток за
линейное время.`,
      hints: [
        'Отсортируйте массив: это даст и два указателя, и соседство дубликатов.',
        'Пропускайте повторы первого элемента тройки.',
        'После найденной тройки сдвиньте оба указателя за одинаковые значения.',
      ],
      cases: [
        { name: 'пример из условия', args: [[-1, 0, 1, 2, -1, -4]], expected: [[-1, -1, 2], [-1, 0, 1]] },
        { name: 'все нули', args: [[0, 0, 0, 0]], expected: [[0, 0, 0]] },
        { name: 'решений нет', args: [[1, 2, 3]], expected: [] },
        { name: 'мало элементов', args: [[0, 1]], expected: [] },
        { name: 'пустой массив', args: [[]], expected: [] },
        { name: 'много дубликатов', args: [[-2, 0, 0, 2, 2]], expected: [[-2, 0, 2]], hidden: true },
      ],
      testCode: `test('исходный массив не меняется', function () {
  const source = [-1, 0, 1]
  threeSum(source)
  expect(source).toEqual([-1, 0, 1])
})`,
    },

    {
      slug: 'container-with-most-water',
      title: 'Container With Most Water',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['js', 'ts'],
      entryName: 'maxArea',
      tags: ['leetcode', 'arrays'],
      companies: ['faang'],
      leetcodeNumber: 11,
      sourceUrl: 'https://leetcode.com/problems/container-with-most-water/',
      descriptionMd: `Дан массив высот \`height\`. Каждый элемент — вертикальная линия. Выберите две
линии, которые вместе с осью X образуют контейнер наибольшей площади.

Площадь — это расстояние между линиями, умноженное на **меньшую** из двух высот.

\`\`\`js
maxArea([1, 8, 6, 2, 5, 4, 8, 3, 7]) // 49
maxArea([1, 1])                       // 1
\`\`\`

Перебор всех пар даёт O(n²). Нужно O(n).`,
      starterCode: `function maxArea(height) {
  // Ваш код здесь
}
`,
      starterCodeTs: `function maxArea(height: number[]): number {
  // Ваш код здесь
}
`,
      solutionCode: `function maxArea(height) {
  let left = 0
  let right = height.length - 1
  let best = 0

  while (left < right) {
    const area = (right - left) * Math.min(height[left], height[right])
    best = Math.max(best, area)

    // Двигаем меньшую линию: она ограничивает высоту, и сдвиг большей
    // только уменьшит ширину, не увеличив высоту.
    if (height[left] < height[right]) left += 1
    else right -= 1
  }

  return best
}
`,
      solutionCodeTs: `function maxArea(height: number[]): number {
  let left = 0
  let right = height.length - 1
  let best = 0

  while (left < right) {
    const area = (right - left) * Math.min(height[left], height[right])
    best = Math.max(best, area)

    if (height[left] < height[right]) left += 1
    else right -= 1
  }

  return best
}
`,
      solutionNotes: `Указатели ставятся на края — так ширина максимальна. Дальше вопрос только в
том, какой из них двигать.

Ответ: тот, что ниже. Высота контейнера определяется меньшей линией, поэтому
сдвиг более высокой гарантированно уменьшит ширину и не увеличит высоту — такая
пара заведомо не лучше текущей. А сдвиг меньшей линии оставляет шанс найти
более высокую и отыграть потерю в ширине.

Это и есть доказательство корректности: мы отбрасываем только те пары, которые
точно не лучше уже рассмотренной.

Сложность — O(n): указатели суммарно проходят массив один раз.`,
      hints: [
        'Начните с краёв: ширина там максимальна.',
        'Двигайте указатель с меньшей высотой — сдвиг большей точно не улучшит результат.',
      ],
      cases: [
        { name: 'пример из условия', args: [[1, 8, 6, 2, 5, 4, 8, 3, 7]], expected: 49 },
        { name: 'две линии', args: [[1, 1]], expected: 1 },
        { name: 'возрастающие', args: [[1, 2, 3, 4]], expected: 4 },
        { name: 'убывающие', args: [[4, 3, 2, 1]], expected: 4 },
        { name: 'одна линия', args: [[5]], expected: 0, hidden: true },
        { name: 'пустой массив', args: [[]], expected: 0, hidden: true },
      ],
    },

    {
      slug: 'generate-parentheses',
      title: 'Generate Parentheses',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['js', 'ts'],
      entryName: 'generateParenthesis',
      tags: ['leetcode', 'recursion'],
      companies: ['faang'],
      leetcodeNumber: 22,
      sourceUrl: 'https://leetcode.com/problems/generate-parentheses/',
      descriptionMd: `Сгенерируйте все корректные комбинации из \`n\` пар скобок.

\`\`\`js
generateParenthesis(3)
// ['((()))', '(()())', '(())()', '()(())', '()()()']

generateParenthesis(1) // ['()']
generateParenthesis(0) // ['']
\`\`\`

Порядок — лексикографический, как при обходе в глубину, где открывающая скобка
пробуется раньше закрывающей.

Генерировать все строки подряд и фильтровать нельзя: это 2^(2n) вариантов.`,
      starterCode: `function generateParenthesis(n) {
  // Ваш код здесь
}
`,
      starterCodeTs: `function generateParenthesis(n: number): string[] {
  // Ваш код здесь
}
`,
      solutionCode: `function generateParenthesis(n) {
  const result = []

  function build(current, open, close) {
    if (current.length === n * 2) {
      result.push(current)
      return
    }

    // Открывающую можно ставить, пока не исчерпан лимит.
    if (open < n) build(current + '(', open + 1, close)
    // Закрывающую — только если есть незакрытая открывающая.
    // Это и отсекает все некорректные ветки на корню.
    if (close < open) build(current + ')', open, close + 1)
  }

  build('', 0, 0)
  return result
}
`,
      solutionCodeTs: `function generateParenthesis(n: number): string[] {
  const result: string[] = []

  function build(current: string, open: number, close: number): void {
    if (current.length === n * 2) {
      result.push(current)
      return
    }

    if (open < n) build(current + '(', open + 1, close)
    if (close < open) build(current + ')', open, close + 1)
  }

  build('', 0, 0)
  return result
}
`,
      solutionNotes: `Это поиск с возвратом, где некорректные ветки отсекаются до того, как в них
зайти. Два инварианта: открывающих не больше \`n\`, закрывающих не больше, чем уже
поставлено открывающих. Любая строка, построенная по этим правилам, корректна по
построению — проверять её отдельно не нужно.

Порядок рекурсивных вызовов задаёт порядок результата: сначала пробуем
открывающую скобку, поэтому первым получается самый «глубокий» вариант
\`((()))\`.

Количество результатов — n-е число Каталана: для \`n = 3\` это 5, для \`n = 10\` —
16796. Перебор всех 2^(2n) строк с фильтрацией для \`n = 10\` перебрал бы миллиард
вариантов вместо шестнадцати тысяч.

Строки склеиваются конкатенацией; вариант с массивом символов и откатом экономит
память, но для таких размеров разница незаметна.`,
      hints: [
        'Стройте строку рекурсивно, отсекая некорректные ветки сразу.',
        'Открывающую ставьте, пока их меньше n; закрывающую — пока их меньше, чем открывающих.',
        'Сначала пробуйте открывающую — это даст нужный порядок результата.',
      ],
      cases: [
        { name: 'три пары', args: [3], expected: ['((()))', '(()())', '(())()', '()(())', '()()()'] },
        { name: 'одна пара', args: [1], expected: ['()'] },
        { name: 'ноль пар', args: [0], expected: [''] },
        { name: 'две пары', args: [2], expected: ['(())', '()()'], hidden: true },
      ],
      testCode: `test('количество равно числу Каталана', function () {
  expect(generateParenthesis(4)).toHaveLength(14)
  expect(generateParenthesis(5)).toHaveLength(42)
})

test('все комбинации корректны', function () {
  for (const combination of generateParenthesis(5)) {
    let balance = 0
    for (const char of combination) {
      balance += char === '(' ? 1 : -1
      expect(balance >= 0).toBe(true)
    }
    expect(balance).toBe(0)
  }
})`,
    },

    {
      slug: 'level-order-traversal',
      title: 'Binary Tree Level Order Traversal',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'levelOrder',
      tags: ['leetcode', 'data-structures'],
      companies: ['ozon', 'faang'],
      leetcodeNumber: 102,
      sourceUrl: 'https://leetcode.com/problems/binary-tree-level-order-traversal/',
      descriptionMd: `Дано бинарное дерево — узлы вида \`{ value, left, right }\`.

Верните значения по уровням: массив массивов, где каждый вложенный массив —
один уровень дерева, слева направо.

\`\`\`js
levelOrder({
  value: 3,
  left: { value: 9, left: null, right: null },
  right: { value: 20, left: { value: 15 }, right: { value: 7 } },
})
// [[3], [9, 20], [15, 7]]

levelOrder(null) // []
\`\`\``,
      starterCode: `function levelOrder(root) {
  // Ваш код здесь
}
`,
      solutionCode: `function levelOrder(root) {
  if (root === null || root === undefined) return []

  const result = []
  let level = [root]

  while (level.length > 0) {
    const values = []
    const next = []

    for (const node of level) {
      values.push(node.value)
      if (node.left) next.push(node.left)
      if (node.right) next.push(node.right)
    }

    result.push(values)
    level = next
  }

  return result
}
`,
      solutionNotes: `Вариант с массивом уровней читается яснее классического обхода в ширину с одной
очередью: границы уровня заданы самой структурой цикла, а не подсчётом
\`queue.length\` перед обработкой.

Классический вариант с одной очередью экономит немного памяти, но требует
запомнить длину очереди до начала обработки уровня — и именно там чаще всего
ошибаются, читая длину уже после добавления детей.

Проверки \`if (node.left)\` пропускают и \`null\`, и \`undefined\`, поэтому узлы в
тестах можно задавать без явных пустых полей.

Сложность — O(n) по времени, O(ширина) по памяти.`,
      hints: [
        'Держите текущий уровень массивом и стройте следующий во время обхода.',
        'Классический вариант с одной очередью требует запомнить её длину ДО добавления детей.',
      ],
      setupCode: `function node(value, left, right) {
  return { value: value, left: left || null, right: right || null }
}
`,
      testCode: `test('пример из условия', function () {
  const tree = node(3, node(9), node(20, node(15), node(7)))
  expect(levelOrder(tree)).toEqual([[3], [9, 20], [15, 7]])
})

test('пустое дерево', function () {
  expect(levelOrder(null)).toEqual([])
})

test('один узел', function () {
  expect(levelOrder(node(1))).toEqual([[1]])
})

test('перекошенное дерево', function () {
  const tree = node(1, node(2, node(3)), null)
  expect(levelOrder(tree)).toEqual([[1], [2], [3]])
})

test('порядок внутри уровня слева направо', function () {
  const tree = node(1, node(2, node(4), node(5)), node(3, node(6), node(7)))
  expect(levelOrder(tree)).toEqual([[1], [2, 3], [4, 5, 6, 7]])
})

test('широкое дерево', function () {
  let leaves = []
  for (let i = 0; i < 8; i++) leaves.push(node(i))

  while (leaves.length > 1) {
    const next = []
    for (let i = 0; i < leaves.length; i += 2) next.push(node(-1, leaves[i], leaves[i + 1]))
    leaves = next
  }

  const result = levelOrder(leaves[0])
  expect(result).toHaveLength(4)
  expect(result[3]).toEqual([0, 1, 2, 3, 4, 5, 6, 7])
})`,
    },

    {
      slug: 'unique-paths',
      title: 'Unique Paths',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['js', 'ts'],
      entryName: 'uniquePaths',
      tags: ['leetcode', 'algorithms'],
      companies: ['faang'],
      leetcodeNumber: 62,
      sourceUrl: 'https://leetcode.com/problems/unique-paths/',
      descriptionMd: `Робот стоит в левом верхнем углу сетки \`m × n\` и может двигаться только вправо
или вниз. Сколько существует уникальных путей до правого нижнего угла?

\`\`\`js
uniquePaths(3, 7) // 28
uniquePaths(3, 2) // 3
uniquePaths(1, 1) // 1
\`\`\`

Наивная рекурсия имеет экспоненциальную сложность. Решение должно мгновенно
считать \`uniquePaths(23, 12)\`.`,
      starterCode: `function uniquePaths(m, n) {
  // Ваш код здесь
}
`,
      starterCodeTs: `function uniquePaths(m: number, n: number): number {
  // Ваш код здесь
}
`,
      solutionCode: `function uniquePaths(m, n) {
  if (m < 1 || n < 1) return 0

  // Достаточно одной строки: значение сверху — это то, что лежало
  // в этой же ячейке на предыдущей итерации.
  const row = new Array(n).fill(1)

  for (let i = 1; i < m; i++) {
    for (let j = 1; j < n; j++) {
      row[j] += row[j - 1]
    }
  }

  return row[n - 1]
}
`,
      solutionCodeTs: `function uniquePaths(m: number, n: number): number {
  if (m < 1 || n < 1) return 0

  const row = new Array<number>(n).fill(1)

  for (let i = 1; i < m; i++) {
    for (let j = 1; j < n; j++) {
      row[j] += row[j - 1]
    }
  }

  return row[n - 1]
}
`,
      solutionNotes: `В каждую клетку можно попасть только сверху или слева, поэтому число путей до
неё равно сумме путей до этих двух соседей. Первая строка и первый столбец
заполнены единицами: туда ведёт ровно один путь.

Вся таблица не нужна — хватает одной строки. К моменту обработки \`row[j]\` там
ещё лежит значение с предыдущей строки (путь сверху), а \`row[j - 1]\` уже
обновлён (путь слева). Строка \`row[j] += row[j - 1]\` выражает это одним
присваиванием. Память — O(n) вместо O(m·n).

Задача имеет и комбинаторное решение: это число сочетаний C(m+n−2, m−1) —
из всех ходов нужно выбрать, какие будут вниз. Оно считается за O(min(m, n)),
но требует аккуратности с переполнением при вычислении факториалов.

Сложность динамического решения — O(m·n) времени.`,
      hints: [
        'Число путей до клетки — сумма путей сверху и слева.',
        'Хватает одной строки: значение до обновления — это путь сверху.',
        'Есть и комбинаторное решение через число сочетаний.',
      ],
      cases: [
        { name: 'пример из условия', args: [3, 7], expected: 28 },
        { name: 'узкая сетка', args: [3, 2], expected: 3 },
        { name: 'одна клетка', args: [1, 1], expected: 1 },
        { name: 'одна строка', args: [1, 10], expected: 1 },
        { name: 'квадрат', args: [3, 3], expected: 6, hidden: true },
        { name: 'большая сетка', args: [23, 12], expected: 193536720, hidden: true },
      ],
    },
  ],
}
