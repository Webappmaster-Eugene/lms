import { raw } from '@/lib/trainer/literal'
import type { TrainerTopicSeed } from './types'

/**
 * Тема 5. Полифиллы методов массива.
 *
 * Задача-детектор: написать `map` умеет почти каждый, а вот вспомнить про
 * пропуск дырок в разреженном массиве, второй аргумент `thisArg` и фиксацию
 * длины до начала обхода — уже нет. Тесты спрашивают именно это.
 */
export const arrayPolyfills: TrainerTopicSeed = {
  slug: 'array-polyfills',
  title: 'Полифиллы методов массива',
  description: 'Свои map, filter, reduce, flat, find и forEach — со всеми краевыми случаями',
  category: 'javascript',
  icon: '🧩',
  order: 5,
  tasks: [
    {
      slug: 'my-map',
      title: 'Свой Array.prototype.map',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'myMap',
      tags: ['polyfill', 'arrays'],
      companies: ['yandex', 'ozon', 'avito'],
      descriptionMd: `Реализуйте \`myMap(array, callback, thisArg)\` — аналог \`Array.prototype.map\`.

- \`callback\` получает \`(значение, индекс, массив)\`;
- \`thisArg\` задаёт контекст вызова \`callback\`;
- длина результата равна длине исходного массива;
- **дырки разреженного массива пропускаются**: \`callback\` для них не вызывается,
  а в результате на их месте остаются дырки;
- если \`callback\` не функция — бросается \`TypeError\`.

\`\`\`js
myMap([1, 2, 3], x => x * 2) // [2, 4, 6]
\`\`\`

Встроенный \`map\` использовать нельзя.`,
      starterCode: `function myMap(array, callback, thisArg) {
  // Ваш код здесь
}
`,
      solutionCode: `function myMap(array, callback, thisArg) {
  if (typeof callback !== 'function') {
    throw new TypeError('callback должен быть функцией')
  }

  const length = array.length
  const result = new Array(length)

  for (let i = 0; i < length; i++) {
    // Дырка разреженного массива: колбэк для неё не вызывается,
    // и в результате на этом месте тоже остаётся дырка.
    if (!Object.prototype.hasOwnProperty.call(array, i)) continue
    result[i] = callback.call(thisArg, array[i], i, array)
  }

  return result
}
`,
      solutionNotes: `Длина фиксируется до цикла. Если \`callback\` добавит элементы в исходный массив,
обход их не увидит — так же ведёт себя настоящий \`map\`.

\`hasOwnProperty(i)\` отличает дырку от записанного \`undefined\`. Это ровно та
деталь, которая отличает полифилл от наивной реализации: в \`[1, , 3]\` колбэк
вызывается два раза, а не три.

\`new Array(length)\` создаёт массив нужной длины сразу с дырками — то, что нужно.
Если собирать результат через \`push\`, дырки схлопнутся и длина поедет.

\`callback.call(thisArg, ...)\` передаёт контекст. Для стрелочной функции он
игнорируется — у неё своего \`this\` нет.`,
      hints: [
        'Зафиксируйте длину массива до начала цикла.',
        'Дырку от записанного undefined отличает hasOwnProperty.',
        'Создавайте результат через new Array(length), а не через push.',
      ],
      cases: [
        { name: 'удвоение', args: [[1, 2, 3], raw('(x) => x * 2')], expected: [2, 4, 6] },
        { name: 'пустой массив', args: [[], raw('(x) => x')], expected: [] },
      ],
      testCode: `test('колбэк получает индекс и массив', function () {
  const calls = []
  myMap(['a', 'b'], function (value, index, array) {
    calls.push([value, index, array.length])
    return value
  })

  expect(calls).toEqual([['a', 0, 2], ['b', 1, 2]])
})

test('thisArg задаёт контекст', function () {
  const context = { factor: 3 }
  const result = myMap([1, 2], function (value) { return value * this.factor }, context)

  expect(result).toEqual([3, 6])
})

test('дырки пропускаются', function () {
  const sparse = [1, , 3]
  let calls = 0

  const result = myMap(sparse, function (value) { calls += 1; return value * 10 })

  expect(calls).toBe(2)
  expect(result.length).toBe(3)
  expect(Object.prototype.hasOwnProperty.call(result, 1)).toBe(false)
  expect(result[0]).toBe(10)
  expect(result[2]).toBe(30)
})

test('записанный undefined обрабатывается', function () {
  let calls = 0
  myMap([undefined, 1], function () { calls += 1 })
  expect(calls).toBe(2)
})

test('не-функция бросает TypeError', function () {
  expect(function () { myMap([1], null) }).toThrow(TypeError)
})

test('исходный массив не меняется', function () {
  const source = [1, 2, 3]
  myMap(source, function (x) { return x * 2 })
  expect(source).toEqual([1, 2, 3])
})`,
    },

    {
      slug: 'my-filter',
      title: 'Свой Array.prototype.filter',
      difficulty: 'easy',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'myFilter',
      tags: ['polyfill', 'arrays'],
      companies: ['ozon'],
      descriptionMd: `Реализуйте \`myFilter(array, callback, thisArg)\` — аналог
\`Array.prototype.filter\`.

- в результат попадают элементы, для которых \`callback\` вернул истинное значение;
- \`callback\` получает \`(значение, индекс, массив)\`;
- дырки разреженного массива пропускаются;
- результат — **плотный** массив (без дырок);
- не-функция в \`callback\` бросает \`TypeError\`.

Встроенный \`filter\` использовать нельзя.`,
      starterCode: `function myFilter(array, callback, thisArg) {
  // Ваш код здесь
}
`,
      solutionCode: `function myFilter(array, callback, thisArg) {
  if (typeof callback !== 'function') {
    throw new TypeError('callback должен быть функцией')
  }

  const length = array.length
  const result = []

  for (let i = 0; i < length; i++) {
    if (!Object.prototype.hasOwnProperty.call(array, i)) continue
    if (callback.call(thisArg, array[i], i, array)) result.push(array[i])
  }

  return result
}
`,
      solutionNotes: `В отличие от \`map\`, здесь результат плотный: \`push\` — правильный выбор, длина
заранее неизвестна.

Проверяется **истинность** возвращённого значения, а не \`=== true\`: колбэк вправе
вернуть строку, число или объект.

Дырки пропускаются и в результат не попадают: отфильтрованный массив всегда
плотный.`,
      hints: [
        'Результат собирайте через push — длина заранее неизвестна.',
        'Проверяйте истинность значения, а не строгое равенство true.',
      ],
      cases: [
        { name: 'чётные числа', args: [[1, 2, 3, 4], raw('(x) => x % 2 === 0')], expected: [2, 4] },
        { name: 'ничего не подошло', args: [[1, 3], raw('(x) => x % 2 === 0')], expected: [] },
        { name: 'пустой массив', args: [[], raw('(x) => x')], expected: [] },
      ],
      testCode: `test('истинность, а не === true', function () {
  expect(myFilter([0, 1, '', 'a', null], function (value) { return value })).toEqual([1, 'a'])
})

test('колбэк получает индекс', function () {
  expect(myFilter(['a', 'b', 'c'], function (_value, index) { return index > 0 })).toEqual(['b', 'c'])
})

test('дырки пропускаются', function () {
  let calls = 0
  const result = myFilter([1, , 3], function () { calls += 1; return true })

  expect(calls).toBe(2)
  expect(result).toEqual([1, 3])
})

test('thisArg задаёт контекст', function () {
  const context = { min: 2 }
  expect(myFilter([1, 2, 3], function (value) { return value >= this.min }, context)).toEqual([2, 3])
})

test('не-функция бросает TypeError', function () {
  expect(function () { myFilter([1], 'не функция') }).toThrow(TypeError)
})`,
    },

    {
      slug: 'my-reduce',
      title: 'Свой Array.prototype.reduce',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'myReduce',
      tags: ['polyfill', 'arrays'],
      companies: ['yandex', 'avito', 'sber', 'faang'],
      descriptionMd: `Реализуйте \`myReduce(array, callback, initialValue)\` — аналог
\`Array.prototype.reduce\`.

- \`callback\` получает \`(аккумулятор, значение, индекс, массив)\`;
- если \`initialValue\` **не передан**, первым аккумулятором становится первый
  существующий элемент, а обход начинается со следующего;
- если массив пуст и \`initialValue\` не передан — \`TypeError\` с сообщением
  \`'Reduce of empty array with no initial value'\`;
- дырки пропускаются.

\`\`\`js
myReduce([1, 2, 3], (sum, x) => sum + x)     // 6
myReduce([1, 2, 3], (sum, x) => sum + x, 10) // 16
myReduce([], (a, b) => a + b, 0)             // 0
\`\`\`

Встроенный \`reduce\` использовать нельзя.`,
      starterCode: `function myReduce(array, callback, initialValue) {
  // Ваш код здесь
}
`,
      solutionCode: `function myReduce(array, callback, initialValue) {
  if (typeof callback !== 'function') {
    throw new TypeError('callback должен быть функцией')
  }

  const length = array.length
  let index = 0
  let accumulator

  // Начальное значение отличают по количеству аргументов, а не по проверке на
  // undefined: undefined — законное начальное значение.
  if (arguments.length >= 3) {
    accumulator = initialValue
  } else {
    while (index < length && !Object.prototype.hasOwnProperty.call(array, index)) index += 1

    if (index >= length) {
      throw new TypeError('Reduce of empty array with no initial value')
    }

    accumulator = array[index]
    index += 1
  }

  for (; index < length; index++) {
    if (!Object.prototype.hasOwnProperty.call(array, index)) continue
    accumulator = callback(accumulator, array[index], index, array)
  }

  return accumulator
}
`,
      solutionNotes: `Главная тонкость — как понять, передали ли начальное значение. Проверка
\`initialValue === undefined\` неверна: \`myReduce(arr, fn, undefined)\` — законный
вызов, и он должен вести себя как «начальное значение есть». Отличить можно
только по \`arguments.length\`.

Когда начального значения нет, ищется первый **существующий** элемент: у
разреженного массива нулевой индекс может быть дыркой.

Пустой массив без начального значения — единственный случай, когда \`reduce\`
бросает исключение. Сообщение взято из спецификации дословно: по нему эту
ошибку и узнают в логах.`,
      hints: [
        'Наличие начального значения определяется через arguments.length, а не сравнением с undefined.',
        'Без начального значения найдите первый существующий элемент и начните со следующего.',
        'Пустой массив без начального значения — TypeError.',
      ],
      cases: [
        { name: 'сумма без начального значения', args: [[1, 2, 3], raw('(a, b) => a + b')], expected: 6 },
        { name: 'сумма с начальным значением', args: [[1, 2, 3], raw('(a, b) => a + b'), 10], expected: 16 },
        { name: 'пустой массив с начальным значением', args: [[], raw('(a, b) => a + b'), 0], expected: 0 },
        { name: 'один элемент без начального значения', args: [[5], raw('(a, b) => a + b')], expected: 5 },
      ],
      testCode: `test('колбэк получает индекс и массив', function () {
  const calls = []
  myReduce([1, 2], function (acc, value, index, array) {
    calls.push([acc, value, index, array.length])
    return acc + value
  }, 0)

  expect(calls).toEqual([[0, 1, 0, 2], [1, 2, 1, 2]])
})

test('пустой массив без начального значения бросает TypeError', function () {
  expect(function () { myReduce([], function (a, b) { return a + b }) })
    .toThrow('Reduce of empty array with no initial value')
})

test('undefined как начальное значение считается переданным', function () {
  const result = myReduce([1], function (acc, value) { return [acc, value] }, undefined)
  expect(result).toEqual([undefined, 1])
})

test('дырки пропускаются', function () {
  let calls = 0
  const result = myReduce([1, , 3], function (acc, value) { calls += 1; return acc + value }, 0)

  expect(calls).toBe(2)
  expect(result).toBe(4)
})

test('без начального значения на разреженном массиве', function () {
  const sparse = [, 2, 3]
  expect(myReduce(sparse, function (a, b) { return a + b })).toBe(5)
})

test('сборка объекта', function () {
  const result = myReduce(['a', 'b'], function (acc, value) {
    acc[value] = true
    return acc
  }, {})

  expect(result).toEqual({ a: true, b: true })
})`,
    },

    {
      slug: 'my-flat',
      title: 'Свой Array.prototype.flat',
      difficulty: 'easy',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'myFlat',
      tags: ['polyfill', 'arrays', 'recursion'],
      descriptionMd: `Реализуйте \`myFlat(array, depth)\` — аналог \`Array.prototype.flat\`.

- \`depth\` по умолчанию \`1\`;
- поддерживается \`Infinity\`;
- **дырки удаляются** (это поведение настоящего \`flat\`);
- результат — новый плотный массив.

\`\`\`js
myFlat([1, [2, [3]]])         // [1, 2, [3]]
myFlat([1, [2, [3]]], 2)      // [1, 2, 3]
myFlat([1, , 2])              // [1, 2] — дырка удалена
\`\`\`

Встроенный \`flat\` использовать нельзя.`,
      starterCode: `function myFlat(array, depth = 1) {
  // Ваш код здесь
}
`,
      solutionCode: `function myFlat(array, depth = 1) {
  const result = []

  for (let i = 0; i < array.length; i++) {
    // flat удаляет дырки — в отличие от map, который их сохраняет.
    if (!Object.prototype.hasOwnProperty.call(array, i)) continue

    const item = array[i]
    if (Array.isArray(item) && depth > 0) {
      result.push(...myFlat(item, depth - 1))
    } else {
      result.push(item)
    }
  }

  return result
}
`,
      solutionNotes: `Отличие от \`map\` в отношении к дыркам принципиально: \`map\` их сохраняет, \`flat\`
удаляет. Это не прихоть — \`flat\` и так меняет длину массива, а \`map\` обязан её
сохранять.

Рекурсия уменьшает \`depth\` на каждом уровне вложенности. Элементы глубже
заданной глубины кладутся как есть, включая вложенные массивы.

\`depth > 0\` проверяется вместе с \`Array.isArray\` — иначе на нулевой глубине
массивы всё равно раскрывались бы.`,
      hints: [
        'flat удаляет дырки, в отличие от map.',
        'Рекурсия с depth - 1 на каждый уровень вложенности.',
      ],
      cases: [
        { name: 'глубина по умолчанию', args: [[1, [2, [3]]]], expected: [1, 2, [3]] },
        { name: 'глубина 2', args: [[1, [2, [3]]], 2], expected: [1, 2, 3] },
        { name: 'бесконечная глубина', args: [[1, [2, [3, [4]]]], Infinity], expected: [1, 2, 3, 4] },
        { name: 'дырки удаляются', args: [[1, undefined, 2]], expected: [1, undefined, 2] },
        { name: 'пустой массив', args: [[]], expected: [] },
        { name: 'глубина 0', args: [[1, [2]], 0], expected: [1, [2]], hidden: true },
      ],
      testCode: `test('дырки удаляются', function () {
  const sparse = [1, , 2]
  expect(myFlat(sparse)).toEqual([1, 2])
})

test('пустые вложенные массивы исчезают', function () {
  expect(myFlat([1, [], [[]], 2], Infinity)).toEqual([1, 2])
})`,
    },

    {
      slug: 'my-find',
      title: 'Свои find и findIndex',
      difficulty: 'easy',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'myFind',
      tags: ['polyfill', 'arrays'],
      descriptionMd: `Реализуйте две функции:

- \`myFind(array, predicate, thisArg)\` возвращает первый подходящий элемент или
  \`undefined\`;
- \`myFindIndex(array, predicate, thisArg)\` возвращает его индекс или \`-1\`.

Важное отличие от \`filter\`: \`find\` и \`findIndex\` **не пропускают дырки** —
предикат вызывается для каждого индекса, а дырка приходит как \`undefined\`.

Обход прекращается на первом совпадении.

Встроенные \`find\` и \`findIndex\` использовать нельзя.`,
      starterCode: `function myFind(array, predicate, thisArg) {
  // Ваш код здесь
}

function myFindIndex(array, predicate, thisArg) {
  // Ваш код здесь
}
`,
      solutionCode: `function myFindIndex(array, predicate, thisArg) {
  if (typeof predicate !== 'function') {
    throw new TypeError('predicate должен быть функцией')
  }

  const length = array.length

  for (let i = 0; i < length; i++) {
    // find и findIndex, в отличие от map и filter, дырки не пропускают:
    // предикат получает undefined.
    if (predicate.call(thisArg, array[i], i, array)) return i
  }

  return -1
}

function myFind(array, predicate, thisArg) {
  const index = myFindIndex(array, predicate, thisArg)
  return index === -1 ? undefined : array[index]
}
`,
      solutionNotes: `\`myFind\` выражается через \`myFindIndex\` — дублировать обход незачем.

Отношение к дыркам здесь противоположно \`map\` и \`filter\`, и это не случайность:
\`find\` ищет по **всем** индексам от нуля до \`length\`, и «отсутствующий элемент»
для него — это \`undefined\`, а не повод пропустить шаг.

Ранний \`return\` обязателен: искать дальше после первого совпадения бессмысленно,
а на больших массивах ещё и дорого.`,
      hints: [
        'find выражается через findIndex — не пишите обход дважды.',
        'Дырки здесь НЕ пропускаются: предикат вызывается для каждого индекса.',
        'Возвращайтесь из функции сразу при первом совпадении.',
      ],
      cases: [
        { name: 'находит элемент', args: [[1, 5, 8], raw('(x) => x > 4')], expected: 5 },
        { name: 'ничего не найдено', args: [[1, 2], raw('(x) => x > 10')], expected: undefined },
        { name: 'пустой массив', args: [[], raw('() => true')], expected: undefined },
      ],
      testCode: `test('findIndex возвращает индекс', function () {
  expect(myFindIndex([1, 5, 8], function (x) { return x > 4 })).toBe(1)
})

test('findIndex возвращает -1, если не найдено', function () {
  expect(myFindIndex([1, 2], function (x) { return x > 10 })).toBe(-1)
})

test('обход прекращается на первом совпадении', function () {
  let calls = 0
  myFind([1, 2, 3, 4], function (x) { calls += 1; return x === 2 })
  expect(calls).toBe(2)
})

test('дырки не пропускаются', function () {
  let calls = 0
  myFind([1, , 3], function () { calls += 1; return false })
  expect(calls).toBe(3)
})

test('предикат получает индекс', function () {
  expect(myFind(['a', 'b'], function (_value, index) { return index === 1 })).toBe('b')
})

test('thisArg задаёт контекст', function () {
  const context = { target: 3 }
  expect(myFind([1, 2, 3], function (value) { return value === this.target }, context)).toBe(3)
})`,
    },

    {
      slug: 'my-for-each',
      title: 'Свой Array.prototype.forEach',
      difficulty: 'easy',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'myForEach',
      tags: ['polyfill', 'arrays'],
      descriptionMd: `Реализуйте \`myForEach(array, callback, thisArg)\` — аналог
\`Array.prototype.forEach\`.

- всегда возвращает \`undefined\`;
- дырки пропускаются;
- длина фиксируется до начала обхода: элементы, добавленные из колбэка, не
  обрабатываются;
- удалённые из колбэка элементы приходят как \`undefined\`, но пропускаются, если
  стали дырками.

Встроенный \`forEach\` использовать нельзя.`,
      starterCode: `function myForEach(array, callback, thisArg) {
  // Ваш код здесь
}
`,
      solutionCode: `function myForEach(array, callback, thisArg) {
  if (typeof callback !== 'function') {
    throw new TypeError('callback должен быть функцией')
  }

  const length = array.length

  for (let i = 0; i < length; i++) {
    if (!Object.prototype.hasOwnProperty.call(array, i)) continue
    callback.call(thisArg, array[i], i, array)
  }

  return undefined
}
`,
      solutionNotes: `\`forEach\` существует ради побочных эффектов и намеренно возвращает \`undefined\`:
цепочку на нём не построить — для этого есть \`map\`.

Фиксация длины до цикла защищает от бесконечного обхода, если колбэк добавляет
элементы в тот же массив.

Прервать \`forEach\` нельзя: ни \`break\`, ни \`return\` из колбэка не остановят обход.
Когда выход нужен — берут \`for...of\`, \`some\` или \`find\`.`,
      hints: [
        'Возвращать нужно undefined — цепочки на forEach не строятся.',
        'Длину фиксируйте до цикла, иначе добавление элементов из колбэка зациклит обход.',
      ],
      testCode: `test('вызывается для каждого элемента', function () {
  const seen = []
  myForEach([1, 2, 3], function (value) { seen.push(value) })
  expect(seen).toEqual([1, 2, 3])
})

test('возвращает undefined', function () {
  expect(myForEach([1], function () { return 'что-то' })).toBeUndefined()
})

test('колбэк получает индекс и массив', function () {
  const calls = []
  myForEach(['a'], function (value, index, array) { calls.push([value, index, array.length]) })
  expect(calls).toEqual([['a', 0, 1]])
})

test('дырки пропускаются', function () {
  let calls = 0
  myForEach([1, , 3], function () { calls += 1 })
  expect(calls).toBe(2)
})

test('длина фиксируется до обхода', function () {
  const source = [1]
  let calls = 0

  myForEach(source, function () {
    calls += 1
    if (calls < 5) source.push(calls)
  })

  expect(calls).toBe(1)
})

test('thisArg задаёт контекст', function () {
  const context = { seen: [] }
  myForEach([1, 2], function (value) { this.seen.push(value) }, context)
  expect(context.seen).toEqual([1, 2])
})

test('не-функция бросает TypeError', function () {
  expect(function () { myForEach([1], 42) }).toThrow(TypeError)
})`,
    },

    {
      slug: 'my-some-every',
      title: 'Свои some и every',
      difficulty: 'easy',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'mySome',
      tags: ['polyfill', 'arrays'],
      descriptionMd: `Реализуйте две функции:

- \`mySome(array, predicate)\` — \`true\`, если предикат вернул истину хотя бы для
  одного элемента;
- \`myEvery(array, predicate)\` — \`true\`, если предикат вернул истину для всех.

Оба метода прекращают обход, как только ответ определён, и пропускают дырки.

Краевые случаи из спецификации:

- \`mySome([])\` — всегда \`false\`;
- \`myEvery([])\` — всегда \`true\` (в математике это называется «вакуумной истиной»).

Встроенные \`some\` и \`every\` использовать нельзя.`,
      starterCode: `function mySome(array, predicate, thisArg) {
  // Ваш код здесь
}

function myEvery(array, predicate, thisArg) {
  // Ваш код здесь
}
`,
      solutionCode: `function mySome(array, predicate, thisArg) {
  if (typeof predicate !== 'function') {
    throw new TypeError('predicate должен быть функцией')
  }

  const length = array.length

  for (let i = 0; i < length; i++) {
    if (!Object.prototype.hasOwnProperty.call(array, i)) continue
    if (predicate.call(thisArg, array[i], i, array)) return true
  }

  return false
}

function myEvery(array, predicate, thisArg) {
  if (typeof predicate !== 'function') {
    throw new TypeError('predicate должен быть функцией')
  }

  const length = array.length

  for (let i = 0; i < length; i++) {
    if (!Object.prototype.hasOwnProperty.call(array, i)) continue
    if (!predicate.call(thisArg, array[i], i, array)) return false
  }

  return true
}
`,
      solutionNotes: `\`some\` и \`every\` — зеркальные: первый ищет подтверждение и выходит по \`true\`,
второй ищет опровержение и выходит по \`false\`.

Пустой массив разводит их поведение: подтверждения не нашлось (\`false\`), но и
опровержения тоже (\`true\`). Так требует спецификация, и на этом регулярно
спотыкаются: \`[].every(x => x > 100)\` — это \`true\`.

Ранний выход здесь не оптимизация, а часть контракта: предикат не должен
вызываться после того, как ответ определён.`,
      hints: [
        'some выходит по первому true, every — по первому false.',
        'Пустой массив: some даёт false, every даёт true.',
      ],
      cases: [
        { name: 'some находит', args: [[1, 2, 3], raw('(x) => x > 2')], expected: true },
        { name: 'some не находит', args: [[1, 2], raw('(x) => x > 5')], expected: false },
        { name: 'some на пустом массиве', args: [[], raw('() => true')], expected: false },
      ],
      testCode: `test('every возвращает true, когда все подходят', function () {
  expect(myEvery([2, 4], function (x) { return x % 2 === 0 })).toBe(true)
})

test('every возвращает false на первом несовпадении', function () {
  expect(myEvery([2, 3, 4], function (x) { return x % 2 === 0 })).toBe(false)
})

test('every на пустом массиве возвращает true', function () {
  expect(myEvery([], function () { return false })).toBe(true)
})

test('some прекращает обход', function () {
  let calls = 0
  mySome([1, 2, 3], function (x) { calls += 1; return x === 2 })
  expect(calls).toBe(2)
})

test('every прекращает обход', function () {
  let calls = 0
  myEvery([1, 2, 3], function (x) { calls += 1; return x === 1 })
  expect(calls).toBe(2)
})

test('дырки пропускаются', function () {
  let calls = 0
  mySome([1, , 3], function () { calls += 1; return false })
  expect(calls).toBe(2)
})`,
    },
  ],
}
