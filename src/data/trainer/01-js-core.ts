import type { TrainerTopicSeed } from './types'

/**
 * Тема 1. Устройство языка: замыкания, контекст, всплытие, event loop, прототипы.
 *
 * Это первое, что спрашивают на собеседовании, и почти всегда — в форме
 * «что выведет код». Здесь такие вопросы переведены в проверяемый вид: нужно
 * вернуть порядок вывода, а не угадать его вслух.
 */
export const jsCore: TrainerTopicSeed = {
  slug: 'js-core',
  title: 'Основы JavaScript',
  description: 'Замыкания, контекст this, всплытие, event loop и прототипы',
  category: 'javascript',
  icon: '🧠',
  order: 1,
  tasks: [
    {
      slug: 'create-counter',
      title: 'Счётчик на замыкании',
      difficulty: 'easy',
      checkMode: 'unit',
      languages: ['js', 'ts'],
      entryName: 'createCounter',
      tags: ['closures'],
      companies: ['yandex', 'avito'],
      descriptionMd: `Реализуйте функцию \`createCounter()\`, которая возвращает функцию-счётчик.
Каждый вызов счётчика увеличивает значение на 1 и возвращает новое значение.

Счётчики, созданные разными вызовами \`createCounter()\`, независимы друг от друга,
а достучаться до внутреннего значения снаружи нельзя.

\`\`\`js
const counter = createCounter()
counter() // 1
counter() // 2

const other = createCounter()
other()   // 1 — свой счётчик
\`\`\``,
      starterCode: `function createCounter() {
  // Ваш код здесь
}
`,
      starterCodeTs: `function createCounter(): () => number {
  // Ваш код здесь
}
`,
      solutionCode: `function createCounter() {
  let count = 0
  return function () {
    count += 1
    return count
  }
}
`,
      solutionCodeTs: `function createCounter(): () => number {
  let count = 0
  return (): number => {
    count += 1
    return count
  }
}
`,
      solutionNotes: `Внутренняя функция держит ссылку на переменную \`count\` внешней — это и есть
замыкание. Переменная живёт столько же, сколько живёт возвращённая функция,
и снаружи к ней не подобраться: собственного имени в глобальной области у неё нет.

Частая ошибка — объявить \`count\` вне \`createCounter\`: тогда все счётчики
станут общими.`,
      hints: [
        'Переменная должна объявляться внутри createCounter, а не снаружи.',
        'Возвращайте функцию, которая меняет эту переменную и возвращает результат.',
      ],
      testCode: `test('счётчик считает с единицы', function () {
  const counter = createCounter()
  expect(counter()).toBe(1)
  expect(counter()).toBe(2)
  expect(counter()).toBe(3)
})

test('счётчики независимы', function () {
  const first = createCounter()
  const second = createCounter()
  first()
  first()
  expect(first()).toBe(3)
  expect(second()).toBe(1)
})

test('createCounter возвращает функцию', function () {
  expect(typeof createCounter()).toBe('function')
})`,
    },

    {
      slug: 'lost-this',
      title: 'Потерянный контекст',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['js', 'ts'],
      entryName: 'bindMethod',
      tags: ['this'],
      companies: ['ozon', 'tbank'],
      descriptionMd: `Метод, вырванный из объекта, теряет \`this\`:

\`\`\`js
const user = { name: 'Аня', greet() { return 'Привет, ' + this.name } }
const greet = user.greet
greet() // TypeError: this — undefined
\`\`\`

Реализуйте \`bindMethod(object, methodName)\`, которая возвращает функцию, навсегда
привязанную к объекту. Возвращённая функция обязана:

- передавать все свои аргументы исходному методу;
- возвращать его результат;
- видеть **актуальное** состояние объекта (если поле изменили после привязки —
  используется новое значение).`,
      starterCode: `function bindMethod(object, methodName) {
  // Ваш код здесь
}
`,
      starterCodeTs: `function bindMethod<T extends object, K extends keyof T>(
  object: T,
  methodName: K,
): (...args: unknown[]) => unknown {
  // Ваш код здесь
}
`,
      solutionCode: `function bindMethod(object, methodName) {
  return function (...args) {
    return object[methodName].apply(object, args)
  }
}
`,
      solutionCodeTs: `function bindMethod<T extends object, K extends keyof T>(
  object: T,
  methodName: K,
): (...args: unknown[]) => unknown {
  return (...args: unknown[]): unknown => {
    const method = object[methodName] as unknown as (...rest: unknown[]) => unknown
    return method.apply(object, args)
  }
}
`,
      solutionNotes: `\`this\` в обычной функции определяется тем, **как** её вызвали, а не тем, где
объявили. \`object[methodName].apply(object, args)\` восстанавливает вызов «через
точку», поэтому контекст на месте.

Обращение \`object[methodName]\` внутри обёртки, а не снаружи, важно: так
подхватывается текущий метод, даже если его подменили после привязки.

\`Function.prototype.bind\` решает ту же задачу, но фиксирует ссылку на метод
в момент привязки.`,
      hints: [
        'Верните функцию-обёртку, а не результат вызова метода.',
        'Внутри обёртки вызывайте метод через apply или call, передавая объект как контекст.',
        'Искать метод в объекте нужно внутри обёртки — тогда подхватится актуальный.',
      ],
      testCode: `test('метод сохраняет контекст', function () {
  const user = { name: 'Аня', greet: function () { return 'Привет, ' + this.name } }
  const greet = bindMethod(user, 'greet')
  expect(greet()).toBe('Привет, Аня')
})

test('аргументы доходят до метода', function () {
  const calc = { base: 10, add: function (a, b) { return this.base + a + b } }
  const add = bindMethod(calc, 'add')
  expect(add(1, 2)).toBe(13)
})

test('видно актуальное состояние объекта', function () {
  const user = { name: 'Аня', greet: function () { return this.name } }
  const greet = bindMethod(user, 'greet')
  user.name = 'Борис'
  expect(greet()).toBe('Борис')
})`,
    },

    {
      slug: 'hoisting-order',
      title: 'Всплытие: var, let и функции',
      difficulty: 'easy',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'predictHoisting',
      tags: ['hoisting'],
      descriptionMd: `Не запуская код, определите, что произойдёт в каждой строке:

\`\`\`js
console.log(a)   // 1
var a = 5

console.log(b)   // 2
let b = 10

console.log(f()) // 3
function f() { return 'ok' }

console.log(g)   // 4
var g = function () {}
\`\`\`

Верните из функции \`predictHoisting()\` массив из четырёх элементов — что окажется
в каждой строке. Для строки, которая бросит исключение, положите строку
\`'ReferenceError'\`; для значения \`undefined\` — строку \`'undefined'\`.

Ответ вида: \`['undefined', 'ReferenceError', 'ok', 'undefined']\`.`,
      starterCode: `function predictHoisting() {
  // Верните массив из четырёх значений
  return []
}
`,
      solutionCode: `function predictHoisting() {
  return ['undefined', 'ReferenceError', 'ok', 'undefined']
}
`,
      solutionNotes: `\`var\` всплывает вместе с инициализацией в \`undefined\` — обращение до
присваивания вернёт \`undefined\`.

\`let\` и \`const\` тоже всплывают, но попадают во временную мёртвую зону
(temporal dead zone): обращение до объявления бросает \`ReferenceError\`.

Объявление функции всплывает целиком, поэтому \`f()\` работает выше по коду.
А функциональное выражение, присвоенное в \`var\`, — это всё тот же \`var\`:
всплывает только имя.`,
      hints: [
        'var поднимается и инициализируется значением undefined.',
        'let и const попадают во временную мёртвую зону до строки объявления.',
        'Объявление функции поднимается целиком, функциональное выражение — нет.',
      ],
      cases: [
        {
          name: 'порядок всплытия',
          args: [],
          expected: ['undefined', 'ReferenceError', 'ok', 'undefined'],
        },
      ],
    },

    {
      slug: 'event-loop-order',
      title: 'Event Loop: порядок вывода',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'predictOrder',
      tags: ['event-loop', 'async'],
      companies: ['yandex', 'ozon', 'sber'],
      descriptionMd: `В каком порядке выведутся числа?

\`\`\`js
console.log(1)

setTimeout(() => console.log(2), 0)

Promise.resolve()
  .then(() => console.log(3))
  .then(() => console.log(4))

queueMicrotask(() => console.log(5))

console.log(6)
\`\`\`

Верните из \`predictOrder()\` массив чисел в порядке вывода.`,
      starterCode: `function predictOrder() {
  // Верните массив чисел в порядке вывода
  return []
}
`,
      solutionCode: `function predictOrder() {
  return [1, 6, 3, 5, 4, 2]
}
`,
      solutionNotes: `Сначала выполняется весь синхронный код: \`1\`, \`6\`.

Затем опустошается очередь микрозадач. На момент её разбора там уже стоят
первый \`then\` (\`3\`) и \`queueMicrotask\` (\`5\`) — именно в этом порядке, потому что
\`then\` зарегистрировался раньше. Второй \`then\` (\`4\`) появляется в очереди только
после того, как отработал первый, и попадает в её конец.

И лишь когда микрозадач не осталось, доходит очередь до макрозадачи
\`setTimeout\` — \`2\`.

Ключевое правило: после каждой макрозадачи очередь микрозадач опустошается
полностью, включая те, что добавились по ходу.`,
      hints: [
        'Сначала весь синхронный код, только потом очереди.',
        'Микрозадачи (промисы, queueMicrotask) идут раньше макрозадач (setTimeout).',
        'Второй then попадает в очередь только после того, как отработал первый.',
      ],
      cases: [{ name: 'порядок вывода', args: [], expected: [1, 6, 3, 5, 4, 2] }],
    },

    {
      slug: 'prototype-chain',
      title: 'Цепочка прототипов',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'Dog',
      tags: ['prototypes'],
      companies: ['sber'],
      descriptionMd: `Постройте цепочку наследования \`Animal → Dog\` на функциях-конструкторах,
без синтаксиса \`class\`.

Требования:

- \`Animal(name)\` сохраняет \`name\` и имеет метод \`eat()\`, возвращающий \`'<имя> ест'\`;
- \`Dog(name, breed)\` переиспользует конструктор родителя, сохраняет \`breed\`
  и добавляет метод \`bark()\`, возвращающий \`'<имя> лает'\`;
- \`new Dog(...) instanceof Animal\` — \`true\`;
- \`dog.constructor === Dog\`;
- методы лежат на прототипах, а не копируются в каждый экземпляр.`,
      starterCode: `function Animal(name) {
  // Ваш код здесь
}

function Dog(name, breed) {
  // Ваш код здесь
}
`,
      solutionCode: `function Animal(name) {
  this.name = name
}

Animal.prototype.eat = function () {
  return this.name + ' ест'
}

function Dog(name, breed) {
  Animal.call(this, name)
  this.breed = breed
}

Dog.prototype = Object.create(Animal.prototype)
Dog.prototype.constructor = Dog

Dog.prototype.bark = function () {
  return this.name + ' лает'
}
`,
      solutionNotes: `\`Animal.call(this, name)\` переиспользует конструктор родителя — иначе поля
пришлось бы копировать руками.

\`Dog.prototype = Object.create(Animal.prototype)\` создаёт новый объект с нужным
прототипом. Присваивать \`Dog.prototype = new Animal()\` нельзя: это вызовет
конструктор родителя раньше времени и затащит его поля в прототип.

После переприсваивания прототипа теряется \`constructor\` — его восстанавливают
вручную.

Порядок важен: \`bark\` добавляется **после** замены прототипа, иначе метод
потеряется вместе со старым объектом.`,
      hints: [
        'Поля родителя выставляются через Animal.call(this, name).',
        'Прототип наследника создаётся через Object.create(Animal.prototype).',
        'После замены прототипа восстановите constructor и только потом добавляйте методы.',
      ],
      testCode: `test('поля обоих конструкторов на месте', function () {
  const dog = new Dog('Рекс', 'корги')
  expect(dog.name).toBe('Рекс')
  expect(dog.breed).toBe('корги')
})

test('метод родителя доступен наследнику', function () {
  expect(new Dog('Рекс', 'корги').eat()).toBe('Рекс ест')
})

test('свой метод наследника', function () {
  expect(new Dog('Рекс', 'корги').bark()).toBe('Рекс лает')
})

test('цепочка прототипов выстроена', function () {
  const dog = new Dog('Рекс', 'корги')
  expect(dog instanceof Dog).toBe(true)
  expect(dog instanceof Animal).toBe(true)
  expect(dog.constructor).toBe(Dog)
})

test('методы лежат на прототипе, а не в экземпляре', function () {
  const dog = new Dog('Рекс', 'корги')
  expect(Object.prototype.hasOwnProperty.call(dog, 'bark')).toBe(false)
  expect(Object.prototype.hasOwnProperty.call(dog, 'eat')).toBe(false)
})`,
    },

    {
      slug: 'precise-typeof',
      title: 'Точное определение типа',
      difficulty: 'easy',
      checkMode: 'unit',
      languages: ['js', 'ts'],
      entryName: 'typeOf',
      tags: ['objects'],
      companies: ['avito'],
      descriptionMd: `Оператор \`typeof\` врёт на каждом шагу: \`typeof null === 'object'\`,
\`typeof []\` тоже \`'object'\`, а \`NaN\` — вполне себе \`'number'\`.

Реализуйте \`typeOf(value)\`, возвращающую точное имя типа строкой в нижнем
регистре:

| Значение | Результат |
|---|---|
| \`null\` | \`'null'\` |
| \`undefined\` | \`'undefined'\` |
| \`[]\` | \`'array'\` |
| \`{}\` | \`'object'\` |
| \`new Date()\` | \`'date'\` |
| \`/x/\` | \`'regexp'\` |
| \`new Map()\` | \`'map'\` |
| \`NaN\` | \`'nan'\` |
| \`42\` | \`'number'\` |
| \`'a'\` | \`'string'\` |
| \`() => {}\` | \`'function'\` |`,
      starterCode: `function typeOf(value) {
  // Ваш код здесь
}
`,
      starterCodeTs: `function typeOf(value: unknown): string {
  // Ваш код здесь
}
`,
      solutionCode: `function typeOf(value) {
  if (Number.isNaN(value)) return 'nan'
  return Object.prototype.toString.call(value).slice(8, -1).toLowerCase()
}
`,
      solutionCodeTs: `function typeOf(value: unknown): string {
  if (typeof value === 'number' && Number.isNaN(value)) return 'nan'
  return Object.prototype.toString.call(value).slice(8, -1).toLowerCase()
}
`,
      solutionNotes: `\`Object.prototype.toString.call(value)\` возвращает \`[object Тип]\` — внутренний
тег, который правильно различает \`null\`, массивы, даты, регулярки, Map и Set.
Срез \`slice(8, -1)\` убирает обёртку.

\`NaN\` приходится проверять отдельно: его внутренний тег — \`Number\`.
\`Number.isNaN\` (в отличие от глобального \`isNaN\`) не приводит аргумент к числу,
поэтому строка \`'abc'\` через него не пролезет.`,
      hints: [
        'Object.prototype.toString.call(value) возвращает строку вида "[object Array]".',
        'NaN придётся обработать до общей ветки — его внутренний тег Number.',
        'Number.isNaN не приводит аргумент к числу, а глобальный isNaN — приводит.',
      ],
      cases: [
        { name: 'null', args: [null], expected: 'null' },
        { name: 'undefined', args: [undefined], expected: 'undefined' },
        { name: 'массив', args: [[]], expected: 'array' },
        { name: 'объект', args: [{}], expected: 'object' },
        { name: 'число', args: [42], expected: 'number' },
        { name: 'NaN', args: [NaN], expected: 'nan' },
        { name: 'строка', args: ['a'], expected: 'string' },
        { name: 'регулярное выражение', args: [/x/], expected: 'regexp', hidden: true },
        { name: 'Map', args: [new Map()], expected: 'map', hidden: true },
        { name: 'дата', args: [new Date(0)], expected: 'date', hidden: true },
      ],
      testCode: `test('функция распознаётся', function () {
  expect(typeOf(function () {})).toBe('function')
})

test('строка "abc" не путается с NaN', function () {
  expect(typeOf('abc')).toBe('string')
})`,
    },

    {
      slug: 'closures-in-loop',
      title: 'Замыкание в цикле',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'makeIndexGetters',
      tags: ['closures'],
      companies: ['yandex'],
      descriptionMd: `Классическая ловушка: функции, созданные в цикле с \`var\`, все видят одну и ту же
переменную и после цикла возвращают её последнее значение.

\`\`\`js
const fns = []
for (var i = 0; i < 3; i++) fns.push(() => i)
fns.map(f => f()) // [3, 3, 3] — не то, чего ждали
\`\`\`

Реализуйте \`makeIndexGetters(n)\`, возвращающую массив из \`n\` функций, где
\`i\`-я функция возвращает свой индекс \`i\`.

\`\`\`js
const getters = makeIndexGetters(3)
getters[0]() // 0
getters[2]() // 2
\`\`\``,
      starterCode: `function makeIndexGetters(n) {
  const result = []
  for (var i = 0; i < n; i++) {
    // Ваш код здесь
  }
  return result
}
`,
      solutionCode: `function makeIndexGetters(n) {
  const result = []
  for (let i = 0; i < n; i++) {
    result.push(function () {
      return i
    })
  }
  return result
}
`,
      solutionNotes: `\`let\` в заголовке цикла создаёт **новую** привязку на каждой итерации — каждое
замыкание получает свою копию \`i\`. Это самое короткое решение.

До появления \`let\` тот же эффект получали через IIFE:

\`\`\`js
for (var i = 0; i < n; i++) {
  result.push((function (index) {
    return function () { return index }
  })(i))
}
\`\`\`

Суть одна: значение нужно зафиксировать в отдельной области видимости.`,
      hints: [
        'var создаёт одну переменную на всю функцию, let — новую на каждую итерацию.',
        'Если менять цикл нельзя, зафиксируйте индекс через IIFE.',
      ],
      testCode: `test('каждая функция знает свой индекс', function () {
  const getters = makeIndexGetters(3)
  expect(getters.map(function (fn) { return fn() })).toEqual([0, 1, 2])
})

test('пустой массив при n = 0', function () {
  expect(makeIndexGetters(0)).toEqual([])
})

test('длина совпадает с n', function () {
  expect(makeIndexGetters(5)).toHaveLength(5)
})

test('функции независимы', function () {
  const getters = makeIndexGetters(4)
  expect(getters[3]()).toBe(3)
  expect(getters[0]()).toBe(0)
})`,
    },

    {
      slug: 'private-state-module',
      title: 'Приватное состояние',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['js', 'ts'],
      entryName: 'createAccount',
      tags: ['closures', 'patterns'],
      companies: ['tbank'],
      descriptionMd: `Реализуйте \`createAccount(initialBalance)\` — счёт с приватным балансом.

Возвращается объект с методами:

- \`deposit(amount)\` — пополняет счёт и возвращает новый баланс;
- \`withdraw(amount)\` — списывает и возвращает новый баланс;
- \`getBalance()\` — возвращает текущий баланс.

Правила:

- при попытке снять больше, чем есть, бросается \`Error\` с сообщением
  \`'Недостаточно средств'\`, баланс не меняется;
- сумма меньше или равная нулю — \`Error\` с сообщением \`'Некорректная сумма'\`;
- баланс недоступен снаружи: среди собственных свойств объекта его нет.`,
      starterCode: `function createAccount(initialBalance) {
  // Ваш код здесь
}
`,
      starterCodeTs: `type Account = {
  deposit(amount: number): number
  withdraw(amount: number): number
  getBalance(): number
}

function createAccount(initialBalance: number): Account {
  // Ваш код здесь
}
`,
      solutionCode: `function createAccount(initialBalance) {
  let balance = initialBalance

  function assertAmount(amount) {
    if (typeof amount !== 'number' || Number.isNaN(amount) || amount <= 0) {
      throw new Error('Некорректная сумма')
    }
  }

  return {
    deposit(amount) {
      assertAmount(amount)
      balance += amount
      return balance
    },
    withdraw(amount) {
      assertAmount(amount)
      if (amount > balance) throw new Error('Недостаточно средств')
      balance -= amount
      return balance
    },
    getBalance() {
      return balance
    },
  }
}
`,
      solutionCodeTs: `type Account = {
  deposit(amount: number): number
  withdraw(amount: number): number
  getBalance(): number
}

function createAccount(initialBalance: number): Account {
  let balance = initialBalance

  const assertAmount = (amount: number): void => {
    if (typeof amount !== 'number' || Number.isNaN(amount) || amount <= 0) {
      throw new Error('Некорректная сумма')
    }
  }

  return {
    deposit(amount: number): number {
      assertAmount(amount)
      balance += amount
      return balance
    },
    withdraw(amount: number): number {
      assertAmount(amount)
      if (amount > balance) throw new Error('Недостаточно средств')
      balance -= amount
      return balance
    },
    getBalance(): number {
      return balance
    },
  }
}
`,
      solutionNotes: `Баланс — обычная локальная переменная. Методы возвращаемого объекта замыкаются
на неё, а снаружи имени \`balance\` не существует: ни \`account.balance\`, ни
\`Object.keys(account)\` его не покажут. Это и есть модульный паттерн.

Проверку суммы стоит вынести в отдельную функцию: правило одно, а мест
применения два, и расходиться они не должны.

Порядок в \`withdraw\` важен: сначала проверки, потом изменение баланса. Если
сделать наоборот, исключение оставит счёт в испорченном состоянии.`,
      hints: [
        'Баланс — локальная переменная внутри createAccount, а не свойство объекта.',
        'Проверку суммы вынесите в отдельную функцию: она нужна и в deposit, и в withdraw.',
        'Сначала бросайте исключение, и только потом меняйте баланс.',
      ],
      testCode: `test('пополнение и списание', function () {
  const account = createAccount(100)
  expect(account.deposit(50)).toBe(150)
  expect(account.withdraw(30)).toBe(120)
  expect(account.getBalance()).toBe(120)
})

test('нельзя снять больше, чем есть', function () {
  const account = createAccount(100)
  expect(function () { account.withdraw(101) }).toThrow('Недостаточно средств')
  expect(account.getBalance()).toBe(100)
})

test('некорректная сумма отвергается', function () {
  const account = createAccount(100)
  expect(function () { account.deposit(0) }).toThrow('Некорректная сумма')
  expect(function () { account.withdraw(-5) }).toThrow('Некорректная сумма')
  expect(account.getBalance()).toBe(100)
})

test('баланс недоступен снаружи', function () {
  const account = createAccount(100)
  expect(Object.keys(account).indexOf('balance')).toBe(-1)
  expect(account.balance).toBeUndefined()
})

test('счета независимы', function () {
  const first = createAccount(10)
  const second = createAccount(20)
  first.deposit(5)
  expect(first.getBalance()).toBe(15)
  expect(second.getBalance()).toBe(20)
})`,
    },
  ],
}
