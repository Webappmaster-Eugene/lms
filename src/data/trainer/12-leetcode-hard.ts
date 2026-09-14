import type { TrainerTopicSeed } from './types'

/**
 * Тема 12. LeetCode Hard.
 *
 * На фронтенде встречаются редко, но встречаются — обычно как последняя задача
 * на финальном этапе в FAANG. Ценность здесь не в ответе, а в умении дойти до
 * него рассуждением от наивного решения.
 */
export const leetcodeHard: TrainerTopicSeed = {
  slug: 'leetcode-hard',
  title: 'LeetCode: Hard',
  description: 'Trapping Rain Water, медиана двух массивов, N ферзей',
  category: 'leetcode',
  icon: '🔴',
  order: 12,
  tasks: [
    {
      slug: 'trapping-rain-water',
      title: 'Trapping Rain Water',
      difficulty: 'hard',
      checkMode: 'unit',
      languages: ['js', 'ts'],
      entryName: 'trap',
      tags: ['leetcode', 'arrays'],
      companies: ['yandex', 'faang'],
      leetcodeNumber: 42,
      sourceUrl: 'https://leetcode.com/problems/trapping-rain-water/',
      descriptionMd: `Дан массив высот столбиков. Посчитайте, сколько воды задержится между ними
после дождя.

\`\`\`js
trap([0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1]) // 6
trap([4, 2, 0, 3, 2, 5])                    // 9
\`\`\`

Над столбиком \`i\` задерживается столько воды, сколько позволяет меньшая из двух
величин: максимальная высота слева и максимальная высота справа.

Решение должно работать за O(n) времени и O(1) дополнительной памяти.`,
      starterCode: `function trap(height) {
  // Ваш код здесь
}
`,
      starterCodeTs: `function trap(height: number[]): number {
  // Ваш код здесь
}
`,
      solutionCode: `function trap(height) {
  let left = 0
  let right = height.length - 1
  let leftMax = 0
  let rightMax = 0
  let water = 0

  while (left < right) {
    // Работаем с той стороны, где столбик ниже: там максимум
    // противоположной стороны заведомо не меньше, значит воду
    // над текущим столбиком ограничивает именно наша сторона.
    if (height[left] < height[right]) {
      leftMax = Math.max(leftMax, height[left])
      water += leftMax - height[left]
      left += 1
    } else {
      rightMax = Math.max(rightMax, height[right])
      water += rightMax - height[right]
      right -= 1
    }
  }

  return water
}
`,
      solutionCodeTs: `function trap(height: number[]): number {
  let left = 0
  let right = height.length - 1
  let leftMax = 0
  let rightMax = 0
  let water = 0

  while (left < right) {
    if (height[left] < height[right]) {
      leftMax = Math.max(leftMax, height[left])
      water += leftMax - height[left]
      left += 1
    } else {
      rightMax = Math.max(rightMax, height[right])
      water += rightMax - height[right]
      right -= 1
    }
  }

  return water
}
`,
      solutionNotes: `Естественный путь к решению — через три шага.

**Наивно:** для каждого столбика искать максимум слева и справа. O(n²).

**Предподсчёт:** заранее построить два массива максимумов. O(n) времени, но O(n)
памяти.

**Два указателя:** заметить, что полные максимумы не нужны. Если
\`height[left] < height[right]\`, то справа точно найдётся столбик не ниже
\`height[right]\`, значит \`rightMax >= height[right] > height[left]\`. Воду над
левым столбиком ограничивает \`leftMax\`, и его мы уже знаем. Симметрично для
правой стороны.

Именно это рассуждение и хотят услышать: почему достаточно частичных максимумов.

Вычитание \`leftMax - height[left]\` не бывает отрицательным: максимум уже
обновлён текущим столбиком.`,
      hints: [
        'Вода над столбиком — это min(максимум слева, максимум справа) минус его высота.',
        'Начните с решения через два массива максимумов, потом уберите их.',
        'Двигайте указатель с той стороны, где столбик ниже.',
      ],
      cases: [
        { name: 'пример из условия', args: [[0, 1, 0, 2, 1, 0, 1, 3, 2, 1, 2, 1]], expected: 6 },
        { name: 'глубокая яма', args: [[4, 2, 0, 3, 2, 5]], expected: 9 },
        { name: 'воды нет', args: [[1, 2, 3]], expected: 0 },
        { name: 'убывающие', args: [[3, 2, 1]], expected: 0 },
        { name: 'пустой массив', args: [[]], expected: 0 },
        { name: 'простая яма', args: [[3, 0, 3]], expected: 3, hidden: true },
        { name: 'ровная поверхность', args: [[2, 2, 2]], expected: 0, hidden: true },
        { name: 'две ямы', args: [[5, 0, 5, 0, 5]], expected: 10, hidden: true },
      ],
    },

    {
      slug: 'median-two-sorted-arrays',
      title: 'Median of Two Sorted Arrays',
      difficulty: 'hard',
      checkMode: 'unit',
      languages: ['js', 'ts'],
      entryName: 'findMedianSortedArrays',
      tags: ['leetcode', 'arrays'],
      companies: ['faang'],
      leetcodeNumber: 4,
      sourceUrl: 'https://leetcode.com/problems/median-of-two-sorted-arrays/',
      descriptionMd: `Даны два отсортированных массива. Найдите медиану их объединения.

\`\`\`js
findMedianSortedArrays([1, 3], [2])    // 2
findMedianSortedArrays([1, 2], [3, 4]) // 2.5
\`\`\`

Слияние массивов даёт O(n + m). **Требуется O(log(min(n, m)))** — это и есть
сложность задачи.

Хотя бы один массив непустой.`,
      starterCode: `function findMedianSortedArrays(first, second) {
  // Ваш код здесь
}
`,
      starterCodeTs: `function findMedianSortedArrays(first: number[], second: number[]): number {
  // Ваш код здесь
}
`,
      solutionCode: `function findMedianSortedArrays(first, second) {
  // Бинарный поиск идёт по короткому массиву: так сложность
  // получается O(log(min(n, m))).
  if (first.length > second.length) return findMedianSortedArrays(second, first)

  const shortLength = first.length
  const longLength = second.length
  const half = Math.floor((shortLength + longLength + 1) / 2)

  let low = 0
  let high = shortLength

  while (low <= high) {
    // Ищем разрез: сколько элементов короткого массива уходит в левую половину.
    const cutShort = Math.floor((low + high) / 2)
    const cutLong = half - cutShort

    const leftShort = cutShort === 0 ? -Infinity : first[cutShort - 1]
    const rightShort = cutShort === shortLength ? Infinity : first[cutShort]
    const leftLong = cutLong === 0 ? -Infinity : second[cutLong - 1]
    const rightLong = cutLong === longLength ? Infinity : second[cutLong]

    if (leftShort <= rightLong && leftLong <= rightShort) {
      // Разрез корректен: слева всё не больше, чем справа.
      const totalLength = shortLength + longLength

      if (totalLength % 2 === 1) return Math.max(leftShort, leftLong)

      return (Math.max(leftShort, leftLong) + Math.min(rightShort, rightLong)) / 2
    }

    if (leftShort > rightLong) high = cutShort - 1
    else low = cutShort + 1
  }

  return 0
}
`,
      solutionCodeTs: `function findMedianSortedArrays(first: number[], second: number[]): number {
  if (first.length > second.length) return findMedianSortedArrays(second, first)

  const shortLength = first.length
  const longLength = second.length
  const half = Math.floor((shortLength + longLength + 1) / 2)

  let low = 0
  let high = shortLength

  while (low <= high) {
    const cutShort = Math.floor((low + high) / 2)
    const cutLong = half - cutShort

    const leftShort = cutShort === 0 ? -Infinity : first[cutShort - 1]
    const rightShort = cutShort === shortLength ? Infinity : first[cutShort]
    const leftLong = cutLong === 0 ? -Infinity : second[cutLong - 1]
    const rightLong = cutLong === longLength ? Infinity : second[cutLong]

    if (leftShort <= rightLong && leftLong <= rightShort) {
      const totalLength = shortLength + longLength

      if (totalLength % 2 === 1) return Math.max(leftShort, leftLong)

      return (Math.max(leftShort, leftLong) + Math.min(rightShort, rightLong)) / 2
    }

    if (leftShort > rightLong) high = cutShort - 1
    else low = cutShort + 1
  }

  return 0
}
`,
      solutionNotes: `Задача не про поиск элемента, а про поиск **разреза**. Нужно разделить оба
массива так, чтобы слева оказалась ровно половина всех элементов и при этом
любой элемент слева был не больше любого справа. Тогда медиана собирается из
четырёх граничных значений.

Разрез в длинном массиве однозначно определяется разрезом в коротком:
\`cutLong = half - cutShort\`. Поэтому подбирать нужно только одно число —
и это делается бинарным поиском за O(log(min(n, m))).

\`±Infinity\` на границах убирает все частные случаи с пустыми половинами: разрез
в самом начале или в самом конце обрабатывается общим кодом.

\`half\` считается как \`(n + m + 1) / 2\` — с \`+1\` левая половина при нечётной
общей длине получается на один элемент больше, и медиана оказывается её
максимумом.

Условие \`leftShort > rightLong\` означает, что в левой половине короткого массива
слишком большие элементы — разрез надо сдвинуть влево.`,
      hints: [
        'Ищите не элемент, а разрез: сколько элементов каждого массива уходит влево.',
        'Разрез второго массива однозначно следует из разреза первого.',
        'Бинарный поиск ведите по короткому массиву.',
        '±Infinity на границах избавит от частных случаев.',
      ],
      cases: [
        { name: 'нечётная длина', args: [[1, 3], [2]], expected: 2 },
        { name: 'чётная длина', args: [[1, 2], [3, 4]], expected: 2.5 },
        { name: 'первый пуст', args: [[], [1]], expected: 1 },
        { name: 'второй пуст', args: [[2], []], expected: 2 },
        { name: 'не пересекаются', args: [[1, 2], [3, 4, 5]], expected: 3 },
        { name: 'одинаковые элементы', args: [[2, 2], [2, 2]], expected: 2, hidden: true },
        { name: 'разная длина', args: [[1], [2, 3, 4, 5, 6]], expected: 3.5, hidden: true },
        { name: 'отрицательные', args: [[-5, -3], [-2, -1]], expected: -2.5, hidden: true },
      ],
      testCode: `test('совпадает с медианой слияния на случайных данных', function () {
  let seed = 42
  function next() {
    seed = (seed * 1103515245 + 12345) % 2147483648
    return seed % 100
  }

  for (let round = 0; round < 50; round++) {
    const a = Array.from({ length: 1 + (next() % 8) }, next).sort(function (x, y) { return x - y })
    const b = Array.from({ length: 1 + (next() % 8) }, next).sort(function (x, y) { return x - y })

    const merged = a.concat(b).sort(function (x, y) { return x - y })
    const middle = Math.floor(merged.length / 2)
    const expected = merged.length % 2 === 1
      ? merged[middle]
      : (merged[middle - 1] + merged[middle]) / 2

    expect(findMedianSortedArrays(a, b)).toBe(expected)
  }
})`,
    },

    {
      slug: 'n-queens',
      title: 'N ферзей',
      difficulty: 'hard',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'solveNQueens',
      tags: ['leetcode', 'recursion', 'algorithms'],
      companies: ['faang'],
      leetcodeNumber: 51,
      sourceUrl: 'https://leetcode.com/problems/n-queens/',
      descriptionMd: `Расставьте \`n\` ферзей на доске \`n × n\` так, чтобы они не били друг друга.

Верните количество различных расстановок через \`countNQueens(n)\` и сами
расстановки через \`solveNQueens(n)\`.

Расстановка — массив из \`n\` строк, где \`'Q'\` обозначает ферзя, \`'.'\` — пустую
клетку.

\`\`\`js
countNQueens(4) // 2
countNQueens(8) // 92

solveNQueens(4)
// [
//   ['.Q..', '...Q', 'Q...', '..Q.'],
//   ['..Q.', 'Q...', '...Q', '.Q..'],
// ]
\`\`\`

\`countNQueens(9)\` должно считаться быстро — перебор всех расстановок здесь
неприемлем.`,
      starterCode: `function solveNQueens(n) {
  // Ваш код здесь
}

function countNQueens(n) {
  // Ваш код здесь
}
`,
      solutionCode: `function placeQueens(n, onSolution) {
  // В каждой строке ровно один ферзь, поэтому храним только столбцы.
  const columns = new Array(n)
  const usedColumns = new Set()
  // Диагонали адресуются суммой и разностью координат: у клеток
  // одной диагонали эти значения совпадают.
  const usedDiagonals = new Set()
  const usedAntiDiagonals = new Set()

  function place(row) {
    if (row === n) {
      onSolution(columns.slice())
      return
    }

    for (let column = 0; column < n; column++) {
      const diagonal = row - column
      const antiDiagonal = row + column

      if (usedColumns.has(column)) continue
      if (usedDiagonals.has(diagonal)) continue
      if (usedAntiDiagonals.has(antiDiagonal)) continue

      columns[row] = column
      usedColumns.add(column)
      usedDiagonals.add(diagonal)
      usedAntiDiagonals.add(antiDiagonal)

      place(row + 1)

      usedColumns.delete(column)
      usedDiagonals.delete(diagonal)
      usedAntiDiagonals.delete(antiDiagonal)
    }
  }

  place(0)
}

function solveNQueens(n) {
  const result = []

  placeQueens(n, (columns) => {
    result.push(
      columns.map((column) => '.'.repeat(column) + 'Q' + '.'.repeat(n - column - 1)),
    )
  })

  return result
}

function countNQueens(n) {
  let count = 0
  placeQueens(n, () => { count += 1 })
  return count
}
`,
      solutionNotes: `Первое упрощение: в каждой строке стоит ровно один ферзь, иначе они бьют друг
друга. Значит расстановка — это просто массив номеров столбцов, и перебирать
нужно не клетки, а столбцы по строкам.

Второе — проверка боя за O(1). Ферзи на одной диагонали имеют одинаковую
разность \`row - column\`, на одной побочной — одинаковую сумму \`row + column\`.
Три множества (столбцы, диагонали, побочные диагонали) дают мгновенную проверку
вместо обхода доски.

Третье — отсечение. Некорректная ветка обрывается сразу, не доходя до конца
доски. Для \`n = 8\` это 2057 обработанных узлов вместо 16 миллионов расстановок
полного перебора.

Откат (\`delete\` после рекурсивного вызова) обязателен: множества общие для всех
ветвей, и без отката соседние ветви видели бы чужих ферзей.

Генерация строк вынесена в \`solveNQueens\`: подсчёту решений строки не нужны, и
\`countNQueens\` от этого заметно быстрее.`,
      hints: [
        'В каждой строке ровно один ферзь — храните только номера столбцов.',
        'Диагональ задаётся разностью row - column, побочная — суммой row + column.',
        'После рекурсивного вызова обязательно откатывайте пометки.',
      ],
      testCode: `test('countNQueens на малых досках', function () {
  expect(countNQueens(1)).toBe(1)
  expect(countNQueens(2)).toBe(0)
  expect(countNQueens(8)).toBe(92)
})

test('countNQueens на досках 3-6', function () {
  expect(countNQueens(3)).toBe(0)
  expect(countNQueens(4)).toBe(2)
  expect(countNQueens(5)).toBe(10)
  expect(countNQueens(6)).toBe(4)
})

test('девять ферзей считаются быстро', function () {
  expect(countNQueens(9)).toBe(352)
})

test('solveNQueens возвращает расстановки', function () {
  const solutions = solveNQueens(4)

  expect(solutions).toHaveLength(2)
  expect(solutions[0]).toEqual(['.Q..', '...Q', 'Q...', '..Q.'])
})

test('в каждой расстановке ферзи не бьют друг друга', function () {
  for (const board of solveNQueens(6)) {
    const positions = board.map(function (row) { return row.indexOf('Q') })

    expect(positions.every(function (column) { return column !== -1 })).toBe(true)
    expect(new Set(positions).size).toBe(6)

    for (let i = 0; i < positions.length; i++) {
      for (let j = i + 1; j < positions.length; j++) {
        expect(Math.abs(positions[i] - positions[j])).not.toBe(j - i)
      }
    }
  }
})

test('доска правильного размера', function () {
  const solutions = solveNQueens(5)

  for (const board of solutions) {
    expect(board).toHaveLength(5)
    for (const row of board) expect(row).toHaveLength(5)
  }
})`,
    },
  ],
}
