import type { TrainerTopicSeed } from './types'

/**
 * Тема 16. Прикладной TypeScript.
 *
 * В отличие от предыдущей темы, здесь код исполняется: решение должно и
 * пройти strict-проверку типов, и отработать на тестах. Именно так TypeScript и
 * спрашивают на собеседованиях по фронтенду — не «выведи тип», а «типизируй
 * рабочий код так, чтобы ошибки ловились на компиляции».
 */
export const typescriptApplied: TrainerTopicSeed = {
  slug: 'typescript-applied',
  title: 'TypeScript на практике',
  description: 'Type guards, размеченные объединения, брендированные типы, Result',
  category: 'typescript',
  icon: '🛡️',
  order: 16,
  tasks: [
    {
      slug: 'ts-type-guards',
      title: 'Пользовательские type guards',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['ts'],
      entryName: 'isUser',
      tags: ['type-level', 'generics'],
      companies: ['tbank', 'avito'],
      descriptionMd: `Данные из сети приходят как \`unknown\`. Напишите проверки, которые сужают тип во
время выполнения и сообщают об этом компилятору.

Реализуйте:

- \`isUser(value): value is User\` — объект с полями \`id: number\`, \`name: string\`
  и необязательным \`email: string\`;
- \`isArrayOf<T>(value, check): value is T[]\` — массив, каждый элемент которого
  проходит проверку \`check\`.

\`\`\`ts
type User = { id: number; name: string; email?: string }

const data: unknown = await response.json()

if (isArrayOf(data, isUser)) {
  data[0].name // тип известен компилятору
}
\`\`\`

Проверки должны быть честными: \`null\`, массив, число и объект с полями не тех
типов не должны проходить.`,
      starterCodeTs: `type User = { id: number; name: string; email?: string }

function isUser(value: unknown): value is User {
  // Ваш код здесь
  return false
}

function isArrayOf<T>(value: unknown, check: (item: unknown) => item is T): value is T[] {
  // Ваш код здесь
  return false
}
`,
      starterCode: `type User = { id: number; name: string; email?: string }

function isUser(value: unknown): value is User {
  // Ваш код здесь
  return false
}

function isArrayOf<T>(value: unknown, check: (item: unknown) => item is T): value is T[] {
  // Ваш код здесь
  return false
}
`,
      solutionCodeTs: `type User = { id: number; name: string; email?: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  // typeof null === 'object', поэтому проверка на null обязательна.
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isUser(value: unknown): value is User {
  if (!isRecord(value)) return false

  if (typeof value.id !== 'number' || Number.isNaN(value.id)) return false
  if (typeof value.name !== 'string') return false

  // Необязательное поле: либо отсутствует, либо нужного типа.
  if (value.email !== undefined && typeof value.email !== 'string') return false

  return true
}

function isArrayOf<T>(value: unknown, check: (item: unknown) => item is T): value is T[] {
  return Array.isArray(value) && value.every((item) => check(item))
}
`,
      solutionCode: `type User = { id: number; name: string; email?: string }

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null && !Array.isArray(value)
}

function isUser(value: unknown): value is User {
  if (!isRecord(value)) return false

  if (typeof value.id !== 'number' || Number.isNaN(value.id)) return false
  if (typeof value.name !== 'string') return false

  if (value.email !== undefined && typeof value.email !== 'string') return false

  return true
}

function isArrayOf<T>(value: unknown, check: (item: unknown) => item is T): value is T[] {
  return Array.isArray(value) && value.every((item) => check(item))
}
`,
      solutionNotes: `Возвращаемый тип \`value is User\` — это предикат типа. Компилятор доверяет ему
на слово и сужает тип в ветке \`if\`. Отсюда и ответственность: предикат обязан
проверять всё, что обещает, иначе типы будут врать.

Промежуточный \`isRecord\` нужен, чтобы обращаться к \`value.id\`: у \`unknown\` нет
свойств, и без сужения до \`Record<string, unknown>\` компилятор не даст читать
поля.

Три ловушки проверки объекта: \`typeof null === 'object'\`, массив — тоже объект,
а \`NaN\` — вполне себе \`number\`. Все три закрыты явно.

Необязательное поле проверяется как «либо \`undefined\`, либо нужного типа».
Проверка \`'email' in value\` здесь хуже: она не отличит отсутствующее поле от
поля со значением \`undefined\`.

\`isArrayOf\` — дженерик-предикат: он переиспользует любую другую проверку, и
типизация \`(item: unknown) => item is T\` переносит сужение на весь массив.

В боевом коде такие проверки обычно генерируют из схемы (Zod, Valibot) — писать
их руками дорого и легко рассинхронизировать с типом.`,
      hints: [
        'Предикат типа записывается как value is User в возвращаемом типе.',
        'Чтобы читать поля unknown, сначала сузьте его до Record<string, unknown>.',
        'Не забудьте про null, массив и NaN — все три проходят наивные проверки.',
        'Необязательное поле: либо undefined, либо нужного типа.',
      ],
      testCode: `test('валидный пользователь проходит', function () {
  expect(isUser({ id: 1, name: 'Аня' })).toBe(true)
  expect(isUser({ id: 1, name: 'Аня', email: 'a@b.ru' })).toBe(true)
})

test('null и массив не проходят', function () {
  expect(isUser(null)).toBe(false)
  expect(isUser([])).toBe(false)
})

test('примитивы не проходят', function () {
  expect(isUser(42)).toBe(false)
  expect(isUser('строка')).toBe(false)
  expect(isUser(undefined)).toBe(false)
})

test('неверные типы полей не проходят', function () {
  expect(isUser({ id: '1', name: 'Аня' })).toBe(false)
  expect(isUser({ id: 1, name: 42 })).toBe(false)
  expect(isUser({ id: NaN, name: 'Аня' })).toBe(false)
})

test('отсутствующие поля не проходят', function () {
  expect(isUser({ id: 1 })).toBe(false)
  expect(isUser({ name: 'Аня' })).toBe(false)
})

test('неверный тип необязательного поля не проходит', function () {
  expect(isUser({ id: 1, name: 'Аня', email: 42 })).toBe(false)
})

test('isArrayOf проверяет каждый элемент', function () {
  expect(isArrayOf([{ id: 1, name: 'Аня' }], isUser)).toBe(true)
  expect(isArrayOf([{ id: 1, name: 'Аня' }, { id: 'плохо' }], isUser)).toBe(false)
})

test('пустой массив проходит', function () {
  expect(isArrayOf([], isUser)).toBe(true)
})

test('не-массив не проходит', function () {
  expect(isArrayOf({ id: 1, name: 'Аня' }, isUser)).toBe(false)
  expect(isArrayOf(null, isUser)).toBe(false)
})`,
    },

    {
      slug: 'ts-discriminated-union',
      title: 'Размеченные объединения',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['ts'],
      entryName: 'describeState',
      tags: ['type-level'],
      companies: ['ozon', 'tbank'],
      descriptionMd: `Состояние загрузки данных удобно описывать размеченным объединением — тогда
компилятор не даст обратиться к данным, пока они не загружены.

Опишите тип \`RequestState\` с вариантами:

- \`{ status: 'idle' }\`;
- \`{ status: 'loading' }\`;
- \`{ status: 'success', data: string[] }\`;
- \`{ status: 'error', error: string }\`.

Реализуйте \`describeState(state)\`, возвращающую:

- \`'Ожидание'\` для \`idle\`;
- \`'Загрузка…'\` для \`loading\`;
- \`'Загружено записей: N'\` для \`success\`;
- \`'Ошибка: <текст>'\` для \`error\`.

**Требование:** обработка должна быть исчерпывающей. Добавьте в \`default\`
проверку, при которой добавление нового варианта в тип сломает компиляцию.`,
      starterCodeTs: `type RequestState = never

function describeState(state: RequestState): string {
  // Ваш код здесь
  return ''
}
`,
      starterCode: `function describeState(state) {
  // Ваш код здесь
  return ''
}
`,
      solutionCodeTs: `type RequestState =
  | { status: 'idle' }
  | { status: 'loading' }
  | { status: 'success'; data: string[] }
  | { status: 'error'; error: string }

function describeState(state: RequestState): string {
  switch (state.status) {
    case 'idle':
      return 'Ожидание'
    case 'loading':
      return 'Загрузка…'
    case 'success':
      // Здесь компилятор уже знает про поле data.
      return 'Загружено записей: ' + state.data.length
    case 'error':
      return 'Ошибка: ' + state.error
    default: {
      // Если разобраны все варианты, сюда попадает never.
      // Появится новый вариант — присваивание перестанет компилироваться.
      const exhaustive: never = state
      return exhaustive
    }
  }
}
`,
      solutionCode: `function describeState(state) {
  switch (state.status) {
    case 'idle':
      return 'Ожидание'
    case 'loading':
      return 'Загрузка…'
    case 'success':
      return 'Загружено записей: ' + state.data.length
    case 'error':
      return 'Ошибка: ' + state.error
    default:
      return ''
  }
}
`,
      solutionNotes: `Общее поле-дискриминант с литеральными типами (\`status\`) позволяет компилятору
сужать объединение в каждой ветке \`switch\`. В ветке \`'success'\` поле \`data\`
доступно, а в \`'error'\` — нет: обращение к нему не скомпилируется.

Проверка исчерпанности через \`const exhaustive: never = state\` — главный приём
этой задачи. После разбора всех вариантов тип \`state\` сужается до \`never\`, и
присваивание проходит. Стоит добавить в \`RequestState\` пятый вариант — и здесь
окажется не \`never\`, а этот новый вариант, что сломает компиляцию.

Смысл в том, что забытая ветка обнаруживается **в месте объявления нового
состояния**, а не в рантайме у пользователя. Для конечных автоматов, редьюсеров и
обработчиков событий это самый дешёвый способ не потерять случай.

Альтернатива — отдельная функция \`function assertNever(value: never): never\`,
которая ещё и бросает исключение в рантайме на случай данных, пришедших извне
типовой системы.

Такое моделирование состояния лучше набора булевых флагов (\`isLoading\`,
\`isError\`, \`data\`): невозможные комбинации вроде «загружается и есть ошибка»
просто не выражаются.`,
      hints: [
        'Общее поле с литеральными типами позволяет компилятору сужать объединение.',
        'В ветке default присвойте state переменной типа never — это и есть проверка исчерпанности.',
        'Если появится новый вариант, присваивание перестанет компилироваться.',
      ],
      testCode: `test('ожидание', function () {
  expect(describeState({ status: 'idle' })).toBe('Ожидание')
})

test('загрузка', function () {
  expect(describeState({ status: 'loading' })).toBe('Загрузка…')
})

test('успех', function () {
  expect(describeState({ status: 'success', data: ['a', 'b'] })).toBe('Загружено записей: 2')
})

test('пустой успешный результат', function () {
  expect(describeState({ status: 'success', data: [] })).toBe('Загружено записей: 0')
})

test('ошибка', function () {
  expect(describeState({ status: 'error', error: 'нет сети' })).toBe('Ошибка: нет сети')
})`,
    },

    {
      slug: 'ts-branded-types',
      title: 'Брендированные типы',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['ts'],
      entryName: 'toUserId',
      tags: ['type-level'],
      companies: ['tbank', 'sber'],
      descriptionMd: `\`UserId\` и \`OrderId\` — оба строки, и компилятор не мешает передать одно вместо
другого. Брендированные типы решают это без затрат в рантайме.

Реализуйте:

- типы \`UserId\` и \`OrderId\` — строки, несовместимые друг с другом;
- \`toUserId(value)\` — возвращает \`UserId\` или бросает \`TypeError\`, если строка
  пустая;
- \`toOrderId(value)\` — то же для \`OrderId\`;
- \`formatUser(id: UserId)\` — возвращает \`'Пользователь <id>'\`.

Компилятор обязан запретить:

\`\`\`ts
formatUser(toOrderId('1'))  // ошибка: OrderId не подходит
formatUser('произвольная')   // ошибка: обычная строка не подходит
\`\`\``,
      starterCodeTs: `type UserId = string
type OrderId = string

function toUserId(value: string): UserId {
  // Ваш код здесь
  return value
}

function toOrderId(value: string): OrderId {
  // Ваш код здесь
  return value
}

function formatUser(id: UserId): string {
  return 'Пользователь ' + id
}
`,
      starterCode: `function toUserId(value) {
  return value
}

function toOrderId(value) {
  return value
}

function formatUser(id) {
  return 'Пользователь ' + id
}
`,
      solutionCodeTs: `// Уникальный символ существует только на этапе компиляции:
// в рантайме это по-прежнему обычная строка.
declare const brand: unique symbol

type Brand<T, Name extends string> = T & { readonly [brand]: Name }

type UserId = Brand<string, 'UserId'>
type OrderId = Brand<string, 'OrderId'>

function toUserId(value: string): UserId {
  if (value.length === 0) throw new TypeError('UserId не может быть пустым')
  return value as UserId
}

function toOrderId(value: string): OrderId {
  if (value.length === 0) throw new TypeError('OrderId не может быть пустым')
  return value as OrderId
}

function formatUser(id: UserId): string {
  return 'Пользователь ' + id
}
`,
      solutionCode: `function toUserId(value) {
  if (value.length === 0) throw new TypeError('UserId не может быть пустым')
  return value
}

function toOrderId(value) {
  if (value.length === 0) throw new TypeError('OrderId не может быть пустым')
  return value
}

function formatUser(id) {
  return 'Пользователь ' + id
}
`,
      solutionNotes: `Система типов TypeScript структурная: два типа совместимы, если совпадает их
структура. Поэтому \`type UserId = string\` не даёт никакой защиты — это буквально
\`string\`.

Бренд добавляет к типу фантомное свойство, которого в рантайме не существует.
Структуры перестают совпадать, и подмена \`UserId\` на \`OrderId\` становится
ошибкой компиляции. Значение при этом остаётся обычной строкой: ни проверок, ни
обёрток, ни накладных расходов.

\`unique symbol\` в качестве ключа гарантирует, что такое свойство невозможно
создать случайно.

Приведение \`value as UserId\` внутри конструктора — единственное место, где
система типов обходится. Поэтому вся валидация должна быть именно здесь: это
дверь, через которую значение входит в типизированный мир.

Практический эффект: перепутать местами идентификатор пользователя и заказа в
вызове функции становится невозможно. Тот же приём применяют к валидированным
email, положительным числам, отформатированным датам.`,
      hints: [
        'Типы в TypeScript структурные: type UserId = string не даёт никакой защиты.',
        'Добавьте к типу фантомное свойство с уникальным символом.',
        'Приведение as делайте только внутри функции-конструктора, там же и валидируйте.',
      ],
      typeHarness: `declare const userIdValue: UserId
declare const orderIdValue: OrderId

// Свой тип принимается
type ok = Expect<Equal<ReturnType<typeof formatUser>, string>>

// @ts-expect-error — OrderId нельзя передать вместо UserId
formatUser(orderIdValue)

// @ts-expect-error — обычная строка тоже не подходит
formatUser('произвольная строка')
`,
      testCode: `test('конструктор возвращает значение', function () {
  expect(toUserId('u1')).toBe('u1')
  expect(toOrderId('o1')).toBe('o1')
})

test('в рантайме это обычные строки', function () {
  expect(typeof toUserId('u1')).toBe('string')
})

test('пустая строка отвергается', function () {
  expect(function () { toUserId('') }).toThrow(TypeError)
  expect(function () { toOrderId('') }).toThrow(TypeError)
})

test('formatUser форматирует идентификатор', function () {
  expect(formatUser(toUserId('u1'))).toBe('Пользователь u1')
})`,
    },

    {
      slug: 'ts-result-type',
      title: 'Result: ошибки без исключений',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['ts'],
      entryName: 'ok',
      tags: ['type-level', 'generics'],
      companies: ['avito', 'tbank'],
      descriptionMd: `Исключения не видны в сигнатуре функции: по типу нельзя понять, что она может
упасть. Тип \`Result\` делает ошибку частью возвращаемого значения.

Реализуйте:

- тип \`Result<T, E>\` — размеченное объединение успеха и ошибки;
- \`ok(value)\` и \`err(error)\` — конструкторы;
- \`isOk(result)\` и \`isErr(result)\` — сужающие проверки;
- \`mapResult(result, fn)\` — применяет \`fn\` к значению успеха, ошибку
  пробрасывает как есть;
- \`unwrapOr(result, fallback)\` — значение или запасное.

\`\`\`ts
const parsed = parseNumber('42')      // Result<number, string>

if (isOk(parsed)) parsed.value + 1    // компилятор знает про value
unwrapOr(parseNumber('абв'), 0)       // 0
\`\`\``,
      starterCodeTs: `type Result<T, E> = never

function ok<T>(value: T): Result<T, never> {
  // Ваш код здесь
  return null as never
}

function err<E>(error: E): Result<never, E> {
  // Ваш код здесь
  return null as never
}

function isOk<T, E>(result: Result<T, E>): boolean {
  // Ваш код здесь
  return false
}

function isErr<T, E>(result: Result<T, E>): boolean {
  // Ваш код здесь
  return false
}

function mapResult<T, E, U>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  // Ваш код здесь
  return null as never
}

function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
  // Ваш код здесь
  return fallback
}
`,
      starterCode: `function ok(value) { return null }
function err(error) { return null }
function isOk(result) { return false }
function isErr(result) { return false }
function mapResult(result, fn) { return null }
function unwrapOr(result, fallback) { return fallback }
`,
      solutionCodeTs: `type Result<T, E> = { ok: true; value: T } | { ok: false; error: E }

function ok<T>(value: T): Result<T, never> {
  return { ok: true, value }
}

function err<E>(error: E): Result<never, E> {
  return { ok: false, error }
}

// Предикат сужает тип: в ветке if компилятор знает про поле value.
function isOk<T, E>(result: Result<T, E>): result is { ok: true; value: T } {
  return result.ok
}

function isErr<T, E>(result: Result<T, E>): result is { ok: false; error: E } {
  return !result.ok
}

function mapResult<T, E, U>(result: Result<T, E>, fn: (value: T) => U): Result<U, E> {
  return result.ok ? ok(fn(result.value)) : result
}

function unwrapOr<T, E>(result: Result<T, E>, fallback: T): T {
  return result.ok ? result.value : fallback
}
`,
      solutionCode: `function ok(value) {
  return { ok: true, value: value }
}

function err(error) {
  return { ok: false, error: error }
}

function isOk(result) {
  return result.ok
}

function isErr(result) {
  return !result.ok
}

function mapResult(result, fn) {
  return result.ok ? ok(fn(result.value)) : result
}

function unwrapOr(result, fallback) {
  return result.ok ? result.value : fallback
}
`,
      solutionNotes: `Главная идея — ошибка становится частью типа. Сигнатура
\`Result<number, string>\` прямо говорит: функция может не дать числа. Исключения
такой информации не несут, и про \`try/catch\` легко забыть.

Дискриминант \`ok: boolean\` с литеральными типами \`true\`/\`false\` позволяет
компилятору сужать объединение. Обращение к \`result.value\` без проверки не
скомпилируется — именно этого мы и добиваемся.

\`Result<T, never>\` у \`ok\` означает «ошибки быть не может»: \`never\` в объединении
поглощается, и вариант с ошибкой исчезает. Это даёт точный вывод типов при
композиции.

В \`mapResult\` ошибка пробрасывается **тем же объектом** (\`return result\`), а не
пересоздаётся: лишний объект здесь ни к чему, а тип сходится, потому что вариант
ошибки одинаков у \`Result<T, E>\` и \`Result<U, E>\`.

Подход пришёл из Rust (\`Result\`) и Haskell (\`Either\`). Он уместен для ожидаемых
ошибок — неверный ввод, отсутствующая запись, отказ сети. Для действительно
исключительных ситуаций (нарушенный инвариант, кончилась память) исключения
по-прежнему уместнее: тащить их через все уровни вызова бессмысленно.`,
      hints: [
        'Result — размеченное объединение с булевым дискриминантом ok.',
        'isOk и isErr должны быть предикатами типа, иначе сужения не будет.',
        'В mapResult ошибку можно вернуть тем же объектом, не пересоздавая.',
      ],
      testCode: `test('ok создаёт успешный результат', function () {
  expect(ok(42)).toEqual({ ok: true, value: 42 })
})

test('err создаёт ошибку', function () {
  expect(err('сломалось')).toEqual({ ok: false, error: 'сломалось' })
})

test('isOk и isErr различают варианты', function () {
  expect(isOk(ok(1))).toBe(true)
  expect(isErr(ok(1))).toBe(false)
  expect(isOk(err('e'))).toBe(false)
  expect(isErr(err('e'))).toBe(true)
})

test('mapResult применяет функцию к успеху', function () {
  expect(mapResult(ok(2), function (value) { return value * 2 })).toEqual({ ok: true, value: 4 })
})

test('mapResult пробрасывает ошибку', function () {
  let calls = 0
  const result = mapResult(err('сломалось'), function () { calls += 1; return 1 })

  expect(result).toEqual({ ok: false, error: 'сломалось' })
  expect(calls).toBe(0)
})

test('mapResult меняет тип значения', function () {
  expect(mapResult(ok(1), function (value) { return String(value) }))
    .toEqual({ ok: true, value: '1' })
})

test('unwrapOr возвращает значение успеха', function () {
  expect(unwrapOr(ok(42), 0)).toBe(42)
})

test('unwrapOr возвращает запасное значение при ошибке', function () {
  expect(unwrapOr(err('сломалось'), 0)).toBe(0)
})

test('успешное значение undefined не подменяется', function () {
  expect(unwrapOr(ok(undefined), 'запасное')).toBeUndefined()
})`,
    },

    {
      slug: 'ts-generic-cache',
      title: 'Типизированный кэш с ключами',
      difficulty: 'hard',
      checkMode: 'unit',
      languages: ['ts'],
      entryName: 'createTypedCache',
      tags: ['type-level', 'generics'],
      companies: ['ozon'],
      descriptionMd: `Реализуйте \`createTypedCache<Schema>()\` — кэш, в котором тип значения зависит от
ключа.

\`\`\`ts
type CacheSchema = {
  user: { id: number; name: string }
  count: number
  tags: string[]
}

const cache = createTypedCache<CacheSchema>()

cache.set('count', 5)
cache.get('count')       // number | undefined
cache.set('count', 'а')  // ошибка компиляции
cache.get('нет')         // ошибка компиляции
\`\`\`

Методы: \`set(key, value)\`, \`get(key)\`, \`has(key)\`, \`delete(key)\`, \`clear()\`,
геттер \`size\`.

Компилятор должен запрещать чужие ключи и значения неверного типа.`,
      starterCodeTs: `function createTypedCache<Schema extends Record<string, unknown>>() {
  // Ваш код здесь
}
`,
      starterCode: `function createTypedCache() {
  // Ваш код здесь
}
`,
      solutionCodeTs: `type TypedCache<Schema extends Record<string, unknown>> = {
  // Дженерик-метод: K выводится из переданного ключа,
  // и тип значения подтягивается через Schema[K].
  set<K extends keyof Schema>(key: K, value: Schema[K]): void
  get<K extends keyof Schema>(key: K): Schema[K] | undefined
  has<K extends keyof Schema>(key: K): boolean
  delete<K extends keyof Schema>(key: K): boolean
  clear(): void
  readonly size: number
}

function createTypedCache<Schema extends Record<string, unknown>>(): TypedCache<Schema> {
  const storage = new Map<keyof Schema, Schema[keyof Schema]>()

  return {
    set(key, value) {
      storage.set(key, value)
    },
    get(key) {
      return storage.get(key) as Schema[typeof key] | undefined
    },
    has(key) {
      return storage.has(key)
    },
    delete(key) {
      return storage.delete(key)
    },
    clear() {
      storage.clear()
    },
    get size() {
      return storage.size
    },
  }
}
`,
      solutionCode: `function createTypedCache() {
  const storage = new Map()

  return {
    set: function (key, value) { storage.set(key, value) },
    get: function (key) { return storage.get(key) },
    has: function (key) { return storage.has(key) },
    delete: function (key) { return storage.delete(key) },
    clear: function () { storage.clear() },
    get size() { return storage.size },
  }
}
`,
      solutionNotes: `Связь ключа и типа значения обеспечивают **дженерик-методы**:
\`set<K extends keyof Schema>(key: K, value: Schema[K])\`. Параметр \`K\` выводится
из конкретного переданного ключа, и \`Schema[K]\` становится конкретным типом —
\`number\` для \`'count'\`, \`string[]\` для \`'tags'\`.

Если объявить методы как \`set(key: keyof Schema, value: Schema[keyof Schema])\`,
связь потеряется: значением станет объединение всех типов схемы, и
\`cache.set('count', 'строка')\` пройдёт.

Ограничение \`Schema extends Record<string, unknown>\` гарантирует, что схема —
объект со строковыми ключами.

Внутри одно приведение типа: \`Map\` не умеет связывать тип значения с ключом, и
эту связь держит только сигнатура. Такие приведения допустимы, когда они спрятаны
за типобезопасным интерфейсом и проверены тестами.

Тот же приём применяется к типизированным шинам событий, контейнерам
зависимостей и обёрткам над \`localStorage\`.`,
      hints: [
        'Методы должны быть дженериками: K выводится из конкретного ключа.',
        'Если написать key: keyof Schema, связь ключа и значения потеряется.',
        'Внутри Map придётся сделать приведение — это нормально, когда оно спрятано за типами.',
      ],
      typeHarness: `type CacheSchemaFixture = {
  user: { id: number; name: string }
  count: number
  tags: string[]
}

declare const typedCache: ReturnType<typeof createTypedCache<CacheSchemaFixture>>

type case1 = Expect<Equal<ReturnType<typeof typedCache.get<'count'>>, number | undefined>>
type case2 = Expect<Equal<ReturnType<typeof typedCache.get<'tags'>>, string[] | undefined>>

// @ts-expect-error — значение неверного типа
typedCache.set('count', 'строка')

// @ts-expect-error — ключа нет в схеме
typedCache.get('нет-такого-ключа')
`,
      testCode: `test('запись и чтение', function () {
  const cache = createTypedCache()
  cache.set('count', 5)

  expect(cache.get('count')).toBe(5)
})

test('отсутствующий ключ даёт undefined', function () {
  expect(createTypedCache().get('count')).toBeUndefined()
})

test('has и delete', function () {
  const cache = createTypedCache()
  cache.set('count', 1)

  expect(cache.has('count')).toBe(true)
  expect(cache.delete('count')).toBe(true)
  expect(cache.has('count')).toBe(false)
  expect(cache.delete('count')).toBe(false)
})

test('size и clear', function () {
  const cache = createTypedCache()
  cache.set('count', 1)
  cache.set('tags', ['a'])

  expect(cache.size).toBe(2)

  cache.clear()
  expect(cache.size).toBe(0)
})

test('значения разных типов сосуществуют', function () {
  const cache = createTypedCache()
  cache.set('count', 1)
  cache.set('user', { id: 1, name: 'Аня' })
  cache.set('tags', ['a', 'b'])

  expect(cache.get('count')).toBe(1)
  expect(cache.get('user')).toEqual({ id: 1, name: 'Аня' })
  expect(cache.get('tags')).toEqual(['a', 'b'])
})

test('перезапись значения', function () {
  const cache = createTypedCache()
  cache.set('count', 1)
  cache.set('count', 2)

  expect(cache.get('count')).toBe(2)
  expect(cache.size).toBe(1)
})`,
    },

    {
      slug: 'ts-form-utilities',
      title: 'Типы для формы',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['ts'],
      entryName: 'createFormState',
      tags: ['type-level', 'generics'],
      descriptionMd: `Опишите вспомогательные типы для работы с формой и реализуйте построитель
начального состояния.

Нужны типы:

- \`FormErrors<T>\` — у каждого поля исходного типа необязательная строка ошибки;
- \`FormTouched<T>\` — у каждого поля булев флаг «поле трогали»;
- \`FormState<T>\` — \`{ values: T; errors: FormErrors<T>; touched: FormTouched<T>; isValid: boolean }\`.

И функцию \`createFormState(values)\`, которая возвращает начальное состояние:
значения как переданы, ошибок нет, ни одно поле не тронуто, \`isValid\` — \`true\`.

\`\`\`ts
type LoginForm = { email: string; password: string }

const state = createFormState<LoginForm>({ email: '', password: '' })
state.touched.email  // boolean
state.errors.email   // string | undefined
\`\`\``,
      starterCodeTs: `type FormErrors<T> = T
type FormTouched<T> = T
type FormState<T> = T

function createFormState<T extends Record<string, unknown>>(values: T): FormState<T> {
  // Ваш код здесь
  return null as never
}
`,
      starterCode: `function createFormState(values) {
  return null
}
`,
      solutionCodeTs: `type FormErrors<T> = {
  [K in keyof T]?: string
}

type FormTouched<T> = {
  [K in keyof T]: boolean
}

type FormState<T> = {
  values: T
  errors: FormErrors<T>
  touched: FormTouched<T>
  isValid: boolean
}

function createFormState<T extends Record<string, unknown>>(values: T): FormState<T> {
  const touched = {} as FormTouched<T>

  for (const key of Object.keys(values) as Array<keyof T>) {
    touched[key] = false
  }

  return {
    values: { ...values },
    errors: {},
    touched,
    isValid: true,
  }
}
`,
      solutionCode: `function createFormState(values) {
  const touched = {}

  for (const key of Object.keys(values)) {
    touched[key] = false
  }

  return {
    values: Object.assign({}, values),
    errors: {},
    touched: touched,
    isValid: true,
  }
}
`,
      solutionNotes: `\`FormErrors<T>\` и \`FormTouched<T>\` — сопоставленные типы, которые сохраняют
набор ключей исходного типа, но заменяют типы значений. Ключи остаются
связанными с формой: переименуете поле — и ошибки с флагами перестанут
компилироваться в местах использования.

Модификатор \`?\` в \`FormErrors\` осмыслен: ошибки может не быть. В \`FormTouched\`
его нет — флаг есть всегда, просто равен \`false\`.

\`Object.keys\` возвращает \`string[]\`, а не \`Array<keyof T>\` — это осознанное
решение разработчиков TypeScript: у объекта могут оказаться лишние свойства
сверх описанных типом. Отсюда приведение при обходе.

Копия \`{ ...values }\` защищает состояние от изменений исходного объекта.

На той же паре сопоставленных типов построены Formik и React Hook Form.`,
      hints: [
        'FormErrors и FormTouched — сопоставленные типы по keyof T.',
        'В FormErrors нужен модификатор ?, в FormTouched — нет.',
        'Object.keys возвращает string[], для обхода понадобится приведение.',
      ],
      typeHarness: `type LoginFormFixture = { email: string; password: string }

type case1 = Expect<Equal<FormErrors<LoginFormFixture>, { email?: string; password?: string }>>
type case2 = Expect<Equal<FormTouched<LoginFormFixture>, { email: boolean; password: boolean }>>
type case3 = Expect<
  Equal<
    FormState<LoginFormFixture>,
    {
      values: LoginFormFixture
      errors: FormErrors<LoginFormFixture>
      touched: FormTouched<LoginFormFixture>
      isValid: boolean
    }
  >
>
`,
      testCode: `test('значения переносятся', function () {
  const state = createFormState({ email: 'a@b.ru', password: '123' })
  expect(state.values).toEqual({ email: 'a@b.ru', password: '123' })
})

test('ошибок изначально нет', function () {
  expect(createFormState({ email: '' }).errors).toEqual({})
})

test('ни одно поле не тронуто', function () {
  expect(createFormState({ email: '', password: '' }).touched)
    .toEqual({ email: false, password: false })
})

test('форма изначально валидна', function () {
  expect(createFormState({ email: '' }).isValid).toBe(true)
})

test('значения не связаны с исходным объектом', function () {
  const values = { email: 'a@b.ru' }
  const state = createFormState(values)
  values.email = 'подменили'

  expect(state.values.email).toBe('a@b.ru')
})

test('пустая форма', function () {
  const state = createFormState({})
  expect(state.touched).toEqual({})
  expect(state.isValid).toBe(true)
})`,
    },
  ],
}
