import type { TrainerTaskSeed, TrainerTopicSeed } from './types'

/**
 * Тема 15. Система типов TypeScript.
 *
 * Задачи в духе type-challenges: решением служит сам тип, а проверяет его
 * компилятор. Исполнения кода здесь нет вовсе — вердикт даёт tsc в строгом
 * режиме, ноль диагностик означает «решено».
 *
 * Хелперы Expect, Equal и NotEqual подставляются автоматически (см.
 * TYPE_HELPERS в src/server/trainer/typescript-service.mjs), объявлять их в
 * решении не нужно.
 */

/** Общие поля для всех задач темы: решаются только на TypeScript. */
function typeTask(
  task: Omit<TrainerTaskSeed, 'checkMode' | 'languages' | 'starterCode' | 'solutionCode'> & {
    starterCodeTs: string
    solutionCodeTs: string
  },
): TrainerTaskSeed {
  return {
    ...task,
    checkMode: 'types',
    languages: ['ts'],
    // Задачи режима `types` не исполняются, но поля стартового кода и решения
    // обязательны по схеме: дублируем в них TypeScript-версии.
    starterCode: task.starterCodeTs,
    solutionCode: task.solutionCodeTs,
  }
}

export const typescriptTypes: TrainerTopicSeed = {
  slug: 'typescript-types',
  title: 'TypeScript: система типов',
  description: 'Свои Pick, Omit, Readonly, DeepReadonly и другие утилитные типы',
  category: 'typescript',
  icon: '🔷',
  order: 15,
  tasks: [
    typeTask({
      slug: 'ts-my-pick',
      title: 'MyPick',
      difficulty: 'easy',
      tags: ['type-level', 'generics'],
      companies: ['yandex', 'avito'],
      sourceUrl: 'https://github.com/type-challenges/type-challenges',
      descriptionMd: `Реализуйте \`MyPick<T, K>\` — аналог встроенного \`Pick\`: тип с подмножеством
свойств исходного.

\`\`\`ts
type Todo = { title: string; description: string; completed: boolean }
type Preview = MyPick<Todo, 'title' | 'completed'>
// { title: string; completed: boolean }
\`\`\`

Ключи, которых нет в \`T\`, передавать нельзя — компилятор должен это запретить.`,
      starterCodeTs: `type MyPick<T, K> = never
`,
      solutionCodeTs: `type MyPick<T, K extends keyof T> = {
  [P in K]: T[P]
}
`,
      solutionNotes: `\`K extends keyof T\` — ограничение дженерика. Оно и запрещает передать
несуществующий ключ: без него \`MyPick<Todo, 'нет'>\` молча прошёл бы.

\`[P in K]\` — сопоставленный тип (mapped type): он перебирает объединение \`K\` и
строит по ключу \`P\` свойство с типом \`T[P]\`. Запись \`T[P]\` называется
индексированным доступом — это тип значения по ключу.

Из этих двух конструкций собрано большинство утилитных типов TypeScript.`,
      hints: [
        'Ограничьте K через extends keyof T — это запретит чужие ключи.',
        'Сопоставленный тип [P in K] перебирает объединение ключей.',
        'T[P] даёт тип значения по ключу.',
      ],
      typeHarness: `type TodoFixture = { title: string; description: string; completed: boolean }

type case1 = Expect<
  Equal<MyPick<TodoFixture, 'title'>, { title: string }>
>
type case2 = Expect<
  Equal<MyPick<TodoFixture, 'title' | 'completed'>, { title: string; completed: boolean }>
>
// @ts-expect-error — ключа нет в исходном типе
type case3 = MyPick<TodoFixture, 'нет-такого-ключа'>
`,
    }),

    typeTask({
      slug: 'ts-my-readonly',
      title: 'MyReadonly',
      difficulty: 'easy',
      tags: ['type-level'],
      descriptionMd: `Реализуйте \`MyReadonly<T>\` — аналог встроенного \`Readonly\`: все свойства
становятся доступными только для чтения.

\`\`\`ts
type Todo = MyReadonly<{ title: string; description: string }>

const todo: Todo = { title: 'a', description: 'b' }
todo.title = 'другое' // ошибка компиляции
\`\`\``,
      starterCodeTs: `type MyReadonly<T> = T
`,
      solutionCodeTs: `type MyReadonly<T> = {
  readonly [P in keyof T]: T[P]
}
`,
      solutionNotes: `Модификатор \`readonly\` ставится прямо в сопоставленном типе — он применяется к
каждому порождённому свойству.

Убрать модификатор можно префиксом \`-\`: \`-readonly [P in keyof T]: T[P]\` даст
обратную операцию, \`Mutable<T>\`. Так же работает \`-?\` для необязательности.

\`readonly\` действует только на этапе компиляции и только на верхний уровень:
вложенные объекты остаются изменяемыми. Рекурсивный вариант — в задаче
\`DeepReadonly\`.`,
      hints: [
        'Модификатор readonly ставится в самом сопоставленном типе.',
        'keyof T даёт объединение всех ключей.',
      ],
      typeHarness: `type ReadonlyFixture = { title: string; description: string }

type case1 = Expect<
  Equal<MyReadonly<ReadonlyFixture>, { readonly title: string; readonly description: string }>
>
type case2 = Expect<
  Equal<MyReadonly<{ a: number; b?: string }>, { readonly a: number; readonly b?: string }>
>
// Вложенные объекты остаются изменяемыми — это обычный Readonly, не глубокий.
type case3 = Expect<
  Equal<MyReadonly<{ nested: { x: number } }>, { readonly nested: { x: number } }>
>
`,
    }),

    typeTask({
      slug: 'ts-my-exclude',
      title: 'MyExclude',
      difficulty: 'easy',
      tags: ['type-level'],
      descriptionMd: `Реализуйте \`MyExclude<T, U>\` — исключение из объединения \`T\` тех членов, которые
входят в \`U\`.

\`\`\`ts
type Result = MyExclude<'a' | 'b' | 'c', 'a'>       // 'b' | 'c'
type Two = MyExclude<'a' | 'b' | 'c', 'a' | 'b'>    // 'c'
\`\`\``,
      starterCodeTs: `type MyExclude<T, U> = T
`,
      solutionCodeTs: `type MyExclude<T, U> = T extends U ? never : T
`,
      solutionNotes: `Ключ к решению — **дистрибутивность условных типов**. Когда проверяемый тип в
условном типе является голым параметром-дженериком (\`T extends ...\`), условие
применяется к каждому члену объединения по отдельности, а результаты снова
объединяются.

Поэтому \`MyExclude<'a' | 'b', 'a'>\` разворачивается в
\`('a' extends 'a' ? never : 'a') | ('b' extends 'a' ? never : 'b')\`, то есть в
\`never | 'b'\`. А \`never\` в объединении поглощается — отсюда \`'b'\`.

Дистрибутивность отключается, если обернуть параметр в кортеж:
\`[T] extends [U] ? ... : ...\` проверяет объединение целиком. Этот приём нужен в
задаче \`IsNever\`.`,
      hints: [
        'Условный тип с голым параметром дистрибутивен: применяется к каждому члену объединения.',
        'never в объединении просто исчезает.',
      ],
      typeHarness: `type case1 = Expect<Equal<MyExclude<'a' | 'b' | 'c', 'a'>, 'b' | 'c'>>
type case2 = Expect<Equal<MyExclude<'a' | 'b' | 'c', 'a' | 'b'>, 'c'>>
type case3 = Expect<Equal<MyExclude<string | number, number>, string>>
type case4 = Expect<Equal<MyExclude<'a', 'a'>, never>>
`,
    }),

    typeTask({
      slug: 'ts-tuple-to-object',
      title: 'TupleToObject',
      difficulty: 'easy',
      tags: ['type-level'],
      descriptionMd: `Реализуйте \`TupleToObject<T>\` — тип-объект, у которого ключи и значения взяты из
кортежа.

\`\`\`ts
const tuple = ['tesla', 'model 3'] as const
type Result = TupleToObject<typeof tuple>
// { tesla: 'tesla'; 'model 3': 'model 3' }
\`\`\`

Кортеж может содержать только строки и числа.`,
      starterCodeTs: `type TupleToObject<T extends readonly unknown[]> = T
`,
      solutionCodeTs: `type TupleToObject<T extends readonly (string | number)[]> = {
  [K in T[number]]: K
}
`,
      solutionNotes: `\`T[number]\` — индексированный доступ по типу \`number\`, который превращает кортеж
в объединение его элементов. Для \`readonly ['a', 'b']\` это даст \`'a' | 'b'\`.

Дальше обычный сопоставленный тип строит по каждому элементу свойство, где имя
и тип совпадают.

Ограничение \`readonly (string | number)[]\` обязательно: ключами объекта не могут
быть произвольные типы, и без ограничения компилятор справедливо возразит.

Для работы примера нужен \`as const\` — иначе массив выведется как \`string[]\`, и
\`T[number]\` даст просто \`string\` вместо конкретных литералов.`,
      hints: [
        'T[number] превращает кортеж в объединение его элементов.',
        'Ограничьте T массивом строк и чисел — иначе ключи не построить.',
      ],
      typeHarness: `type TupleFixture = readonly ['tesla', 'model 3']

type case1 = Expect<
  Equal<TupleToObject<TupleFixture>, { tesla: 'tesla'; 'model 3': 'model 3' }>
>
type case2 = Expect<Equal<TupleToObject<readonly [1, 2]>, { 1: 1; 2: 2 }>>
// @ts-expect-error — объект ключом быть не может
type case3 = TupleToObject<readonly [{ a: 1 }]>
`,
    }),

    typeTask({
      slug: 'ts-first-of-array',
      title: 'First и Last',
      difficulty: 'easy',
      tags: ['type-level'],
      descriptionMd: `Реализуйте два типа:

- \`First<T>\` — тип первого элемента кортежа;
- \`Last<T>\` — тип последнего.

Для пустого кортежа оба дают \`never\`.

\`\`\`ts
type A = First<[3, 2, 1]>  // 3
type B = Last<[3, 2, 1]>   // 1
type C = First<[]>         // never
\`\`\``,
      starterCodeTs: `type First<T extends readonly unknown[]> = never
type Last<T extends readonly unknown[]> = never
`,
      solutionCodeTs: `type First<T extends readonly unknown[]> = T extends readonly [infer Head, ...unknown[]]
  ? Head
  : never

type Last<T extends readonly unknown[]> = T extends readonly [...unknown[], infer Tail]
  ? Tail
  : never
`,
      solutionNotes: `\`infer\` объявляет переменную типа прямо внутри условия: «если \`T\` имеет вид
кортежа, начинающегося с чего-то, назови это \`Head\`».

Шаблон \`[infer Head, ...unknown[]]\` требует наличия хотя бы одного элемента,
поэтому пустой кортеж не подходит под условие и попадает в ветку \`never\` — то,
что нужно.

Rest-элемент в кортеже может стоять и в начале, и в конце — на этом построен
\`Last\`.

Вариант \`T[0]\` для \`First\` тоже работает, но на пустом кортеже даёт \`undefined\`,
а не \`never\`. Для \`Last\` аналог \`T[T['length'] extends 0 ? never : ...]\` куда
менее читаем, чем \`infer\`.`,
      hints: [
        'infer объявляет переменную типа внутри условия.',
        'Шаблон [infer Head, ...unknown[]] не подходит пустому кортежу — это и даёт never.',
        'Rest-элемент можно поставить и в начало: [...unknown[], infer Tail].',
      ],
      typeHarness: `type case1 = Expect<Equal<First<[3, 2, 1]>, 3>>
type case2 = Expect<Equal<First<[]>, never>>
type case3 = Expect<Equal<Last<[3, 2, 1]>, 1>>
type case4 = Expect<Equal<Last<[]>, never>>
type case5 = Expect<Equal<First<[undefined]>, undefined>>
`,
    }),

    typeTask({
      slug: 'ts-length-of-tuple',
      title: 'LengthOfTuple',
      difficulty: 'easy',
      tags: ['type-level'],
      descriptionMd: `Реализуйте \`LengthOfTuple<T>\` — длину кортежа на уровне типов.

\`\`\`ts
type A = LengthOfTuple<['a', 'b', 'c']> // 3
type B = LengthOfTuple<[]>              // 0
\`\`\`

Для обычного массива (\`string[]\`) длина неизвестна — тип должен дать \`number\`.`,
      starterCodeTs: `type LengthOfTuple<T extends readonly unknown[]> = number
`,
      solutionCodeTs: `type LengthOfTuple<T extends readonly unknown[]> = T['length']
`,
      solutionNotes: `У кортежа свойство \`length\` имеет **литеральный** тип: у \`['a', 'b']\` это \`2\`, а
не \`number\`. Индексированный доступ \`T['length']\` его и достаёт.

У обычного массива длина неизвестна на этапе компиляции, и \`T['length']\` даёт
\`number\` — ровно то поведение, которое требуется.

Этот приём — основа арифметики на уровне типов: чтобы «прибавить единицу», к
кортежу дописывают элемент и берут новую длину.`,
      hints: [
        'У кортежа свойство length имеет литеральный тип.',
        'Индексированный доступ T["length"] его достаёт.',
      ],
      typeHarness: `type case1 = Expect<Equal<LengthOfTuple<['a', 'b', 'c']>, 3>>
type case2 = Expect<Equal<LengthOfTuple<[]>, 0>>
type case3 = Expect<Equal<LengthOfTuple<string[]>, number>>
`,
    }),

    typeTask({
      slug: 'ts-my-awaited',
      title: 'MyAwaited',
      difficulty: 'medium',
      tags: ['type-level', 'async'],
      descriptionMd: `Реализуйте \`MyAwaited<T>\` — тип значения, в которое разрешится промис.
Вложенные промисы разворачиваются до конца.

\`\`\`ts
type A = MyAwaited<Promise<string>>            // string
type B = MyAwaited<Promise<Promise<number>>>   // number
type C = MyAwaited<number>                     // number
\`\`\``,
      starterCodeTs: `type MyAwaited<T> = T
`,
      solutionCodeTs: `type MyAwaited<T> = T extends PromiseLike<infer Value>
  ? MyAwaited<Value>
  : T
`,
      solutionNotes: `Рекурсия по условному типу разворачивает любую вложенность: пока \`T\` похож на
промис, достаём его значение и применяем себя снова.

\`PromiseLike\` вместо \`Promise\` берётся потому, что thenable-объект промисом не
является, но ведёт себя как он — и \`await\` его тоже разворачивает.

Базовый случай — не-промис: он возвращается как есть. Поэтому \`MyAwaited<number>\`
даёт \`number\`.

Рекурсивные условные типы разрешены начиная с TypeScript 4.1; до этого
приходилось разворачивать фиксированное число уровней вручную.`,
      hints: [
        'Условный тип может вызывать сам себя.',
        'PromiseLike покрывает и thenable-объекты, не только Promise.',
      ],
      typeHarness: `type case1 = Expect<Equal<MyAwaited<Promise<string>>, string>>
type case2 = Expect<Equal<MyAwaited<Promise<Promise<number>>>, number>>
type case3 = Expect<Equal<MyAwaited<number>, number>>
type case4 = Expect<Equal<MyAwaited<Promise<{ a: 1 }>>, { a: 1 }>>
`,
    }),

    typeTask({
      slug: 'ts-includes',
      title: 'Includes',
      difficulty: 'medium',
      tags: ['type-level'],
      descriptionMd: `Реализуйте \`Includes<T, U>\` — содержит ли кортеж \`T\` элемент типа \`U\`.

\`\`\`ts
type A = Includes<[1, 2, 3], 2>          // true
type B = Includes<[1, 2, 3], 4>          // false
type C = Includes<[boolean], true>       // false — типы должны совпадать точно
\`\`\`

Сравнение строгое: \`boolean\` и \`true\` — разные типы.`,
      starterCodeTs: `type Includes<T extends readonly unknown[], U> = false
`,
      solutionCodeTs: `type Includes<T extends readonly unknown[], U> = T extends readonly [
  infer Head,
  ...infer Rest,
]
  ? Equal<Head, U> extends true
    ? true
    : Includes<Rest, U>
  : false
`,
      solutionNotes: `Рекурсия по кортежу — стандартная схема: отделяем голову через
\`[infer Head, ...infer Rest]\`, проверяем её, в противном случае идём в хвост.
Пустой кортеж не подходит под шаблон и даёт \`false\` — это база рекурсии.

Сравнивать нужно через \`Equal\`, а не \`Head extends U\`. Условие \`extends\` — это
проверка совместимости, а не равенства: \`true extends boolean\` истинно, хотя
типы разные. Тест с \`Includes<[boolean], true>\` ловит именно эту ошибку.

Сам \`Equal\` устроен хитро — через сравнение двух дженерик-функций: компилятор
считает их идентичными только при полном совпадении типов. Хелпер подставляется
автоматически, писать его не нужно.`,
      hints: [
        'Отделяйте голову кортежа через [infer Head, ...infer Rest] и рекурсивно идите по хвосту.',
        'Пустой кортеж не подойдёт под шаблон — это и есть база рекурсии.',
        'Сравнивайте через Equal: extends проверяет совместимость, а не равенство.',
      ],
      typeHarness: `type case1 = Expect<Equal<Includes<[1, 2, 3], 2>, true>>
type case2 = Expect<Equal<Includes<[1, 2, 3], 4>, false>>
type case3 = Expect<Equal<Includes<[], 1>, false>>
type case4 = Expect<Equal<Includes<[boolean], true>, false>>
type case5 = Expect<Equal<Includes<['a', 'b'], 'b'>, true>>
`,
    }),

    typeTask({
      slug: 'ts-my-omit',
      title: 'MyOmit',
      difficulty: 'medium',
      tags: ['type-level'],
      companies: ['avito'],
      descriptionMd: `Реализуйте \`MyOmit<T, K>\` — аналог встроенного \`Omit\`: тип без указанных свойств.

\`\`\`ts
type Todo = { title: string; description: string; completed: boolean }
type Result = MyOmit<Todo, 'description'>
// { title: string; completed: boolean }
\`\`\`

Встроенные \`Omit\`, \`Pick\` и \`Exclude\` использовать нельзя.`,
      starterCodeTs: `type MyOmit<T, K extends keyof T> = T
`,
      solutionCodeTs: `type MyOmit<T, K extends keyof T> = {
  [P in keyof T as P extends K ? never : P]: T[P]
}
`,
      solutionNotes: `Конструкция \`as\` в сопоставленном типе переименовывает ключи (key remapping,
TypeScript 4.1). Её побочный, но крайне полезный эффект: если новое имя —
\`never\`, свойство из результата **выпадает**.

Отсюда и решение: оставляем имя как есть, а для исключаемых ключей отдаём
\`never\`.

Альтернатива — \`Pick<T, Exclude<keyof T, K>>\`, и именно так \`Omit\` реализован в
стандартной библиотеке. Вариант через \`as\` короче и не требует вспомогательных
типов.

Обратите внимание: и встроенный \`Omit\`, и эта реализация теряют модификаторы
\`readonly\`? Нет — сопоставленный тип по \`keyof T\` их сохраняет, в отличие от
некоторых наивных реализаций.`,
      hints: [
        'В сопоставленном типе есть переименование ключей: [P in keyof T as ...].',
        'Ключ с новым именем never выпадает из результата.',
      ],
      typeHarness: `type OmitFixture = { title: string; description: string; completed: boolean }

type case1 = Expect<
  Equal<MyOmit<OmitFixture, 'description'>, { title: string; completed: boolean }>
>
type case2 = Expect<
  Equal<MyOmit<OmitFixture, 'description' | 'completed'>, { title: string }>
>
// @ts-expect-error — ключа нет в исходном типе
type case3 = MyOmit<OmitFixture, 'нет-такого-ключа'>
`,
    }),

    typeTask({
      slug: 'ts-deep-readonly',
      title: 'DeepReadonly',
      difficulty: 'hard',
      tags: ['type-level'],
      companies: ['tbank'],
      descriptionMd: `Реализуйте \`DeepReadonly<T>\` — рекурсивный аналог \`Readonly\`: все свойства на
всех уровнях вложенности становятся доступными только для чтения.

\`\`\`ts
type Nested = { a: { b: { c: string } }; d: number }
type Result = DeepReadonly<Nested>
// { readonly a: { readonly b: { readonly c: string } }; readonly d: number }
\`\`\`

Функции и примитивы рекурсией не затрагиваются.`,
      starterCodeTs: `type DeepReadonly<T> = T
`,
      solutionCodeTs: `type DeepReadonly<T> = T extends (...args: never[]) => unknown
  ? T
  : T extends object
    ? { readonly [P in keyof T]: DeepReadonly<T[P]> }
    : T
`,
      solutionNotes: `Порядок проверок принципиален. Функция в TypeScript — это \`object\`, и без
отдельной ветки она превратилась бы в объект со своими служебными свойствами
(\`call\`, \`apply\`, \`bind\`), доступными только для чтения. Вызвать такой тип уже
нельзя.

Сигнатура \`(...args: never[]) => unknown\` — самый широкий шаблон функции.
\`never[]\` в параметрах работает благодаря контрвариантности: под него подходит
функция с любыми аргументами.

Примитивы отсеиваются последней веткой: у них нет свойств, рекурсия по ним
бессмысленна.

Рекурсия идёт через \`DeepReadonly<T[P]>\` — каждое значение обрабатывается тем же
типом.

Практическая оговорка: \`Map\`, \`Set\` и массивы этот тип обработает как обычные
объекты. Для полноценной иммутабельности их нужно обрабатывать отдельно —
\`ReadonlyMap\`, \`ReadonlySet\`, \`readonly T[]\`.`,
      hints: [
        'Функцию надо проверить ДО object — иначе она превратится в объект со служебными свойствами.',
        'Самый широкий шаблон функции — (...args: never[]) => unknown.',
        'Примитивы возвращайте как есть.',
      ],
      typeHarness: `type DeepFixture = { a: { b: { c: string } }; d: number }

type case1 = Expect<
  Equal<
    DeepReadonly<DeepFixture>,
    { readonly a: { readonly b: { readonly c: string } }; readonly d: number }
  >
>
type case2 = Expect<Equal<DeepReadonly<string>, string>>
type case3 = Expect<Equal<DeepReadonly<() => void>, () => void>>
type case4 = Expect<
  Equal<DeepReadonly<{ fn: (x: number) => string }>, { readonly fn: (x: number) => string }>
>
`,
    }),

    typeTask({
      slug: 'ts-my-parameters',
      title: 'MyParameters и MyReturnType',
      difficulty: 'medium',
      tags: ['type-level'],
      descriptionMd: `Реализуйте два типа:

- \`MyParameters<T>\` — кортеж типов аргументов функции;
- \`MyReturnType<T>\` — тип возвращаемого значения.

\`\`\`ts
function example(a: string, b: number): boolean { return true }

type A = MyParameters<typeof example>  // [a: string, b: number]
type B = MyReturnType<typeof example>  // boolean
\`\`\`

Встроенные \`Parameters\` и \`ReturnType\` использовать нельзя.`,
      starterCodeTs: `type MyParameters<T> = never
type MyReturnType<T> = never
`,
      solutionCodeTs: `type MyParameters<T extends (...args: never[]) => unknown> = T extends (
  ...args: infer Args
) => unknown
  ? Args
  : never

type MyReturnType<T extends (...args: never[]) => unknown> = T extends (
  ...args: never[]
) => infer Return
  ? Return
  : never
`,
      solutionNotes: `Оба типа строятся одинаково: сопоставляем \`T\` с шаблоном функции и вытаскиваем
нужную часть через \`infer\`.

В \`MyParameters\` выводятся аргументы, а возвращаемое значение помечено как
\`unknown\` — оно не важно. В \`MyReturnType\` наоборот.

Имена параметров в результате сохраняются: \`[a: string, b: number]\` — это
кортеж с метками. На совместимость типов метки не влияют, но подсказки
в редакторе от них читаются гораздо лучше.

Ограничение \`T extends (...args: never[]) => unknown\` не даёт передать
не-функцию. Без него тип формально работал бы, но ошибка обнаруживалась бы
позже и в менее понятном месте.`,
      hints: [
        'Сопоставьте T с шаблоном функции и выведите нужную часть через infer.',
        'Ненужную часть шаблона помечайте unknown или never[].',
      ],
      typeHarness: `type FnFixture = (a: string, b: number) => boolean

type case1 = Expect<Equal<MyParameters<FnFixture>, [a: string, b: number]>>
type case2 = Expect<Equal<MyReturnType<FnFixture>, boolean>>
type case3 = Expect<Equal<MyParameters<() => void>, []>>
type case4 = Expect<Equal<MyReturnType<() => void>, void>>
`,
    }),

    typeTask({
      slug: 'ts-concat-push',
      title: 'Concat и Push',
      difficulty: 'easy',
      tags: ['type-level'],
      descriptionMd: `Реализуйте два типа для кортежей:

- \`Concat<T, U>\` — объединение двух кортежей;
- \`Push<T, U>\` — кортеж с добавленным в конец элементом.

\`\`\`ts
type A = Concat<[1, 2], [3, 4]>  // [1, 2, 3, 4]
type B = Push<[1, 2], 3>         // [1, 2, 3]
\`\`\``,
      starterCodeTs: `type Concat<T extends readonly unknown[], U extends readonly unknown[]> = T
type Push<T extends readonly unknown[], U> = T
`,
      solutionCodeTs: `type Concat<T extends readonly unknown[], U extends readonly unknown[]> = [...T, ...U]
type Push<T extends readonly unknown[], U> = [...T, U]
`,
      solutionNotes: `Spread работает и на уровне типов: \`[...T, ...U]\` раскрывает оба кортежа в один.
Никакой рекурсии для этого не нужно.

\`Push\` — тот же приём, только вторым идёт одиночный элемент, а не кортеж.

На этой же конструкции строится \`Unshift\` (\`[U, ...T]\`) и арифметика на уровне
типов: длина кортежа играет роль числа, а добавление элемента — роль
прибавления единицы.`,
      hints: [
        'Spread-оператор работает и в типах кортежей.',
        'Рекурсия здесь не нужна.',
      ],
      typeHarness: `type case1 = Expect<Equal<Concat<[1, 2], [3, 4]>, [1, 2, 3, 4]>>
type case2 = Expect<Equal<Concat<[], []>, []>>
type case3 = Expect<Equal<Push<[1, 2], 3>, [1, 2, 3]>>
type case4 = Expect<Equal<Push<[], 1>, [1]>>
type case5 = Expect<Equal<Concat<['a'], [1]>, ['a', 1]>>
`,
    }),

    typeTask({
      slug: 'ts-is-never-union',
      title: 'IsNever и IsUnion',
      difficulty: 'hard',
      tags: ['type-level'],
      descriptionMd: `Реализуйте два типа-предиката:

- \`IsNever<T>\` — является ли \`T\` типом \`never\`;
- \`IsUnion<T>\` — является ли \`T\` объединением из двух и более членов.

\`\`\`ts
type A = IsNever<never>          // true
type B = IsNever<undefined>      // false
type C = IsUnion<'a' | 'b'>      // true
type D = IsUnion<'a'>            // false
type E = IsUnion<never>          // false
\`\`\`

Обе задачи требуют понимания того, как \`never\` и объединения ведут себя в
условных типах.`,
      starterCodeTs: `type IsNever<T> = false
type IsUnion<T> = false
`,
      solutionCodeTs: `// Кортеж вокруг параметра отключает дистрибутивность: без него
// условный тип с never не вычислился бы вовсе.
type IsNever<T> = [T] extends [never] ? true : false

// Copy сохраняет исходное объединение целиком, пока T распределяется
// по членам: если распределённый член не совпал с целым — это объединение.
type IsUnion<T, Copy = T> = [T] extends [never]
  ? false
  : T extends unknown
    ? [Copy] extends [T]
      ? false
      : true
    : never
`,
      solutionNotes: `**IsNever.** Наивное \`T extends never ? true : false\` не работает: \`never\` — это
пустое объединение, а дистрибутивный условный тип по пустому объединению даёт
\`never\`, а не \`true\`. Оборачивание в кортеж (\`[T] extends [never]\`) отключает
дистрибутивность, и сравнение выполняется для типа целиком.

**IsUnion.** Приём с «копией» — классический. Параметр \`Copy\` по умолчанию равен
\`T\`, но в момент, когда \`T extends unknown\` распределяет \`T\` по членам, \`Copy\`
остаётся исходным объединением целиком. Дальше сравниваем: если распределённый
член (например, \`'a'\`) не вмещает в себя всю копию (\`'a' | 'b'\`), значит членов
было несколько.

\`T extends unknown\` здесь не проверка, а способ включить дистрибутивность:
условие истинно всегда.

Случай \`never\` обрабатывается отдельно, потому что для него дистрибутивная
ветка не выполнится ни разу и результат оказался бы \`never\` вместо \`false\`.`,
      hints: [
        'Кортеж вокруг параметра отключает дистрибутивность условного типа.',
        'never — это пустое объединение, поэтому дистрибутивный условный тип по нему даёт never.',
        'Чтобы сравнить член объединения с целым, сохраните целое во втором параметре по умолчанию.',
      ],
      typeHarness: `type case1 = Expect<Equal<IsNever<never>, true>>
type case2 = Expect<Equal<IsNever<undefined>, false>>
type case3 = Expect<Equal<IsNever<null>, false>>
type case4 = Expect<Equal<IsNever<[]>, false>>

type case5 = Expect<Equal<IsUnion<'a' | 'b'>, true>>
type case6 = Expect<Equal<IsUnion<'a'>, false>>
type case7 = Expect<Equal<IsUnion<never>, false>>
type case8 = Expect<Equal<IsUnion<string | number>, true>>
`,
    }),

    typeTask({
      slug: 'ts-replace-keys',
      title: 'ReplaceKeys',
      difficulty: 'hard',
      tags: ['type-level'],
      descriptionMd: `Реализуйте \`ReplaceKeys<T, K, Replacements>\` — замену типов указанных ключей в
объединении объектов.

- \`T\` — объединение типов-объектов;
- \`K\` — ключи, подлежащие замене;
- \`Replacements\` — объект с новыми типами.

Если в объекте есть ключ из \`K\`, но в \`Replacements\` его нет, тип ключа
становится \`never\`.

\`\`\`ts
type A = { name: string; type: string }
type B = { name: string; gender: string }

type Result = ReplaceKeys<A | B, 'name', { name: number }>
// { name: number; type: string } | { name: number; gender: string }
\`\`\``,
      starterCodeTs: `type ReplaceKeys<T, K, Replacements> = T
`,
      solutionCodeTs: `type ReplaceKeys<T, K, Replacements> = T extends unknown
  ? {
      [P in keyof T]: P extends K
        ? P extends keyof Replacements
          ? Replacements[P]
          : never
        : T[P]
    }
  : never
`,
      solutionNotes: `\`T extends unknown\` включает дистрибутивность: сопоставленный тип применяется к
каждому члену объединения по отдельности, и результат снова собирается в
объединение. Без этой обёртки сопоставленный тип по объединению схлопнул бы его
в один объект с общими ключами.

Внутри — двойная проверка. Сначала: входит ли ключ в \`K\`? Если нет, тип остаётся
прежним. Если да — есть ли для него замена в \`Replacements\`? Если нет, по
условию задачи тип становится \`never\`.

Ветка \`: never\` во внешнем условном типе недостижима (\`unknown\` подходит всему),
но синтаксически обязательна.

Практический смысл — подмена типов полей в уже существующем контракте, например
замена \`Date\` на \`string\` в типе, приходящем из API.`,
      hints: [
        'T extends unknown включает дистрибутивность по объединению.',
        'Нужны две вложенные проверки: входит ли ключ в K и есть ли для него замена.',
        'Ключ из K без замены должен стать never.',
      ],
      typeHarness: `type NodeA = { name: string; type: string }
type NodeB = { name: string; gender: string }

type case1 = Expect<
  Equal<
    ReplaceKeys<NodeA | NodeB, 'name', { name: number }>,
    { name: number; type: string } | { name: number; gender: string }
  >
>
type case2 = Expect<
  Equal<
    ReplaceKeys<NodeA, 'name' | 'type', { name: number }>,
    { name: number; type: never }
  >
>
type case3 = Expect<Equal<ReplaceKeys<NodeA, 'нет', { name: number }>, NodeA>>
`,
    }),

    typeTask({
      slug: 'ts-get-optional',
      title: 'GetOptional и GetRequired',
      difficulty: 'hard',
      tags: ['type-level'],
      descriptionMd: `Реализуйте два типа:

- \`GetOptional<T>\` — только необязательные свойства;
- \`GetRequired<T>\` — только обязательные.

\`\`\`ts
type Props = { a: number; b?: string; c: boolean; d?: null }

type A = GetOptional<Props> // { b?: string; d?: null }
type B = GetRequired<Props> // { a: number; c: boolean }
\`\`\`

Модификатор \`?\` в результате сохраняется.`,
      starterCodeTs: `type GetOptional<T> = T
type GetRequired<T> = T
`,
      solutionCodeTs: `// Свойство необязательно, если тип с этим ключом и тип без него
// после удаления необязательности перестают совпадать.
type IsOptionalKey<T, K extends keyof T> = Equal<Pick<T, K>, Required<Pick<T, K>>> extends true
  ? false
  : true

type GetOptional<T> = {
  [P in keyof T as IsOptionalKey<T, P> extends true ? P : never]: T[P]
}

type GetRequired<T> = {
  [P in keyof T as IsOptionalKey<T, P> extends true ? never : P]: T[P]
}
`,
      solutionNotes: `Определить необязательность ключа напрямую нельзя — модификатор \`?\` не
выражается условием. Приём такой: берём тип из одного свойства (\`Pick<T, K>\`) и
сравниваем его с тем же типом, из которого \`Required\` убрал необязательность.
Если типы разошлись, значит \`?\` там был.

Сравнение \`undefined extends T[K]\` для этого не годится: у свойства
\`b: string | undefined\` (обязательного, но допускающего \`undefined\`) оно тоже
истинно, хотя \`?\` там нет. Разница между \`b?: string\` и \`b: string | undefined\`
тонкая, но реальная: первое можно не указывать вовсе, второе — обязательно.

Фильтрация идёт через переименование ключей: \`never\` в позиции имени убирает
свойство из результата.

Модификатор \`?\` сохраняется автоматически: сопоставленный тип по \`keyof T\` без
явного \`-?\` переносит модификаторы исходных свойств.`,
      hints: [
        'Наличие "?" нельзя проверить напрямую — сравните Pick<T, K> с Required<Pick<T, K>>.',
        'Проверка undefined extends T[K] ошибётся на свойстве вида b: string | undefined.',
        'Фильтруйте ключи через переименование: never убирает свойство.',
      ],
      typeHarness: `type PropsFixture = { a: number; b?: string; c: boolean; d?: null }

type case1 = Expect<Equal<GetOptional<PropsFixture>, { b?: string; d?: null }>>
type case2 = Expect<Equal<GetRequired<PropsFixture>, { a: number; c: boolean }>>
// Все ключи обязательны — необязательных не осталось.
type case3 = Expect<Equal<GetOptional<{ a: number }>, {}>>
type case4 = Expect<Equal<GetRequired<{ a: string | undefined }>, { a: string | undefined }>>
`,
    }),
  ],
}
