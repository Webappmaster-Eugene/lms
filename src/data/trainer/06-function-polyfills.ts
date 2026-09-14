import { raw } from '@/lib/trainer/literal'
import type { TrainerTopicSeed } from './types'

/**
 * Тема 6. Полифиллы функций и оператора new.
 *
 * Здесь проверяют понимание того, как устроен вызов функции: что такое `this`,
 * откуда он берётся, что делает `new` и как работает цепочка прототипов.
 * Написать `bind` с поддержкой `new` умеют немногие — это и есть отсечка.
 */
export const functionPolyfills: TrainerTopicSeed = {
  slug: 'function-polyfills',
  title: 'Полифиллы функций и new',
  description: 'Свои call, apply, bind, Object.create, instanceof и оператор new',
  category: 'javascript',
  icon: '⚙️',
  order: 6,
  tasks: [
    {
      slug: 'my-call-apply',
      title: 'Свои call и apply',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'myCall',
      tags: ['polyfill', 'this'],
      companies: ['yandex', 'ozon'],
      descriptionMd: `Реализуйте \`myCall(fn, context, ...args)\` и \`myApply(fn, context, args)\` —
вызов функции с заданным \`this\`.

- \`myCall\` принимает аргументы списком, \`myApply\` — массивом;
- возвращается результат вызова функции;
- если контекст — \`null\` или \`undefined\`, используется \`globalThis\`;
- в \`myApply\` массив аргументов необязателен.

Использовать встроенные \`call\`, \`apply\` и \`bind\` нельзя — в этом вся задача.`,
      starterCode: `function myCall(fn, context, ...args) {
  // Ваш код здесь
}

function myApply(fn, context, args) {
  // Ваш код здесь
}
`,
      solutionCode: `function myApply(fn, context, args) {
  if (typeof fn !== 'function') {
    throw new TypeError('Первым аргументом должна быть функция')
  }

  const target = context === null || context === undefined ? globalThis : Object(context)

  // Уникальный ключ, чтобы не затереть существующее свойство объекта.
  const key = Symbol('myApply')
  target[key] = fn

  try {
    return target[key](...(args || []))
  } finally {
    delete target[key]
  }
}

function myCall(fn, context, ...args) {
  return myApply(fn, context, args)
}
`,
      solutionNotes: `Трюк один: \`this\` в обычной функции определяется тем, через какой объект её
вызвали. Значит, чтобы подменить контекст, функцию надо временно положить
свойством в нужный объект и вызвать «через точку».

Ключом берётся \`Symbol\`, а не строка: строковое имя могло бы совпасть с уже
существующим свойством и затереть его.

\`finally\` убирает временное свойство даже если функция бросила исключение —
иначе чужой объект остался бы загрязнён.

\`Object(context)\` приводит примитив к объекту-обёртке: положить свойство в
число напрямую нельзя. Так же поступает и настоящий \`call\` в нестрогом режиме.

\`myCall\` выражается через \`myApply\` — разница между ними только в форме
передачи аргументов.`,
      hints: [
        'this определяется способом вызова: положите функцию свойством в объект и вызовите через точку.',
        'Ключ временного свойства делайте символом, чтобы ничего не затереть.',
        'Убирать временное свойство надо в finally.',
      ],
      setupCode: `function whoAmI() { return this.name }
function greetWith(greeting, mark) { return greeting + ', ' + this.name + (mark || '') }
`,
      testCode: `test('myCall подменяет контекст', function () {
  expect(myCall(whoAmI, { name: 'Аня' })).toBe('Аня')
})

test('myCall передаёт аргументы', function () {
  expect(myCall(greetWith, { name: 'Аня' }, 'Привет', '!')).toBe('Привет, Аня!')
})

test('myApply принимает массив аргументов', function () {
  expect(myApply(greetWith, { name: 'Борис' }, ['Здравствуйте'])).toBe('Здравствуйте, Борис')
})

test('myApply без массива аргументов', function () {
  expect(myApply(whoAmI, { name: 'Вера' })).toBe('Вера')
})

test('объект не загрязняется после вызова', function () {
  const context = { name: 'Аня' }
  myCall(whoAmI, context)

  expect(Object.keys(context)).toEqual(['name'])
  expect(Object.getOwnPropertySymbols(context)).toHaveLength(0)
})

test('свойство убирается даже при исключении', function () {
  const context = { name: 'Аня' }
  function boom() { throw new Error('упало') }

  expect(function () { myCall(boom, context) }).toThrow('упало')
  expect(Object.getOwnPropertySymbols(context)).toHaveLength(0)
})

test('возвращается результат функции', function () {
  expect(myCall(function () { return 42 }, {})).toBe(42)
})`,
    },

    {
      slug: 'my-bind',
      title: 'Свой Function.prototype.bind',
      difficulty: 'hard',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'myBind',
      tags: ['polyfill', 'this'],
      companies: ['yandex', 'avito', 'sber', 'faang'],
      descriptionMd: `Реализуйте \`myBind(fn, context, ...boundArgs)\` — аналог
\`Function.prototype.bind\`.

Возвращённая функция должна:

- вызывать \`fn\` с контекстом \`context\`;
- подставлять \`boundArgs\` перед аргументами вызова (частичное применение);
- **при вызове через \`new\` игнорировать привязанный контекст** — созданный
  объект должен работать как обычный экземпляр, включая \`instanceof\`.

\`\`\`js
function Point(x, y) { this.x = x; this.y = y }
const BoundPoint = myBind(Point, { игнорируется: true }, 1)

const point = new BoundPoint(2)
point.x // 1
point.y // 2
point instanceof Point // true
\`\`\`

Встроенный \`bind\` использовать нельзя.`,
      starterCode: `function myBind(fn, context, ...boundArgs) {
  // Ваш код здесь
}
`,
      solutionCode: `function myBind(fn, context, ...boundArgs) {
  if (typeof fn !== 'function') {
    throw new TypeError('Первым аргументом должна быть функция')
  }

  function bound(...callArgs) {
    // Вызов через new: this уже указывает на свежий объект с нужным
    // прототипом, и привязанный контекст спецификация велит игнорировать.
    const isNew = this instanceof bound
    return fn.apply(isNew ? this : context, boundArgs.concat(callArgs))
  }

  // Экземпляры должны проходить instanceof по исходной функции,
  // поэтому прототип наследуется от неё.
  if (fn.prototype) {
    bound.prototype = Object.create(fn.prototype)
  }

  return bound
}
`,
      solutionNotes: `Проверка \`this instanceof bound\` — единственный способ изнутри функции понять,
вызвали её через \`new\` или обычным способом. При \`new\` движок создаёт объект с
прототипом \`bound.prototype\` и передаёт его как \`this\`.

Чтобы \`point instanceof Point\` было \`true\`, \`bound.prototype\` наследуется от
\`fn.prototype\` через \`Object.create\`. Присваивать напрямую
(\`bound.prototype = fn.prototype\`) нельзя: тогда правка прототипа связанной
функции поехала бы в исходную.

\`boundArgs.concat(callArgs)\` даёт частичное применение: привязанные аргументы
идут первыми.

Стрелочную функцию для \`bound\` использовать нельзя — у неё нет ни своего \`this\`,
ни \`prototype\`, и через \`new\` её не вызвать.`,
      hints: [
        'Отличить вызов через new можно проверкой this instanceof bound.',
        'bound.prototype должен наследоваться от fn.prototype через Object.create.',
        'Привязанные аргументы идут перед аргументами вызова.',
      ],
      setupCode: `function Point(x, y) {
  this.x = x
  this.y = y
}
Point.prototype.sum = function () { return this.x + this.y }

function describe() { return this.name + ':' + Array.prototype.slice.call(arguments).join(',') }
`,
      testCode: `test('контекст привязывается', function () {
  const bound = myBind(describe, { name: 'объект' })
  expect(bound()).toBe('объект:')
})

test('частичное применение', function () {
  const bound = myBind(describe, { name: 'объект' }, 'a', 'b')
  expect(bound('c')).toBe('объект:a,b,c')
})

test('привязанный контекст не переопределить повторным вызовом', function () {
  const bound = myBind(describe, { name: 'первый' })
  const result = bound.call({ name: 'второй' })
  expect(result).toBe('первый:')
})

test('вызов через new игнорирует привязанный контекст', function () {
  const BoundPoint = myBind(Point, { name: 'игнорируется' }, 1)
  const point = new BoundPoint(2)

  expect(point.x).toBe(1)
  expect(point.y).toBe(2)
})

test('instanceof работает по исходной функции', function () {
  const BoundPoint = myBind(Point, null, 1)
  const point = new BoundPoint(2)

  expect(point instanceof Point).toBe(true)
})

test('методы прототипа доступны экземпляру', function () {
  const BoundPoint = myBind(Point, null, 1)
  const point = new BoundPoint(2)

  expect(point.sum()).toBe(3)
})

test('прототип исходной функции не портится', function () {
  const BoundPoint = myBind(Point, null)
  BoundPoint.prototype.extra = true

  expect(Point.prototype.extra).toBeUndefined()
})

test('не-функция бросает TypeError', function () {
  expect(function () { myBind({}, null) }).toThrow(TypeError)
})`,
    },

    {
      slug: 'my-new',
      title: 'Свой оператор new',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'myNew',
      tags: ['polyfill', 'prototypes'],
      companies: ['yandex', 'sber'],
      descriptionMd: `Реализуйте \`myNew(Constructor, ...args)\` — то, что делает оператор \`new\`.

Шаги, которые нужно воспроизвести:

1. создать пустой объект;
2. связать его прототип с \`Constructor.prototype\`;
3. вызвать конструктор с этим объектом в роли \`this\`;
4. вернуть созданный объект — **кроме** случая, когда конструктор сам вернул
   объект: тогда возвращается он.

\`\`\`js
function Point(x) { this.x = x }
const point = myNew(Point, 5)

point.x                 // 5
point instanceof Point  // true
\`\`\`

Оператор \`new\` и \`Reflect.construct\` использовать нельзя.`,
      starterCode: `function myNew(Constructor, ...args) {
  // Ваш код здесь
}
`,
      solutionCode: `function myNew(Constructor, ...args) {
  if (typeof Constructor !== 'function') {
    throw new TypeError('Первым аргументом должен быть конструктор')
  }

  const instance = Object.create(Constructor.prototype)
  const result = Constructor.apply(instance, args)

  // Конструктор, вернувший объект, перекрывает созданный экземпляр.
  // Примитивное возвращаемое значение игнорируется.
  return result !== null && (typeof result === 'object' || typeof result === 'function')
    ? result
    : instance
}
`,
      solutionNotes: `\`Object.create(Constructor.prototype)\` делает сразу два шага: создаёт объект и
связывает его прототип. Именно поэтому \`instanceof\` потом работает.

Четвёртый шаг — то, о чём забывают. Если конструктор возвращает объект, \`new\`
отдаёт его вместо созданного. На этом построен паттерн «конструктор как фабрика»
и singleton через конструктор.

Примитивное возвращаемое значение при этом игнорируется: \`function F() { return 42 }\`
вызванная через \`new\` вернёт объект, а не число. \`typeof result === 'function'\`
в проверке тоже не лишний — функция считается объектом.

Проверка \`result !== null\` обязательна: \`typeof null === 'object'\`.`,
      hints: [
        'Object.create(Constructor.prototype) создаёт объект и сразу связывает прототип.',
        'Конструктор вызывается с созданным объектом в роли this.',
        'Если конструктор вернул объект — возвращается он; примитив игнорируется.',
      ],
      setupCode: `function Point(x, y) {
  this.x = x
  this.y = y
}
Point.prototype.sum = function () { return this.x + this.y }

function ReturnsObject() {
  this.ignored = true
  return { replaced: true }
}

function ReturnsPrimitive() {
  this.kept = true
  return 42
}
`,
      testCode: `test('создаёт объект с полями конструктора', function () {
  const point = myNew(Point, 1, 2)
  expect(point.x).toBe(1)
  expect(point.y).toBe(2)
})

test('прототип связан', function () {
  const point = myNew(Point, 1, 2)
  expect(point instanceof Point).toBe(true)
  expect(point.sum()).toBe(3)
})

test('возвращённый объект перекрывает экземпляр', function () {
  const result = myNew(ReturnsObject)
  expect(result).toEqual({ replaced: true })
  expect(result.ignored).toBeUndefined()
})

test('возвращённый примитив игнорируется', function () {
  const result = myNew(ReturnsPrimitive)
  expect(result.kept).toBe(true)
})

test('не-функция бросает TypeError', function () {
  expect(function () { myNew({}) }).toThrow(TypeError)
})`,
    },

    {
      slug: 'my-object-create',
      title: 'Свой Object.create',
      difficulty: 'easy',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'myObjectCreate',
      tags: ['polyfill', 'prototypes'],
      descriptionMd: `Реализуйте \`myObjectCreate(proto, properties)\` — создание объекта с заданным
прототипом.

- прототипом может быть объект или \`null\`;
- необязательный второй аргумент — дескрипторы свойств в формате
  \`Object.defineProperties\`;
- прототип, не являющийся объектом или \`null\`, вызывает \`TypeError\`.

\`\`\`js
const animal = { eat() { return 'ест' } }
const dog = myObjectCreate(animal)

dog.eat()                      // 'ест'
Object.getPrototypeOf(dog) === animal // true
\`\`\`

Встроенный \`Object.create\` использовать нельзя.`,
      starterCode: `function myObjectCreate(proto, properties) {
  // Ваш код здесь
}
`,
      solutionCode: `function myObjectCreate(proto, properties) {
  if (typeof proto !== 'object' && typeof proto !== 'function') {
    throw new TypeError('Прототипом может быть только объект или null')
  }

  // Классический приём: временный конструктор с нужным прототипом.
  function Temp() {}
  Temp.prototype = proto

  const instance = new Temp()

  // Object.create(null) даёт объект вообще без прототипа —
  // временный конструктор так не умеет, приходится снимать связь явно.
  if (proto === null) Object.setPrototypeOf(instance, null)

  if (properties !== undefined) Object.defineProperties(instance, properties)

  return instance
}
`,
      solutionNotes: `Приём с временным конструктором — то, как \`Object.create\` полифиллили до ES5.
\`new Temp()\` создаёт объект, прототипом которого становится \`Temp.prototype\`,
то есть переданный \`proto\`.

С \`null\` этот приём не работает: \`Temp.prototype = null\` движок игнорирует, и
экземпляр получает \`Object.prototype\`. Поэтому связь снимается отдельно.

Проверка \`typeof proto !== 'object'\` пропускает \`null\` намеренно —
\`typeof null === 'object'\`, и это как раз тот случай, когда известная странность
языка работает на нас.`,
      hints: [
        'Временный конструктор с Temp.prototype = proto даёт объект с нужным прототипом.',
        'Случай null придётся обработать отдельно: Temp.prototype = null движок проигнорирует.',
        'typeof null === "object" — проверка на объект пропустит null сама.',
      ],
      testCode: `test('прототип устанавливается', function () {
  const animal = { eat: function () { return 'ест' } }
  const dog = myObjectCreate(animal)

  expect(Object.getPrototypeOf(dog)).toBe(animal)
  expect(dog.eat()).toBe('ест')
})

test('собственных свойств нет', function () {
  const dog = myObjectCreate({ eat: function () {} })
  expect(Object.keys(dog)).toEqual([])
})

test('объект без прототипа', function () {
  const bare = myObjectCreate(null)
  expect(Object.getPrototypeOf(bare)).toBe(null)
  expect(bare.toString).toBeUndefined()
})

test('дескрипторы свойств применяются', function () {
  const object = myObjectCreate(null, {
    name: { value: 'Аня', enumerable: true, writable: false },
  })

  expect(object.name).toBe('Аня')
  expect(Object.keys(object)).toEqual(['name'])
})

test('некорректный прототип бросает TypeError', function () {
  expect(function () { myObjectCreate(42) }).toThrow(TypeError)
  expect(function () { myObjectCreate('строка') }).toThrow(TypeError)
})`,
    },

    {
      slug: 'my-instanceof',
      title: 'Свой instanceof',
      difficulty: 'easy',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'myInstanceOf',
      tags: ['polyfill', 'prototypes'],
      companies: ['ozon'],
      descriptionMd: `Реализуйте \`myInstanceOf(value, Constructor)\` — аналог оператора \`instanceof\`.

Оператор проверяет, встречается ли \`Constructor.prototype\` в цепочке прототипов
значения.

- примитивы всегда дают \`false\`;
- если \`Constructor\` не функция — \`TypeError\`;
- цепочка обходится до \`null\`.

\`\`\`js
myInstanceOf([], Array)   // true
myInstanceOf([], Object)  // true — Object есть в цепочке
myInstanceOf(42, Number)  // false — примитив
\`\`\`

Оператор \`instanceof\` использовать нельзя.`,
      starterCode: `function myInstanceOf(value, Constructor) {
  // Ваш код здесь
}
`,
      solutionCode: `function myInstanceOf(value, Constructor) {
  if (typeof Constructor !== 'function') {
    throw new TypeError('Правым операндом должна быть функция')
  }

  if (value === null || (typeof value !== 'object' && typeof value !== 'function')) {
    return false
  }

  const target = Constructor.prototype
  let proto = Object.getPrototypeOf(value)

  while (proto !== null) {
    if (proto === target) return true
    proto = Object.getPrototypeOf(proto)
  }

  return false
}
`,
      solutionNotes: `Оператор сравнивает не «тип», а конкретный объект-прототип: он идёт по цепочке
и ищет в ней \`Constructor.prototype\`.

Отсюда и знаменитое \`42 instanceof Number === false\`: примитив не объект, цепочки
прототипов у него нет. Обёртка \`new Number(42)\` — уже объект, и проверка пройдёт.

Отсюда же \`[] instanceof Object === true\`: \`Object.prototype\` стоит в конце почти
любой цепочки.

Функции проверяются наравне с объектами: \`function(){} instanceof Function\` — \`true\`.`,
      hints: [
        'Сравнивать нужно с Constructor.prototype, а не с самим конструктором.',
        'Цепочка обходится через Object.getPrototypeOf до null.',
        'Примитивы дают false сразу: цепочки прототипов у них нет.',
      ],
      cases: [
        { name: 'массив и Array', args: [[], raw('Array')], expected: true },
        { name: 'массив и Object', args: [[], raw('Object')], expected: true },
        { name: 'объект и Array', args: [{}, raw('Array')], expected: false },
        { name: 'примитив', args: [42, raw('Number')], expected: false },
        { name: 'null', args: [null, raw('Object')], expected: false },
        { name: 'дата и Date', args: [new Date(0), raw('Date')], expected: true, hidden: true },
      ],
      testCode: `test('цепочка наследования', function () {
  function Animal() {}
  function Dog() {}
  Dog.prototype = Object.create(Animal.prototype)

  const dog = new Dog()

  expect(myInstanceOf(dog, Dog)).toBe(true)
  expect(myInstanceOf(dog, Animal)).toBe(true)
  expect(myInstanceOf(dog, Object)).toBe(true)
})

test('объект без прототипа', function () {
  expect(myInstanceOf(Object.create(null), Object)).toBe(false)
})

test('не-функция справа бросает TypeError', function () {
  expect(function () { myInstanceOf({}, {}) }).toThrow(TypeError)
})

test('функция — тоже объект', function () {
  expect(myInstanceOf(function () {}, Function)).toBe(true)
})`,
    },

    {
      slug: 'my-object-assign',
      title: 'Свой Object.assign',
      difficulty: 'easy',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'myObjectAssign',
      tags: ['polyfill', 'objects'],
      descriptionMd: `Реализуйте \`myObjectAssign(target, ...sources)\` — поверхностное копирование
собственных перечисляемых свойств.

- цель **мутируется** и возвращается;
- копируются только собственные перечисляемые свойства (наследуемые — нет);
- копируются и строковые ключи, и символы;
- \`null\` и \`undefined\` среди источников пропускаются;
- \`null\` или \`undefined\` в роли цели — \`TypeError\`;
- источники применяются слева направо, последний выигрывает.

Встроенный \`Object.assign\` и spread использовать нельзя.`,
      starterCode: `function myObjectAssign(target, ...sources) {
  // Ваш код здесь
}
`,
      solutionCode: `function myObjectAssign(target, ...sources) {
  if (target === null || target === undefined) {
    throw new TypeError('Целью не может быть null или undefined')
  }

  const result = Object(target)

  for (const source of sources) {
    if (source === null || source === undefined) continue

    const from = Object(source)

    // Reflect.ownKeys отдаёт и строковые ключи, и символы —
    // Object.keys символы бы потерял.
    for (const key of Reflect.ownKeys(from)) {
      const descriptor = Object.getOwnPropertyDescriptor(from, key)
      if (descriptor && descriptor.enumerable) result[key] = from[key]
    }
  }

  return result
}
`,
      solutionNotes: `\`Object.keys\` здесь не подходит: он теряет символьные ключи. \`Reflect.ownKeys\`
отдаёт и те, и другие, а перечисляемость проверяется дескриптором.

Копирование идёт присваиванием (\`result[key] = ...\`), а не через
\`defineProperty\` — так работает и настоящий \`Object.assign\`. Практическое
следствие: геттер в источнике **вызывается**, и в цель попадает его значение,
а не сам геттер.

Копирование поверхностное: вложенные объекты остаются общими с источником.
Для независимой копии нужен \`deepClone\`.`,
      hints: [
        'Object.keys теряет символьные ключи — нужен Reflect.ownKeys.',
        'Перечисляемость проверяется через getOwnPropertyDescriptor.',
        'Цель мутируется и возвращается — новый объект создавать не нужно.',
      ],
      testCode: `test('копирует свойства', function () {
  expect(myObjectAssign({ a: 1 }, { b: 2 }, { c: 3 })).toEqual({ a: 1, b: 2, c: 3 })
})

test('последний источник выигрывает', function () {
  expect(myObjectAssign({ a: 1 }, { a: 2 }, { a: 3 })).toEqual({ a: 3 })
})

test('цель мутируется и возвращается', function () {
  const target = { a: 1 }
  const result = myObjectAssign(target, { b: 2 })

  expect(result).toBe(target)
  expect(target).toEqual({ a: 1, b: 2 })
})

test('null и undefined среди источников пропускаются', function () {
  expect(myObjectAssign({ a: 1 }, null, undefined, { b: 2 })).toEqual({ a: 1, b: 2 })
})

test('null в роли цели бросает TypeError', function () {
  expect(function () { myObjectAssign(null, { a: 1 }) }).toThrow(TypeError)
})

test('наследуемые свойства не копируются', function () {
  const proto = { inherited: true }
  const source = Object.create(proto)
  source.own = true

  expect(myObjectAssign({}, source)).toEqual({ own: true })
})

test('символьные ключи копируются', function () {
  const key = Symbol('ключ')
  const source = {}
  source[key] = 'значение'

  expect(myObjectAssign({}, source)[key]).toBe('значение')
})

test('неперечисляемые свойства не копируются', function () {
  const source = {}
  Object.defineProperty(source, 'hidden', { value: 1, enumerable: false })

  expect(myObjectAssign({}, source)).toEqual({})
})`,
    },
  ],
}
