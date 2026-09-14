import type { TrainerTopicSeed } from './types'

/**
 * Тема 3. Асинхронность.
 *
 * Свои реализации Promise.all/race/allSettled/any спрашивают почти на каждом
 * собеседовании уровня middle, а retry с экспоненциальной задержкой и очередь
 * с ограничением параллелизма — любимые задачи Озона и Т-Банка.
 *
 * Все таймеры в песочнице виртуальные, поэтому тесты на время детерминированы:
 * `await __clock.tick(ms)` двигает время, `await __clock.runAll()` доводит до
 * конца все запланированные таймеры.
 */
export const asyncTopic: TrainerTopicSeed = {
  slug: 'async',
  title: 'Асинхронность и Promise',
  description: 'Свои Promise.all и race, retry с backoff, очереди и ограничение параллелизма',
  category: 'javascript',
  icon: '⏳',
  order: 3,
  tasks: [
    {
      slug: 'my-promise-all',
      title: 'Свой Promise.all',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'promiseAll',
      tags: ['promise', 'async'],
      companies: ['yandex', 'ozon', 'avito', 'faang'],
      descriptionMd: `Реализуйте \`promiseAll(items)\` — аналог \`Promise.all\`.

- возвращает промис с массивом результатов **в порядке исходного массива**,
  независимо от порядка завершения;
- отклоняется первой же ошибкой;
- не-промисы в массиве считаются уже разрешёнными значениями;
- на пустом массиве немедленно разрешается пустым массивом.

Использовать сам \`Promise.all\` нельзя.`,
      starterCode: `function promiseAll(items) {
  // Ваш код здесь
}
`,
      solutionCode: `function promiseAll(items) {
  return new Promise((resolve, reject) => {
    const results = new Array(items.length)
    let settled = 0

    if (items.length === 0) {
      resolve(results)
      return
    }

    items.forEach((item, index) => {
      Promise.resolve(item).then((value) => {
        results[index] = value
        settled += 1
        if (settled === items.length) resolve(results)
      }, reject)
    })
  })
}
`,
      solutionNotes: `Порядок в результате задаётся индексом (\`results[index] = value\`), а не порядком
завершения — иначе быстрый третий промис оказался бы первым в массиве.

Счётчик \`settled\` нужен именно потому, что дырки в массиве не отличить от
записанных \`undefined\`: по \`results.length\` готовность не определить.

Пустой массив обрабатывается отдельно: \`forEach\` по нему ничего не вызовет, и без
этой ветки промис никогда бы не разрешился.

\`Promise.resolve(item)\` приводит к промису и обычные значения, и thenable-объекты.

Второй аргумент \`then\` в роли обработчика ошибки — это и есть «отклоняемся первой
ошибкой»: повторные вызовы \`reject\` уже ни на что не влияют, промис фиксируется
один раз.`,
      hints: [
        'Результат кладите по индексу, а не через push.',
        'Считайте завершившиеся отдельным счётчиком.',
        'Пустой массив нужно обработать до цикла.',
      ],
      setupCode: `// Отклонённый промис с уже привязанным пустым обработчиком.
// Без него незавершённое решение оставило бы отклонение без обработки, и среда
// сообщила бы об ошибке раньше, чем тест успел бы отработать.
function rejected(reason) {
  const promise = Promise.reject(reason)
  promise.catch(() => {})
  return promise
}
`,
      testCode: `test('результаты в порядке исходного массива', async function () {
  const slow = new Promise(function (resolve) { setTimeout(function () { resolve('медленный') }, 100) })
  const fast = Promise.resolve('быстрый')

  const promise = promiseAll([slow, fast, 'обычное значение'])
  await __clock.runAll()

  await expect(promise).resolves.toEqual(['медленный', 'быстрый', 'обычное значение'])
})

test('пустой массив', async function () {
  await expect(promiseAll([])).resolves.toEqual([])
})

test('отклоняется первой ошибкой', async function () {
  const promise = promiseAll([
    Promise.resolve(1),
    rejected(new Error('сломалось')),
    Promise.resolve(3),
  ])

  await expect(promise).rejects.toThrow('сломалось')
})

test('не-промисы разрешаются как значения', async function () {
  await expect(promiseAll([1, 2, 3])).resolves.toEqual([1, 2, 3])
})

test('undefined в результатах не ломает счёт', async function () {
  await expect(promiseAll([Promise.resolve(undefined), 2])).resolves.toEqual([undefined, 2])
})`,
    },

    {
      slug: 'my-promise-race',
      title: 'Свой Promise.race',
      difficulty: 'easy',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'promiseRace',
      tags: ['promise', 'async'],
      companies: ['ozon', 'avito'],
      descriptionMd: `Реализуйте \`promiseRace(items)\` — аналог \`Promise.race\`.

Возвращается промис, который повторяет судьбу **первого завершившегося**
элемента: разрешается его значением или отклоняется его ошибкой — что случится
раньше.

На пустом массиве промис остаётся в ожидании навсегда (так же ведёт себя
оригинал).

Использовать сам \`Promise.race\` нельзя.`,
      starterCode: `function promiseRace(items) {
  // Ваш код здесь
}
`,
      solutionCode: `function promiseRace(items) {
  return new Promise((resolve, reject) => {
    for (const item of items) {
      Promise.resolve(item).then(resolve, reject)
    }
  })
}
`,
      solutionNotes: `Вся суть — в том, что промис фиксируется один раз: сколько бы раз ни вызвали
\`resolve\` или \`reject\`, состояние меняет только первый вызов. Поэтому никаких
флагов «уже завершился» заводить не нужно.

Остальные промисы при этом продолжают выполняться — \`race\` их не отменяет.
Это частый источник недоразумений: если гонка нужна ради отмены запроса,
дополнительно потребуется \`AbortController\`.`,
      hints: [
        'Промис фиксируется первым вызовом resolve или reject — флаги не нужны.',
        'resolve и reject можно передать прямо в then как обработчики.',
      ],
      setupCode: `// Отклонённый промис с уже привязанным пустым обработчиком.
// Без него незавершённое решение оставило бы отклонение без обработки, и среда
// сообщила бы об ошибке раньше, чем тест успел бы отработать.
function rejected(reason) {
  const promise = Promise.reject(reason)
  promise.catch(() => {})
  return promise
}
`,
      testCode: `test('побеждает самый быстрый', async function () {
  const slow = new Promise(function (resolve) { setTimeout(function () { resolve('медленный') }, 100) })
  const fast = new Promise(function (resolve) { setTimeout(function () { resolve('быстрый') }, 10) })

  const promise = promiseRace([slow, fast])
  await __clock.runAll()

  await expect(promise).resolves.toBe('быстрый')
})

test('первая ошибка отклоняет результат', async function () {
  const slow = new Promise(function (resolve) { setTimeout(function () { resolve('поздно') }, 100) })
  const failing = new Promise(function (_resolve, reject) {
    setTimeout(function () { reject(new Error('упал первым')) }, 10)
  })
  failing.catch(function () {})

  const promise = promiseRace([slow, failing])
  await __clock.runAll()

  await expect(promise).rejects.toThrow('упал первым')
})

test('обычное значение выигрывает сразу', async function () {
  const slow = new Promise(function (resolve) { setTimeout(function () { resolve('медленный') }, 100) })
  await expect(promiseRace([slow, 'сразу'])).resolves.toBe('сразу')
})`,
    },

    {
      slug: 'my-promise-all-settled',
      title: 'Свой Promise.allSettled',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'promiseAllSettled',
      tags: ['promise', 'async'],
      companies: ['yandex', 'tbank'],
      descriptionMd: `Реализуйте \`promiseAllSettled(items)\` — аналог \`Promise.allSettled\`.

Промис **никогда не отклоняется**. Он разрешается массивом описаний в порядке
исходного массива:

- успех: \`{ status: 'fulfilled', value }\`;
- ошибка: \`{ status: 'rejected', reason }\`.

\`\`\`js
await promiseAllSettled([Promise.resolve(1), Promise.reject('нет')])
// [ { status: 'fulfilled', value: 1 }, { status: 'rejected', reason: 'нет' } ]
\`\`\`

Использовать сам \`Promise.allSettled\` нельзя.`,
      starterCode: `function promiseAllSettled(items) {
  // Ваш код здесь
}
`,
      solutionCode: `function promiseAllSettled(items) {
  return new Promise((resolve) => {
    const results = new Array(items.length)
    let settled = 0

    if (items.length === 0) {
      resolve(results)
      return
    }

    items.forEach((item, index) => {
      Promise.resolve(item).then(
        (value) => {
          results[index] = { status: 'fulfilled', value: value }
          settled += 1
          if (settled === items.length) resolve(results)
        },
        (reason) => {
          results[index] = { status: 'rejected', reason: reason }
          settled += 1
          if (settled === items.length) resolve(results)
        },
      )
    })
  })
}
`,
      solutionNotes: `Отличие от \`all\` ровно одно: обработчик ошибки не отклоняет общий промис, а
записывает описание и увеличивает тот же счётчик. Поэтому \`reject\` здесь не нужен
вовсе.

Из-за этого \`allSettled\` подходит там, где упавшая часть не должна ронять
остальное: параллельная загрузка независимых виджетов, батч-запросы, отправка
нескольких метрик.`,
      hints: [
        'Промис никогда не отклоняется — reject не понадобится.',
        'Счётчик увеличивается в обоих обработчиках, и успешном, и ошибочном.',
      ],
      setupCode: `// Отклонённый промис с уже привязанным пустым обработчиком.
// Без него незавершённое решение оставило бы отклонение без обработки, и среда
// сообщила бы об ошибке раньше, чем тест успел бы отработать.
function rejected(reason) {
  const promise = Promise.reject(reason)
  promise.catch(() => {})
  return promise
}
`,
      testCode: `test('успехи и ошибки в одном массиве', async function () {
  const promise = promiseAllSettled([
    Promise.resolve(1),
    rejected('нет'),
    3,
  ])

  await expect(promise).resolves.toEqual([
    { status: 'fulfilled', value: 1 },
    { status: 'rejected', reason: 'нет' },
    { status: 'fulfilled', value: 3 },
  ])
})

test('порядок сохраняется', async function () {
  const slow = new Promise(function (resolve) { setTimeout(function () { resolve('медленный') }, 100) })
  const promise = promiseAllSettled([slow, Promise.resolve('быстрый')])
  await __clock.runAll()

  const result = await promise
  expect(result[0].value).toBe('медленный')
  expect(result[1].value).toBe('быстрый')
})

test('пустой массив', async function () {
  await expect(promiseAllSettled([])).resolves.toEqual([])
})

test('все отклонены — промис всё равно разрешается', async function () {
  const promise = promiseAllSettled([rejected('a'), rejected('b')])
  await expect(promise).resolves.toEqual([
    { status: 'rejected', reason: 'a' },
    { status: 'rejected', reason: 'b' },
  ])
})`,
    },

    {
      slug: 'my-promise-any',
      title: 'Свой Promise.any',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'promiseAny',
      tags: ['promise', 'async'],
      descriptionMd: `Реализуйте \`promiseAny(items)\` — аналог \`Promise.any\`.

- разрешается значением **первого успешного** промиса;
- ошибки игнорируются, пока есть надежда на успех;
- если отклонились все, промис отклоняется ошибкой с сообщением
  \`'Все промисы отклонены'\` и свойством \`errors\` — массивом причин в порядке
  исходного массива;
- на пустом массиве отклоняется сразу той же ошибкой.

Использовать сам \`Promise.any\` нельзя.`,
      starterCode: `function promiseAny(items) {
  // Ваш код здесь
}
`,
      solutionCode: `function promiseAny(items) {
  return new Promise((resolve, reject) => {
    const errors = new Array(items.length)
    let rejected = 0

    function failAll() {
      const error = new Error('Все промисы отклонены')
      error.errors = errors
      reject(error)
    }

    if (items.length === 0) {
      failAll()
      return
    }

    items.forEach((item, index) => {
      Promise.resolve(item).then(resolve, (reason) => {
        errors[index] = reason
        rejected += 1
        if (rejected === items.length) failAll()
      })
    })
  })
}
`,
      solutionNotes: `\`any\` — зеркало \`all\`: там считали успехи и отклонялись первой ошибкой, здесь
считаем ошибки и разрешаемся первым успехом.

Причины собираются по индексу, чтобы в \`errors\` сохранился порядок исходного
массива — так в настоящем \`AggregateError\`.

Пустой массив у \`any\` отклоняется сразу: успеху взяться неоткуда. У \`all\`, наоборот,
пустой массив немедленно разрешается — доказывать нечего.`,
      hints: [
        'Это зеркало Promise.all: считайте отклонения, а не успехи.',
        'resolve можно передать прямо в then первым аргументом.',
        'Причины складывайте по индексу, чтобы сохранить порядок.',
      ],
      setupCode: `// Отклонённый промис с уже привязанным пустым обработчиком.
// Без него незавершённое решение оставило бы отклонение без обработки, и среда
// сообщила бы об ошибке раньше, чем тест успел бы отработать.
function rejected(reason) {
  const promise = Promise.reject(reason)
  promise.catch(() => {})
  return promise
}
`,
      testCode: `test('первый успех выигрывает', async function () {
  const failing = rejected(new Error('нет'))
  const ok = new Promise(function (resolve) { setTimeout(function () { resolve('да') }, 10) })

  const promise = promiseAny([failing, ok])
  await __clock.runAll()

  await expect(promise).resolves.toBe('да')
})

test('все отклонены — общая ошибка', async function () {
  const promise = promiseAny([rejected('a'), rejected('b')])

  await expect(promise).rejects.toThrow('Все промисы отклонены')
})

test('в errors лежат причины по порядку', async function () {
  let captured = null
  await promiseAny([rejected('a'), rejected('b')]).catch(function (error) {
    captured = error
  })

  expect(captured.errors).toEqual(['a', 'b'])
})

test('пустой массив отклоняется', async function () {
  await expect(promiseAny([])).rejects.toThrow('Все промисы отклонены')
})`,
    },

    {
      slug: 'retry-backoff',
      title: 'retry с экспоненциальной задержкой',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'retry',
      tags: ['async'],
      companies: ['ozon', 'tbank', 'sber'],
      descriptionMd: `Реализуйте \`retry(fn, retries, delay)\` — повтор асинхронной операции при ошибке
с экспоненциально растущей паузой.

- \`fn\` вызывается сразу; при успехе результат возвращается;
- при ошибке делается пауза \`delay\`, потом \`delay * 2\`, потом \`delay * 4\` и так далее;
- всего допускается \`retries\` **повторов** (то есть до \`retries + 1\` вызовов);
- если попытки исчерпаны, промис отклоняется последней ошибкой.

\`\`\`js
await retry(loadUser, 3, 100)
// вызовы: сразу, +100 мс, +200 мс, +400 мс
\`\`\`

В тестах время двигается через \`await __clock.tick(ms)\`.`,
      starterCode: `function retry(fn, retries, delay) {
  // Ваш код здесь
}
`,
      solutionCode: `function retry(fn, retries, delay) {
  function attempt(left, wait) {
    return Promise.resolve()
      .then(() => fn())
      .catch((error) => {
        if (left <= 0) throw error

        return new Promise((resolve) => setTimeout(resolve, wait)).then(() =>
          attempt(left - 1, wait * 2),
        )
      })
  }

  return attempt(retries, delay)
}
`,
      solutionNotes: `\`Promise.resolve().then(() => fn())\` защищает от синхронного исключения внутри
\`fn\`: без обёртки оно вылетело бы мимо \`catch\` и убило бы всю цепочку повторов.

Рекурсия здесь читается лучше цикла: состояние (сколько попыток осталось и какая
сейчас пауза) передаётся аргументами, а не копится в переменных.

Экспоненциальная задержка нужна, чтобы не добивать уже перегруженный сервис.
В боевом коде к ней добавляют джиттер — случайную добавку, которая разводит
во времени клиентов, упавших одновременно.

Важная деталь: повторять имеет смысл далеко не всё. Ошибку 400 повторять
бессмысленно, 500 и таймаут — осмысленно.`,
      hints: [
        'Заверните вызов fn в Promise.resolve().then(...) — иначе синхронное исключение пройдёт мимо catch.',
        'Паузу удобно сделать промисом вокруг setTimeout.',
        'Передавайте оставшиеся попытки и текущую задержку аргументами рекурсивной функции.',
      ],
      testCode: `test('успех с первого раза — без пауз', async function () {
  let calls = 0
  const promise = retry(function () { calls += 1; return Promise.resolve('ок') }, 3, 100)

  await expect(promise).resolves.toBe('ок')
  expect(calls).toBe(1)
})

test('повтор после ошибки', async function () {
  let calls = 0
  const promise = retry(function () {
    calls += 1
    return calls < 3 ? Promise.reject(new Error('упало')) : Promise.resolve('ок')
  }, 3, 100)

  await __clock.runAll()

  await expect(promise).resolves.toBe('ок')
  expect(calls).toBe(3)
})

test('задержка растёт экспоненциально', async function () {
  let calls = 0
  const promise = retry(function () {
    calls += 1
    return Promise.reject(new Error('упало'))
  }, 2, 100)
  promise.catch(function () {})

  await __clock.flush()
  expect(calls).toBe(1)

  await __clock.tick(100)
  expect(calls).toBe(2)

  await __clock.tick(199)
  expect(calls).toBe(2)

  await __clock.tick(1)
  expect(calls).toBe(3)
})

test('попытки исчерпаны — последняя ошибка', async function () {
  let calls = 0
  const promise = retry(function () {
    calls += 1
    return Promise.reject(new Error('попытка ' + calls))
  }, 2, 10)

  await __clock.runAll()

  await expect(promise).rejects.toThrow('попытка 3')
  expect(calls).toBe(3)
})

test('синхронное исключение тоже повторяется', async function () {
  let calls = 0
  const promise = retry(function () {
    calls += 1
    if (calls < 2) throw new Error('синхронно')
    return 'ок'
  }, 2, 10)

  await __clock.runAll()

  await expect(promise).resolves.toBe('ок')
  expect(calls).toBe(2)
})`,
    },

    {
      slug: 'parallel-limit',
      title: 'Параллелизм с ограничением',
      difficulty: 'hard',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'parallelLimit',
      tags: ['async', 'performance'],
      companies: ['yandex', 'ozon', 'faang'],
      descriptionMd: `Реализуйте \`parallelLimit(tasks, limit)\` — запуск асинхронных задач параллельно,
но не более \`limit\` одновременно.

- \`tasks\` — массив функций, каждая возвращает промис;
- результаты возвращаются в порядке исходного массива;
- как только одна задача завершилась, сразу стартует следующая из очереди;
- любая ошибка отклоняет общий промис.

\`\`\`js
await parallelLimit([t1, t2, t3, t4, t5], 2)
// одновременно выполняются максимум две задачи
\`\`\``,
      starterCode: `function parallelLimit(tasks, limit) {
  // Ваш код здесь
}
`,
      solutionCode: `function parallelLimit(tasks, limit) {
  return new Promise((resolve, reject) => {
    const results = new Array(tasks.length)
    let nextIndex = 0
    let completed = 0
    let failed = false

    if (tasks.length === 0) {
      resolve(results)
      return
    }

    function runNext() {
      if (failed || nextIndex >= tasks.length) return

      const index = nextIndex
      nextIndex += 1

      Promise.resolve()
        .then(() => tasks[index]())
        .then(
          (value) => {
            results[index] = value
            completed += 1
            if (completed === tasks.length) resolve(results)
            else runNext()
          },
          (error) => {
            failed = true
            reject(error)
          },
        )
    }

    const starters = Math.min(limit, tasks.length)
    for (let i = 0; i < starters; i++) runNext()
  })
}
`,
      solutionNotes: `Ключевая идея — «дорожки»: сначала запускается \`limit\` задач, и каждая
завершившаяся сама тянет следующую из очереди. Так активных задач всегда ровно
\`limit\`, без явного планировщика.

\`nextIndex\` — общий курсор по очереди, поэтому две дорожки не возьмут одну и ту
же задачу.

Флаг \`failed\` останавливает подачу новых задач после первой ошибки. Уже
запущенные всё равно доработают: отменить промис невозможно.

Проверять завершение нужно по \`completed === tasks.length\`, а не по опустевшей
очереди: очередь пустеет в момент **запуска** последней задачи, а не её
завершения.`,
      hints: [
        'Запустите limit «дорожек»; каждая завершившаяся задача запускает следующую.',
        'Общий курсор nextIndex не даст двум дорожкам взять одну задачу.',
        'Завершение определяется счётчиком выполненных, а не пустой очередью.',
      ],
      testCode: `test('результаты в порядке исходного массива', async function () {
  const tasks = [
    function () { return new Promise(function (r) { setTimeout(function () { r(1) }, 30) }) },
    function () { return new Promise(function (r) { setTimeout(function () { r(2) }, 10) }) },
    function () { return new Promise(function (r) { setTimeout(function () { r(3) }, 20) }) },
  ]

  const promise = parallelLimit(tasks, 2)
  await __clock.runAll()

  await expect(promise).resolves.toEqual([1, 2, 3])
})

test('одновременно работает не больше limit задач', async function () {
  let active = 0
  let peak = 0

  const tasks = Array.from({ length: 6 }, function (_unused, i) {
    return function () {
      active += 1
      peak = Math.max(peak, active)
      return new Promise(function (r) {
        setTimeout(function () { active -= 1; r(i) }, 10)
      })
    }
  })

  const promise = parallelLimit(tasks, 2)
  await __clock.runAll()
  await promise

  expect(peak).toBe(2)
})

test('пустой список задач', async function () {
  await expect(parallelLimit([], 3)).resolves.toEqual([])
})

test('ошибка отклоняет общий промис', async function () {
  const tasks = [
    function () { return Promise.resolve(1) },
    function () { return Promise.reject(new Error('упало')) },
    function () { return Promise.resolve(3) },
  ]

  await expect(parallelLimit(tasks, 2)).rejects.toThrow('упало')
})

test('limit больше числа задач', async function () {
  const tasks = [function () { return Promise.resolve('a') }, function () { return Promise.resolve('b') }]
  await expect(parallelLimit(tasks, 10)).resolves.toEqual(['a', 'b'])
})`,
    },

    {
      slug: 'async-queue',
      title: 'Последовательная очередь задач',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'AsyncQueue',
      tags: ['async', 'patterns'],
      companies: ['ozon', 'avito'],
      descriptionMd: `Реализуйте класс \`AsyncQueue\` — очередь, выполняющую асинхронные задачи строго
по одной, даже если их добавили одновременно.

- \`push(task)\` ставит задачу в очередь и возвращает промис с её результатом;
- задачи выполняются в порядке добавления, следующая стартует только после
  завершения предыдущей;
- упавшая задача отклоняет только свой промис и не останавливает очередь;
- геттер \`size\` возвращает количество задач, ожидающих выполнения.

\`\`\`js
const queue = new AsyncQueue()
queue.push(() => save(1))
queue.push(() => save(2)) // стартует только после первой
\`\`\``,
      starterCode: `class AsyncQueue {
  // Ваш код здесь
}
`,
      solutionCode: `class AsyncQueue {
  #pending = []
  #running = false

  get size() {
    return this.#pending.length
  }

  push(task) {
    return new Promise((resolve, reject) => {
      this.#pending.push({ task, resolve, reject })
      this.#drain()
    })
  }

  #drain() {
    if (this.#running) return

    const next = this.#pending.shift()
    if (!next) return

    this.#running = true

    Promise.resolve()
      .then(() => next.task())
      .then(next.resolve, next.reject)
      .finally(() => {
        this.#running = false
        this.#drain()
      })
  }
}
`,
      solutionNotes: `Флаг \`running\` — единственное, что делает очередь последовательной: \`push\` во
время выполнения только кладёт задачу в список, а запускать её будет \`drain\`
после текущей.

\`finally\` снимает флаг в обоих исходах, поэтому упавшая задача не блокирует
очередь навсегда. Ошибка при этом уходит только в промис своей задачи —
\`then(resolve, reject)\` перехватывает её до \`finally\`.

Приватные поля (\`#pending\`, \`#running\`) закрывают внутреннее состояние: снаружи
его не подменить, в отличие от полей с подчёркиванием.`,
      hints: [
        'Нужен флаг «сейчас что-то выполняется» и список ожидающих задач.',
        'После завершения задачи снимайте флаг и запускайте следующую.',
        'finally срабатывает в обоих исходах — именно там и место снятию флага.',
      ],
      testCode: `test('задачи выполняются по одной', async function () {
  const order = []
  let active = 0
  let peak = 0

  function makeTask(id, delay) {
    return function () {
      active += 1
      peak = Math.max(peak, active)
      return new Promise(function (resolve) {
        setTimeout(function () { active -= 1; order.push(id); resolve(id) }, delay)
      })
    }
  }

  const queue = new AsyncQueue()
  const all = [queue.push(makeTask(1, 30)), queue.push(makeTask(2, 10)), queue.push(makeTask(3, 20))]

  await __clock.runAll()
  await Promise.all(all)

  expect(peak).toBe(1)
  expect(order).toEqual([1, 2, 3])
})

test('push возвращает результат задачи', async function () {
  const queue = new AsyncQueue()
  await expect(queue.push(function () { return Promise.resolve(42) })).resolves.toBe(42)
})

test('ошибка не останавливает очередь', async function () {
  const queue = new AsyncQueue()
  const failing = queue.push(function () { return Promise.reject(new Error('упало')) })
  const next = queue.push(function () { return Promise.resolve('дальше') })

  await expect(failing).rejects.toThrow('упало')
  await expect(next).resolves.toBe('дальше')
})

test('size показывает ожидающие задачи', async function () {
  const queue = new AsyncQueue()
  const first = queue.push(function () { return new Promise(function (r) { setTimeout(r, 10) }) })
  queue.push(function () { return Promise.resolve() })
  queue.push(function () { return Promise.resolve() })

  expect(queue.size).toBe(2)

  await __clock.runAll()
  await first
})`,
    },

    {
      slug: 'promisify',
      title: 'promisify',
      difficulty: 'easy',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'promisify',
      tags: ['async'],
      descriptionMd: `Реализуйте \`promisify(fn)\` — превращение функции в стиле колбэков Node.js
в функцию, возвращающую промис.

Колбэк имеет сигнатуру \`(error, value)\`: непустой первый аргумент означает
ошибку.

\`\`\`js
function readValue(key, callback) {
  if (!key) callback(new Error('нет ключа'))
  else callback(null, 'значение ' + key)
}

const read = promisify(readValue)
await read('a') // 'значение a'
\`\`\`

Контекст вызова должен сохраняться.`,
      starterCode: `function promisify(fn) {
  // Ваш код здесь
}
`,
      solutionCode: `function promisify(fn) {
  return function (...args) {
    return new Promise((resolve, reject) => {
      fn.call(this, ...args, (error, value) => {
        if (error) reject(error)
        else resolve(value)
      })
    })
  }
}
`,
      solutionNotes: `Колбэк дописывается последним аргументом — именно такого порядка требует
соглашение Node.js.

Стрелочная функция для колбэка важна дважды: она не перехватывает \`this\` и
замыкается на \`resolve\`/\`reject\` из внешнего промиса.

Проверка \`if (error)\` (а не \`error !== null\`) — намеренная: разные библиотеки
передают то \`null\`, то \`undefined\`.`,
      hints: [
        'Колбэк добавляется последним аргументом к переданным.',
        'Внутри колбэка первый аргумент — ошибка, второй — значение.',
        'fn.call(this, ...) сохранит контекст вызова.',
      ],
      setupCode: `function readValue(key, callback) {
  if (!key) callback(new Error('нет ключа'))
  else callback(null, 'значение ' + key)
}

function sumLater(a, b, callback) {
  setTimeout(function () { callback(null, a + b) }, 10)
}
`,
      testCode: `test('успешный вызов', async function () {
  const read = promisify(readValue)
  await expect(read('a')).resolves.toBe('значение a')
})

test('ошибка отклоняет промис', async function () {
  const read = promisify(readValue)
  await expect(read('')).rejects.toThrow('нет ключа')
})

test('несколько аргументов', async function () {
  const sum = promisify(sumLater)
  const promise = sum(2, 3)
  await __clock.runAll()
  await expect(promise).resolves.toBe(5)
})

test('контекст сохраняется', async function () {
  const object = {
    prefix: 'из объекта: ',
    load: function (value, callback) { callback(null, this.prefix + value) },
  }
  object.loadAsync = promisify(object.load)

  await expect(object.loadAsync('данные')).resolves.toBe('из объекта: данные')
})`,
    },

    {
      slug: 'async-memoize-ttl',
      title: 'Асинхронная мемоизация с TTL',
      difficulty: 'hard',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'memoizeAsync',
      tags: ['async', 'performance'],
      companies: ['ozon', 'tbank'],
      descriptionMd: `Реализуйте \`memoizeAsync(fn, ttl)\` — кэш результатов асинхронной функции с
временем жизни.

- повторный вызов с теми же аргументами в течение \`ttl\` миллисекунд возвращает
  закэшированное значение, не вызывая \`fn\`;
- по истечении \`ttl\` значение считается устаревшим и вычисляется заново;
- **параллельные** вызовы с одинаковыми аргументами не должны приводить к
  нескольким запускам \`fn\`: второй вызов дожидается первого;
- если \`fn\` отклонилась, результат не кэшируется — следующий вызов пробует снова.

Ключ кэша строится из аргументов.`,
      starterCode: `function memoizeAsync(fn, ttl) {
  // Ваш код здесь
}
`,
      solutionCode: `function memoizeAsync(fn, ttl) {
  const cache = new Map()

  return function (...args) {
    const key = JSON.stringify(args)
    const entry = cache.get(key)

    if (entry && Date.now() - entry.storedAt < ttl) {
      return entry.promise
    }

    const promise = Promise.resolve()
      .then(() => fn.apply(this, args))
      .catch((error) => {
        // Ошибку не кэшируем: следующий вызов должен попробовать заново.
        if (cache.get(key) && cache.get(key).promise === promise) cache.delete(key)
        throw error
      })

    cache.set(key, { promise, storedAt: Date.now() })
    return promise
  }
}
`,
      solutionNotes: `Кэшируется **промис**, а не значение. Это и решает задачу про параллельные
вызовы: второй вызов получает тот же незавершённый промис и просто ждёт его,
вместо того чтобы запускать \`fn\` второй раз. Классическая ошибка — класть в кэш
результат уже в \`.then\`: между стартом и завершением окно, в которое пролезут
дубли.

Срок жизни отсчитывается от момента постановки в кэш. Строгое \`<\` даёт ровно
\`ttl\` миллисекунд жизни: на границе значение уже устарело.

Перед удалением сравнивается сам промис — иначе неудачный старый вызов снёс бы
кэш, который к тому моменту уже перезаписал кто-то другой.`,
      hints: [
        'Кэшируйте промис, а не результат: тогда параллельные вызовы дождутся одного вычисления.',
        'Момент постановки в кэш запоминайте через Date.now() — в песочнице он двигается вместе с __clock.',
        'Отклонённый промис надо убрать из кэша, но только если его никто не заменил.',
      ],
      testCode: `test('повторный вызов берётся из кэша', async function () {
  let calls = 0
  const load = memoizeAsync(function (id) { calls += 1; return Promise.resolve('данные ' + id) }, 1000)

  await expect(load(1)).resolves.toBe('данные 1')
  await expect(load(1)).resolves.toBe('данные 1')
  expect(calls).toBe(1)
})

test('после истечения ttl значение пересчитывается', async function () {
  let calls = 0
  const load = memoizeAsync(function (id) { calls += 1; return Promise.resolve(calls) }, 1000)

  await load(1)
  await __clock.tick(999)
  await load(1)
  expect(calls).toBe(1)

  await __clock.tick(1)
  await load(1)
  expect(calls).toBe(2)
})

test('параллельные вызовы схлопываются', async function () {
  let calls = 0
  const load = memoizeAsync(function () {
    calls += 1
    return new Promise(function (resolve) { setTimeout(function () { resolve('готово') }, 50) })
  }, 1000)

  const first = load('ключ')
  const second = load('ключ')
  await __clock.runAll()

  await expect(first).resolves.toBe('готово')
  await expect(second).resolves.toBe('готово')
  expect(calls).toBe(1)
})

test('разные аргументы — разные записи', async function () {
  let calls = 0
  const load = memoizeAsync(function (id) { calls += 1; return Promise.resolve(id) }, 1000)

  await load(1)
  await load(2)
  expect(calls).toBe(2)
})

test('ошибка не кэшируется', async function () {
  let calls = 0
  const load = memoizeAsync(function () {
    calls += 1
    return calls === 1 ? Promise.reject(new Error('упало')) : Promise.resolve('ок')
  }, 1000)

  await expect(load('ключ')).rejects.toThrow('упало')
  await expect(load('ключ')).resolves.toBe('ок')
  expect(calls).toBe(2)
})`,
    },

    {
      slug: 'my-promise-class',
      title: 'Своя реализация Promise',
      difficulty: 'hard',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'MyPromise',
      tags: ['promise', 'async'],
      companies: ['avito', 'sber', 'faang'],
      descriptionMd: `Реализуйте упрощённый класс \`MyPromise\` — без цепочек из спецификации, но с
правильной семантикой состояний.

- конструктор принимает исполнитель \`(resolve, reject) => void\`;
- три состояния: \`pending\`, \`fulfilled\`, \`rejected\`; переход возможен только
  из \`pending\` и только один раз;
- \`then(onFulfilled, onRejected)\` возвращает **новый** \`MyPromise\`;
- значение, возвращённое из обработчика, разрешает следующий промис;
  если обработчик бросил исключение — следующий промис отклоняется;
- если обработчик вернул \`MyPromise\`, следующий промис ждёт его;
- \`catch(fn)\` и \`finally(fn)\` выражаются через \`then\`;
- обработчики вызываются **асинхронно**, даже если промис уже завершён;
- статические \`MyPromise.resolve\` и \`MyPromise.reject\`.

Использовать встроенный \`Promise\` внутри нельзя. Для асинхронности берите
\`queueMicrotask\`.`,
      starterCode: `class MyPromise {
  // Ваш код здесь
}
`,
      solutionCode: `class MyPromise {
  #state = 'pending'
  #value = undefined
  #callbacks = []

  constructor(executor) {
    const resolve = (value) => this.#settle('fulfilled', value)
    const reject = (reason) => this.#settle('rejected', reason)

    try {
      executor(resolve, reject)
    } catch (error) {
      reject(error)
    }
  }

  #settle(state, value) {
    if (this.#state !== 'pending') return

    this.#state = state
    this.#value = value

    const callbacks = this.#callbacks
    this.#callbacks = []
    callbacks.forEach((callback) => queueMicrotask(callback))
  }

  then(onFulfilled, onRejected) {
    return new MyPromise((resolve, reject) => {
      const handle = () => {
        const handler = this.#state === 'fulfilled' ? onFulfilled : onRejected

        if (typeof handler !== 'function') {
          // Обработчика нет — пробрасываем состояние дальше по цепочке.
          if (this.#state === 'fulfilled') resolve(this.#value)
          else reject(this.#value)
          return
        }

        try {
          const result = handler(this.#value)
          if (result instanceof MyPromise) result.then(resolve, reject)
          else resolve(result)
        } catch (error) {
          reject(error)
        }
      }

      if (this.#state === 'pending') this.#callbacks.push(handle)
      else queueMicrotask(handle)
    })
  }

  catch(onRejected) {
    return this.then(undefined, onRejected)
  }

  finally(onFinally) {
    return this.then(
      (value) => {
        onFinally()
        return value
      },
      (reason) => {
        onFinally()
        throw reason
      },
    )
  }

  static resolve(value) {
    return new MyPromise((resolve) => resolve(value))
  }

  static reject(reason) {
    return new MyPromise((_resolve, reject) => reject(reason))
  }
}
`,
      solutionNotes: `Три вещи, которые проверяют в этой задаче.

**Состояние меняется один раз.** Проверка \`if (this.#state !== 'pending') return\`
в \`settle\` — вся защита. Без неё повторный \`resolve\` переписал бы результат.

**Обработчики всегда асинхронны.** Даже у уже завершённого промиса \`then\` не
вызывает обработчик сразу, а ставит его в очередь микрозадач. Иначе поведение
кода зависело бы от того, успел промис завершиться или нет, — и отладка
превращалась бы в лотерею.

**Проброс без обработчика.** Если в \`then\` не передали нужный обработчик,
состояние уходит дальше по цепочке как есть. Именно поэтому \`catch\` в конце
длинной цепочки ловит ошибку из самого начала.

\`finally\` не меняет результат: в успешной ветке возвращает значение, в
ошибочной — перебрасывает причину.`,
      hints: [
        'Храните состояние, значение и список отложенных обработчиков.',
        'settle должен молча выходить, если состояние уже не pending.',
        'Обработчики ставьте в queueMicrotask — даже когда промис уже завершён.',
        'Если обработчика нет, пробрасывайте состояние дальше без изменений.',
      ],
      testCode: `test('разрешение и then', async function () {
  const promise = new MyPromise(function (resolve) { resolve(42) })
  const seen = []
  promise.then(function (value) { seen.push(value) })

  await __clock.flush()
  expect(seen).toEqual([42])
})

test('обработчики вызываются асинхронно', async function () {
  const order = []
  MyPromise.resolve(1).then(function () { order.push('then') })
  order.push('синхронно')

  await __clock.flush()
  expect(order).toEqual(['синхронно', 'then'])
})

test('состояние фиксируется один раз', async function () {
  const seen = []
  new MyPromise(function (resolve, reject) {
    resolve('первый')
    resolve('второй')
    reject(new Error('поздно'))
  }).then(function (value) { seen.push(value) }, function () { seen.push('ошибка') })

  await __clock.flush()
  expect(seen).toEqual(['первый'])
})

test('цепочка then', async function () {
  const seen = []
  MyPromise.resolve(1)
    .then(function (value) { return value + 1 })
    .then(function (value) { return value * 2 })
    .then(function (value) { seen.push(value) })

  await __clock.flush()
  expect(seen).toEqual([4])
})

test('исключение в обработчике отклоняет следующий промис', async function () {
  const seen = []
  MyPromise.resolve(1)
    .then(function () { throw new Error('сломалось') })
    .catch(function (error) { seen.push(error.message) })

  await __clock.flush()
  expect(seen).toEqual(['сломалось'])
})

test('ошибка пробрасывается через then без обработчика', async function () {
  const seen = []
  MyPromise.reject(new Error('издалека'))
    .then(function () { seen.push('не сюда') })
    .catch(function (error) { seen.push(error.message) })

  await __clock.flush()
  expect(seen).toEqual(['издалека'])
})

test('обработчик может вернуть MyPromise', async function () {
  const seen = []
  MyPromise.resolve(1)
    .then(function () { return MyPromise.resolve('вложенный') })
    .then(function (value) { seen.push(value) })

  await __clock.flush()
  expect(seen).toEqual(['вложенный'])
})

test('finally не меняет результат', async function () {
  const seen = []
  MyPromise.resolve('значение')
    .finally(function () { seen.push('finally') })
    .then(function (value) { seen.push(value) })

  await __clock.flush()
  expect(seen).toEqual(['finally', 'значение'])
})

test('исключение в исполнителе отклоняет промис', async function () {
  const seen = []
  new MyPromise(function () { throw new Error('в исполнителе') }).catch(function (error) {
    seen.push(error.message)
  })

  await __clock.flush()
  expect(seen).toEqual(['в исполнителе'])
})`,
    },
  ],
}
