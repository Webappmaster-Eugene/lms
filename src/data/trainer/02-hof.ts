import type { TrainerTopicSeed } from './types'

/**
 * Тема 2. Функции высшего порядка.
 *
 * Самая предсказуемая часть собеседования: debounce и throttle просят почти
 * везде, curry и memoize — чуть реже. Тесты опираются на управляемые часы
 * харнесса (__clock), поэтому проверка времени детерминирована.
 */
export const hof: TrainerTopicSeed = {
  slug: 'higher-order-functions',
  title: 'Функции высшего порядка',
  description: 'debounce, throttle, curry, compose, memoize — то, что просят чаще всего',
  category: 'javascript',
  icon: '🔁',
  order: 2,
  tasks: [
    {
      slug: 'debounce',
      title: 'debounce',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['js', 'ts'],
      entryName: 'debounce',
      tags: ['hof', 'performance'],
      companies: ['yandex', 'ozon', 'avito', 'tbank', 'faang'],
      descriptionMd: `Реализуйте \`debounce(fn, delay)\` — обёртку, которая откладывает вызов \`fn\` до тех
пор, пока не пройдёт \`delay\` миллисекунд с момента **последнего** обращения.

\`\`\`js
const search = debounce(query => console.log(query), 300)
search('a')
search('ab')
search('abc')   // через 300 мс выполнится только этот вызов
\`\`\`

Требования:

- аргументы последнего вызова доходят до \`fn\`;
- контекст \`this\` сохраняется;
- каждый новый вызов сбрасывает отсчёт.

**Как проверять время:** в тестах доступны управляемые часы —
\`await __clock.tick(300)\` прокручивает виртуальное время на 300 мс.`,
      starterCode: `function debounce(fn, delay) {
  // Ваш код здесь
}
`,
      starterCodeTs: `function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  delay: number,
): (...args: A) => void {
  // Ваш код здесь
}
`,
      solutionCode: `function debounce(fn, delay) {
  let timeoutId = null

  return function (...args) {
    clearTimeout(timeoutId)
    timeoutId = setTimeout(() => {
      fn.apply(this, args)
    }, delay)
  }
}
`,
      solutionCodeTs: `function debounce<A extends unknown[]>(
  fn: (...args: A) => void,
  delay: number,
): (...args: A) => void {
  let timeoutId: ReturnType<typeof setTimeout> | null = null

  return function (this: unknown, ...args: A): void {
    if (timeoutId !== null) clearTimeout(timeoutId)
    timeoutId = setTimeout(() => {
      fn.apply(this, args)
    }, delay)
  }
}
`,
      solutionNotes: `Идентификатор таймера живёт в замыкании — он общий для всех вызовов обёртки,
поэтому \`clearTimeout\` успевает отменить предыдущий отложенный запуск.

Стрелочная функция внутри \`setTimeout\` не имеет своего \`this\` и берёт его из
обёртки — благодаря этому \`fn.apply(this, args)\` передаёт правильный контекст.
Если написать там \`function () {}\`, контекст потеряется.

Обёртка должна быть обычной функцией, а не стрелочной: стрелочной неоткуда
взять \`this\` вызова.

Где применяется: поиск с автодополнением, автосохранение формы, обработка
\`resize\`.`,
      hints: [
        'Идентификатор таймера храните в замыкании — он один на все вызовы обёртки.',
        'Каждый вызов начинается с clearTimeout предыдущего идентификатора.',
        'Чтобы не потерять this, используйте стрелочную функцию внутри setTimeout и apply снаружи.',
      ],
      testCode: `test('вызов откладывается на delay', async function () {
  let calls = 0
  const debounced = debounce(function () { calls += 1 }, 300)

  debounced()
  await __clock.tick(299)
  expect(calls).toBe(0)

  await __clock.tick(1)
  expect(calls).toBe(1)
})

test('серия вызовов схлопывается в один', async function () {
  let calls = 0
  const debounced = debounce(function () { calls += 1 }, 100)

  debounced()
  await __clock.tick(50)
  debounced()
  await __clock.tick(50)
  debounced()
  await __clock.tick(100)

  expect(calls).toBe(1)
})

test('доходят аргументы последнего вызова', async function () {
  const received = []
  const debounced = debounce(function (value) { received.push(value) }, 100)

  debounced('a')
  debounced('b')
  debounced('c')
  await __clock.tick(100)

  expect(received).toEqual(['c'])
})

test('контекст сохраняется', async function () {
  const object = {
    name: 'объект',
    run: null,
  }
  object.run = debounce(function () { object.captured = this.name }, 50)

  object.run()
  await __clock.tick(50)

  expect(object.captured).toBe('объект')
})

test('после срабатывания обёртка работает снова', async function () {
  let calls = 0
  const debounced = debounce(function () { calls += 1 }, 100)

  debounced()
  await __clock.tick(100)
  debounced()
  await __clock.tick(100)

  expect(calls).toBe(2)
})`,
    },

    {
      slug: 'throttle',
      title: 'throttle',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['js', 'ts'],
      entryName: 'throttle',
      tags: ['hof', 'performance'],
      companies: ['yandex', 'ozon', 'wildberries', 'faang'],
      descriptionMd: `Реализуйте \`throttle(fn, limit)\` — обёртку, которая пропускает вызов не чаще
одного раза в \`limit\` миллисекунд.

В отличие от \`debounce\`, первый вызов проходит **сразу**, а все последующие
в течение окна игнорируются.

\`\`\`js
const onScroll = throttle(() => console.log('scroll'), 200)
onScroll() // выполнится немедленно
onScroll() // проигнорирован
// ...через 200 мс следующий вызов снова пройдёт
\`\`\`

Требования:

- первый вызов выполняется немедленно;
- вызовы внутри окна игнорируются (не откладываются);
- аргументы и контекст \`this\` доходят до \`fn\`.

В тестах время прокручивается через \`await __clock.tick(ms)\`.`,
      starterCode: `function throttle(fn, limit) {
  // Ваш код здесь
}
`,
      starterCodeTs: `function throttle<A extends unknown[]>(
  fn: (...args: A) => void,
  limit: number,
): (...args: A) => void {
  // Ваш код здесь
}
`,
      solutionCode: `function throttle(fn, limit) {
  let lastCallAt = -Infinity

  return function (...args) {
    const now = Date.now()
    if (now - lastCallAt < limit) return

    lastCallAt = now
    return fn.apply(this, args)
  }
}
`,
      solutionCodeTs: `function throttle<A extends unknown[]>(
  fn: (...args: A) => void,
  limit: number,
): (...args: A) => void {
  let lastCallAt = -Infinity

  return function (this: unknown, ...args: A): void {
    const now = Date.now()
    if (now - lastCallAt < limit) return

    lastCallAt = now
    fn.apply(this, args)
  }
}
`,
      solutionNotes: `Вариант со временем (\`Date.now()\`) проще варианта с флагом и \`setTimeout\`: не
нужно чистить таймеры, а окно считается от фактического последнего пропуска.

Начальное значение \`-Infinity\` даёт первому вызову пройти без частных случаев.

Важно понимать разницу: \`debounce\` откладывает и выполняет **последний** вызов,
\`throttle\` выполняет **первый** и глушит остальные. Для \`scroll\` и \`mousemove\`
нужен throttle, для поиска — debounce.`,
      hints: [
        'Запоминайте время последнего пропущенного вызова в замыкании.',
        'Date.now() внутри песочницы детерминирован и двигается вместе с __clock.',
        'Первый вызов должен пройти — подберите начальное значение так, чтобы не городить условий.',
      ],
      testCode: `test('первый вызов проходит сразу', function () {
  let calls = 0
  const throttled = throttle(function () { calls += 1 }, 200)

  throttled()
  expect(calls).toBe(1)
})

test('вызовы внутри окна игнорируются', async function () {
  let calls = 0
  const throttled = throttle(function () { calls += 1 }, 200)

  throttled()
  throttled()
  await __clock.tick(100)
  throttled()

  expect(calls).toBe(1)
})

test('после окна вызов снова проходит', async function () {
  let calls = 0
  const throttled = throttle(function () { calls += 1 }, 200)

  throttled()
  await __clock.tick(200)
  throttled()

  expect(calls).toBe(2)
})

test('аргументы доходят до функции', function () {
  const received = []
  const throttled = throttle(function (value) { received.push(value) }, 100)

  throttled('первый')
  throttled('проигнорирован')

  expect(received).toEqual(['первый'])
})

test('контекст сохраняется', function () {
  const object = { name: 'объект', run: null }
  object.run = throttle(function () { object.captured = this.name }, 100)

  object.run()

  expect(object.captured).toBe('объект')
})`,
    },

    {
      slug: 'curry',
      title: 'Каррирование',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'curry',
      tags: ['hof'],
      companies: ['yandex', 'avito', 'faang'],
      descriptionMd: `Реализуйте \`curry(fn)\` — преобразование функции нескольких аргументов в цепочку
вызовов.

\`\`\`js
function add(a, b, c) { return a + b + c }
const curried = curry(add)

curried(1)(2)(3)  // 6
curried(1, 2)(3)  // 6
curried(1)(2, 3)  // 6
curried(1, 2, 3)  // 6
\`\`\`

Функция вызывается, когда накопилось не меньше аргументов, чем объявлено в её
сигнатуре (\`fn.length\`). До этого возвращается функция, ждущая остальные.`,
      starterCode: `function curry(fn) {
  // Ваш код здесь
}
`,
      solutionCode: `function curry(fn) {
  return function curried(...args) {
    if (args.length >= fn.length) {
      return fn.apply(this, args)
    }

    return function (...rest) {
      return curried.apply(this, args.concat(rest))
    }
  }
}
`,
      solutionNotes: `\`fn.length\` — количество объявленных параметров до первого со значением по
умолчанию и без rest-параметра. Именно оно задаёт, сколько аргументов нужно
накопить.

Рекурсия идёт через именованное функциональное выражение \`curried\`: имя видно
внутри самой функции, но не засоряет внешнюю область видимости.

\`args.concat(rest)\` создаёт новый массив, а не мутирует накопленный. Это
принципиально: одну и ту же частично применённую функцию можно переиспользовать
несколько раз с разными «хвостами».`,
      hints: [
        'fn.length говорит, сколько аргументов объявлено у функции.',
        'Пока аргументов меньше — возвращайте функцию, которая добавит новые к накопленным.',
        'Накопленные аргументы нельзя мутировать: используйте concat, а не push.',
      ],
      setupCode: `function add3(a, b, c) { return a + b + c }
function mul2(a, b) { return a * b }
`,
      testCode: `test('полный вызов', function () {
  expect(curry(add3)(1, 2, 3)).toBe(6)
})

test('по одному аргументу', function () {
  expect(curry(add3)(1)(2)(3)).toBe(6)
})

test('смешанные группы', function () {
  const curried = curry(add3)
  expect(curried(1, 2)(3)).toBe(6)
  expect(curried(1)(2, 3)).toBe(6)
})

test('частичное применение переиспользуемо', function () {
  const curried = curry(add3)
  const addTo1 = curried(1)
  expect(addTo1(2, 3)).toBe(6)
  expect(addTo1(10, 20)).toBe(31)
})

test('работает с двумя аргументами', function () {
  expect(curry(mul2)(3)(4)).toBe(12)
})`,
    },

    {
      slug: 'compose-pipe',
      title: 'compose и pipe',
      difficulty: 'easy',
      checkMode: 'unit',
      languages: ['js', 'ts'],
      entryName: 'compose',
      tags: ['hof'],
      companies: ['avito'],
      descriptionMd: `Реализуйте две функции композиции:

- \`compose(...fns)\` применяет функции **справа налево**;
- \`pipe(...fns)\` применяет их **слева направо**.

\`\`\`js
const addOne = x => x + 1
const double = x => x * 2

compose(double, addOne)(3) // double(addOne(3)) = 8
pipe(double, addOne)(3)    // addOne(double(3)) = 7
\`\`\`

Композиция без функций возвращает аргумент как есть.`,
      starterCode: `function compose(...fns) {
  // Ваш код здесь
}

function pipe(...fns) {
  // Ваш код здесь
}
`,
      starterCodeTs: `type UnaryFn = (value: unknown) => unknown

function compose(...fns: UnaryFn[]): UnaryFn {
  // Ваш код здесь
}

function pipe(...fns: UnaryFn[]): UnaryFn {
  // Ваш код здесь
}
`,
      solutionCode: `function compose(...fns) {
  return function (value) {
    return fns.reduceRight((acc, fn) => fn(acc), value)
  }
}

function pipe(...fns) {
  return function (value) {
    return fns.reduce((acc, fn) => fn(acc), value)
  }
}
`,
      solutionCodeTs: `type UnaryFn = (value: unknown) => unknown

function compose(...fns: UnaryFn[]): UnaryFn {
  return (value: unknown): unknown => fns.reduceRight((acc, fn) => fn(acc), value)
}

function pipe(...fns: UnaryFn[]): UnaryFn {
  return (value: unknown): unknown => fns.reduce((acc, fn) => fn(acc), value)
}
`,
      solutionNotes: `\`reduce\` идёт слева направо, \`reduceRight\` — справа налево. Начальное значение —
аргумент, поэтому пустой список функций автоматически даёт тождественную
функцию, без особого случая.

\`compose\` читается как математическая запись \`f(g(x))\`, \`pipe\` — как конвейер.
В библиотеках чаще встречается \`pipe\`: порядок чтения совпадает с порядком
выполнения.`,
      hints: [
        'Обе функции — это reduce по списку функций с аргументом в качестве начального значения.',
        'compose идёт справа налево: подойдёт reduceRight.',
      ],
      setupCode: `const addOne = (x) => x + 1
const double = (x) => x * 2
const square = (x) => x * x
`,
      setupTypes: `declare const addOne: (x: number) => number
declare const double: (x: number) => number
declare const square: (x: number) => number
`,
      testCode: `test('compose применяет справа налево', function () {
  expect(compose(double, addOne)(3)).toBe(8)
})

test('pipe применяет слева направо', function () {
  expect(pipe(double, addOne)(3)).toBe(7)
})

test('три функции', function () {
  expect(compose(square, double, addOne)(2)).toBe(36)
  expect(pipe(addOne, double, square)(2)).toBe(36)
})

test('без функций возвращает аргумент', function () {
  expect(compose()(42)).toBe(42)
  expect(pipe()(42)).toBe(42)
})

test('одна функция', function () {
  expect(compose(double)(5)).toBe(10)
  expect(pipe(double)(5)).toBe(10)
})`,
    },

    {
      slug: 'memoize',
      title: 'Мемоизация',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'memoize',
      tags: ['hof', 'performance'],
      companies: ['yandex', 'sber', 'faang'],
      descriptionMd: `Реализуйте \`memoize(fn, resolver)\` — кэширование результатов по аргументам.

- повторный вызов с теми же аргументами не выполняет \`fn\`, а отдаёт закэшированное
  значение;
- ключ кэша по умолчанию строится из всех аргументов;
- если передан \`resolver\`, ключ вычисляет он;
- у обёртки есть свойство \`cache\` — экземпляр \`Map\`.

\`\`\`js
let calls = 0
const slowSum = memoize((a, b) => { calls++; return a + b })

slowSum(1, 2) // 3, calls === 1
slowSum(1, 2) // 3, calls === 1 — взято из кэша
\`\`\``,
      starterCode: `function memoize(fn, resolver) {
  // Ваш код здесь
}
`,
      solutionCode: `function memoize(fn, resolver) {
  const cache = new Map()

  function memoized(...args) {
    const key = resolver ? resolver.apply(this, args) : JSON.stringify(args)

    if (cache.has(key)) return cache.get(key)

    const result = fn.apply(this, args)
    cache.set(key, result)
    return result
  }

  memoized.cache = cache
  return memoized
}
`,
      solutionNotes: `\`Map\` лучше обычного объекта: ключами могут быть любые значения, нет
наследуемых свойств вроде \`constructor\` и \`__proto__\`, а \`has\` честно отличает
закэшированный \`undefined\` от отсутствия ключа.

Проверять надо именно через \`cache.has(key)\`, а не \`cache.get(key) !== undefined\`:
иначе функция, вернувшая \`undefined\`, будет пересчитываться каждый раз.

\`JSON.stringify\` как ключ по умолчанию — компромисс: он не различает \`undefined\`
и \`null\` внутри массивов и не умеет циклические ссылки. Для таких случаев и нужен
\`resolver\`.`,
      hints: [
        'Кэш храните в Map внутри замыкания.',
        'Отличать «в кэше лежит undefined» от «ключа нет» умеет только has.',
        'Свойство cache вешается на возвращаемую функцию.',
      ],
      testCode: `test('повторный вызов берётся из кэша', function () {
  let calls = 0
  const sum = memoize(function (a, b) { calls += 1; return a + b })

  expect(sum(1, 2)).toBe(3)
  expect(sum(1, 2)).toBe(3)
  expect(calls).toBe(1)
})

test('разные аргументы считаются заново', function () {
  let calls = 0
  const sum = memoize(function (a, b) { calls += 1; return a + b })

  sum(1, 2)
  sum(2, 3)

  expect(calls).toBe(2)
})

test('кэшируется и undefined', function () {
  let calls = 0
  const nothing = memoize(function () { calls += 1 })

  nothing()
  nothing()

  expect(calls).toBe(1)
})

test('resolver задаёт ключ', function () {
  let calls = 0
  const byFirst = memoize(
    function (a, b) { calls += 1; return a + b },
    function (a) { return a },
  )

  expect(byFirst(1, 2)).toBe(3)
  expect(byFirst(1, 100)).toBe(3)
  expect(calls).toBe(1)
})

test('cache — это Map', function () {
  const sum = memoize(function (a) { return a })
  sum(1)
  expect(sum.cache).toBeInstanceOf(Map)
  expect(sum.cache.size).toBe(1)
})`,
    },

    {
      slug: 'once',
      title: 'once: вызов ровно один раз',
      difficulty: 'easy',
      checkMode: 'unit',
      languages: ['js', 'ts'],
      entryName: 'once',
      tags: ['hof'],
      companies: ['ozon'],
      descriptionMd: `Реализуйте \`once(fn)\` — обёртку, которая выполняет \`fn\` только при первом вызове.
Все последующие вызовы возвращают результат первого, не трогая \`fn\`.

\`\`\`js
const init = once(() => { console.log('инициализация'); return 42 })
init() // 'инициализация', 42
init() // 42 — ничего не выводится
\`\`\`

Контекст и аргументы первого вызова передаются в \`fn\`.`,
      starterCode: `function once(fn) {
  // Ваш код здесь
}
`,
      starterCodeTs: `function once<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  // Ваш код здесь
}
`,
      solutionCode: `function once(fn) {
  let called = false
  let result

  return function (...args) {
    if (called) return result

    called = true
    result = fn.apply(this, args)
    return result
  }
}
`,
      solutionCodeTs: `function once<A extends unknown[], R>(fn: (...args: A) => R): (...args: A) => R {
  let called = false
  let result: R

  return function (this: unknown, ...args: A): R {
    if (called) return result

    called = true
    result = fn.apply(this, args)
    return result
  }
}
`,
      solutionNotes: `Отдельный флаг \`called\` нужен именно потому, что \`fn\` может законно вернуть
\`undefined\`: проверка \`if (result === undefined)\` вызывала бы функцию повторно.

Флаг выставляется **до** вызова \`fn\`. Если \`fn\` бросит исключение, повторного
запуска не будет — для инициализации это обычно правильное поведение: второй
запуск скорее всего упадёт так же.`,
      hints: [
        'Нужен отдельный флаг: результатом может быть undefined.',
        'Результат первого вызова сохраните в замыкании и возвращайте дальше.',
      ],
      testCode: `test('функция выполняется один раз', function () {
  let calls = 0
  const init = once(function () { calls += 1; return 42 })

  expect(init()).toBe(42)
  expect(init()).toBe(42)
  expect(init()).toBe(42)
  expect(calls).toBe(1)
})

test('аргументы первого вызова доходят', function () {
  const received = []
  const run = once(function (a, b) { received.push(a, b); return a + b })

  expect(run(1, 2)).toBe(3)
  expect(run(10, 20)).toBe(3)
  expect(received).toEqual([1, 2])
})

test('undefined тоже кэшируется', function () {
  let calls = 0
  const run = once(function () { calls += 1 })

  run()
  run()

  expect(calls).toBe(1)
})

test('контекст сохраняется', function () {
  const object = { name: 'объект', run: null }
  object.run = once(function () { return this.name })

  expect(object.run()).toBe('объект')
})`,
    },

    {
      slug: 'partial',
      title: 'Частичное применение',
      difficulty: 'easy',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'partial',
      tags: ['hof'],
      descriptionMd: `Реализуйте \`partial(fn, ...preset)\` — фиксацию первых аргументов функции.

\`\`\`js
const greet = (greeting, name) => greeting + ', ' + name
const hello = partial(greet, 'Привет')

hello('Аня') // 'Привет, Аня'
\`\`\`

Дополнительно поддержите «дырки»: если вместо значения передан плейсхолдер
\`partial.PLACEHOLDER\`, соответствующий аргумент берётся из вызова.

\`\`\`js
const greetAnya = partial(greet, partial.PLACEHOLDER, 'Аня')
greetAnya('Здравствуйте') // 'Здравствуйте, Аня'
\`\`\``,
      starterCode: `function partial(fn, ...preset) {
  // Ваш код здесь
}

partial.PLACEHOLDER = Symbol('partial.placeholder')
`,
      solutionCode: `function partial(fn, ...preset) {
  return function (...args) {
    const queue = args.slice()
    const merged = preset.map((value) =>
      value === partial.PLACEHOLDER && queue.length > 0 ? queue.shift() : value,
    )

    return fn.apply(this, merged.concat(queue))
  }
}

partial.PLACEHOLDER = Symbol('partial.placeholder')
`,
      solutionNotes: `Плейсхолдеры заполняются по порядку из очереди аргументов вызова, а всё, что
осталось в очереди, дописывается в конец. Отсюда и \`shift\` — он и берёт значение,
и убирает его из очереди за один шаг.

\`Symbol\` в роли плейсхолдера безопаснее строки или числа: такое значение
невозможно передать случайно.

Копия \`args.slice()\` нужна, чтобы один и тот же частично применённый вызов
можно было повторять — исходный массив аргументов не портится.`,
      hints: [
        'Пройдите по зафиксированным аргументам и подставьте значения вызова на месте плейсхолдеров.',
        'Оставшиеся аргументы вызова дописываются в конец.',
        'shift берёт значение из очереди и сразу убирает его.',
      ],
      setupCode: `const greetWith = (greeting, name, mark) => greeting + ', ' + name + (mark || '')
`,
      testCode: `test('фиксирует первый аргумент', function () {
  const hello = partial(greetWith, 'Привет')
  expect(hello('Аня')).toBe('Привет, Аня')
})

test('фиксирует несколько аргументов', function () {
  const helloAnya = partial(greetWith, 'Привет', 'Аня')
  expect(helloAnya('!')).toBe('Привет, Аня!')
})

test('плейсхолдер пропускает аргумент', function () {
  const toAnya = partial(greetWith, partial.PLACEHOLDER, 'Аня')
  expect(toAnya('Здравствуйте')).toBe('Здравствуйте, Аня')
})

test('частичное применение переиспользуемо', function () {
  const hello = partial(greetWith, 'Привет')
  expect(hello('Аня')).toBe('Привет, Аня')
  expect(hello('Борис')).toBe('Привет, Борис')
})`,
    },

    {
      slug: 'pipe-async',
      title: 'Асинхронный конвейер',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['js', 'ts'],
      entryName: 'pipeAsync',
      tags: ['hof', 'async'],
      companies: ['ozon'],
      descriptionMd: `Реализуйте \`pipeAsync(...fns)\` — конвейер, в котором каждая функция может быть
как синхронной, так и асинхронной. Результат предыдущей передаётся в следующую,
промежуточные промисы разворачиваются.

\`\`\`js
const load = pipeAsync(
  id => fetchUser(id),      // Promise
  user => user.name,        // обычная функция
  async name => name.trim(),
)

await load(1) // 'Аня'
\`\`\`

Если какая-то функция бросит исключение или вернёт отклонённый промис, итоговый
промис отклоняется этой же ошибкой, а оставшиеся функции не выполняются.`,
      starterCode: `function pipeAsync(...fns) {
  // Ваш код здесь
}
`,
      starterCodeTs: `type AsyncStep = (value: unknown) => unknown | Promise<unknown>

function pipeAsync(...fns: AsyncStep[]): (value: unknown) => Promise<unknown> {
  // Ваш код здесь
}
`,
      solutionCode: `function pipeAsync(...fns) {
  return function (value) {
    return fns.reduce(
      (chain, fn) => chain.then((result) => fn(result)),
      Promise.resolve(value),
    )
  }
}
`,
      solutionCodeTs: `type AsyncStep = (value: unknown) => unknown | Promise<unknown>

function pipeAsync(...fns: AsyncStep[]): (value: unknown) => Promise<unknown> {
  return (value: unknown): Promise<unknown> =>
    fns.reduce<Promise<unknown>>(
      (chain, fn) => chain.then((result) => fn(result)),
      Promise.resolve(value),
    )
}
`,
      solutionNotes: `\`reduce\` строит цепочку \`.then\`, а не выполняет функции сразу — поэтому шаги
идут строго последовательно, и каждый видит уже развёрнутый результат предыдущего.

\`then\` сам разворачивает промис, возвращённый из колбэка, так что синхронные и
асинхронные шаги смешиваются свободно.

Обработка ошибок достаётся бесплатно: отклонение пробрасывается по цепочке,
пропуская все \`then\` до первого \`catch\`.`,
      hints: [
        'Стройте цепочку then через reduce, начиная с Promise.resolve(value).',
        'then сам разворачивает промис, возвращённый из колбэка.',
      ],
      testCode: `test('синхронные шаги', async function () {
  const run = pipeAsync(function (x) { return x + 1 }, function (x) { return x * 2 })
  await expect(run(3)).resolves.toBe(8)
})

test('асинхронные шаги', async function () {
  const run = pipeAsync(
    function (x) { return Promise.resolve(x + 1) },
    function (x) { return Promise.resolve(x * 2) },
  )
  await expect(run(3)).resolves.toBe(8)
})

test('смесь синхронных и асинхронных', async function () {
  const run = pipeAsync(
    function (x) { return Promise.resolve(x + 1) },
    function (x) { return x * 2 },
    function (x) { return Promise.resolve(String(x)) },
  )
  await expect(run(3)).resolves.toBe('8')
})

test('ошибка прерывает конвейер', async function () {
  let reachedLast = false
  const run = pipeAsync(
    function () { throw new Error('сломалось') },
    function () { reachedLast = true },
  )

  await expect(run(1)).rejects.toThrow('сломалось')
  expect(reachedLast).toBe(false)
})

test('без функций возвращает исходное значение', async function () {
  await expect(pipeAsync()(42)).resolves.toBe(42)
})`,
    },
  ],
}
