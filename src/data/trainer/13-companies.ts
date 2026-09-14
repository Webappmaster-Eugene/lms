import type { TrainerTopicSeed } from './types'

/**
 * Тема 13. Задачи конкретных компаний.
 *
 * Собрано из разборов реальных собеседований: Яндекс, Озон, Авито, Т-Банк,
 * Сбер, Wildberries. Формулировки приведены к проверяемому виду, но суть
 * и подвохи сохранены.
 */
export const companies: TrainerTopicSeed = {
  slug: 'company-tasks',
  title: 'Задачи компаний',
  description: 'Что реально спрашивают в Яндексе, Озоне, Авито, Т-Банке, Сбере и WB',
  category: 'companies',
  icon: '🏢',
  order: 13,
  tasks: [
    {
      slug: 'yandex-tickets-route',
      title: 'Яндекс: маршрут по билетам',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'buildRoute',
      tags: ['algorithms', 'objects'],
      companies: ['yandex'],
      descriptionMd: `Дан набор авиабилетов в виде пар \`[откуда, куда]\`, перемешанных в случайном
порядке. Известно, что из них складывается ровно один непрерывный маршрут без
повторов городов.

Восстановите порядок городов.

\`\`\`js
buildRoute([['Москва', 'Казань'], ['Сочи', 'Москва'], ['Казань', 'Пермь']])
// ['Сочи', 'Москва', 'Казань', 'Пермь']
\`\`\`

Сложность — O(n). Перебор с поиском следующего билета даёт O(n²).`,
      starterCode: `function buildRoute(tickets) {
  // Ваш код здесь
}
`,
      solutionCode: `function buildRoute(tickets) {
  if (tickets.length === 0) return []

  const next = new Map()
  const hasIncoming = new Set()

  for (const [from, to] of tickets) {
    next.set(from, to)
    hasIncoming.add(to)
  }

  // Начало маршрута — единственный город, в который никто не прилетает.
  let start = null
  for (const [from] of tickets) {
    if (!hasIncoming.has(from)) {
      start = from
      break
    }
  }

  if (start === null) return []

  const route = [start]
  let current = start

  while (next.has(current)) {
    current = next.get(current)
    route.push(current)
  }

  return route
}
`,
      solutionNotes: `Задача формулируется как «восстановить порядок», но по сути это поиск начала
цепочки в ориентированном графе, где у каждой вершины не больше одного исходящего
ребра.

Начало — единственный город, который встречается только слева. Отсюда множество
городов прибытия: город, которого в нём нет, и есть старт.

Дальше маршрут просто разворачивается по карте «откуда → куда» за один проход.
Итого O(n) времени и O(n) памяти против O(n²) у наивного поиска следующего
билета перебором.

Отдельно стоит спросить у интервьюера про гарантии: что делать, если маршрут
распадается на несколько частей или в нём есть цикл. Здесь по условию это
исключено, и \`return []\` для случая «старт не найден» — защита от некорректных
данных, а не часть алгоритма.`,
      hints: [
        'Постройте карту «откуда → куда» за один проход.',
        'Начало маршрута — город, которого нет среди пунктов прибытия.',
        'Дальше просто идите по карте, пока есть следующий город.',
      ],
      cases: [
        {
          name: 'перемешанные билеты',
          args: [[['Москва', 'Казань'], ['Сочи', 'Москва'], ['Казань', 'Пермь']]],
          expected: ['Сочи', 'Москва', 'Казань', 'Пермь'],
        },
        { name: 'один билет', args: [[['А', 'Б']]], expected: ['А', 'Б'] },
        { name: 'пустой набор', args: [[]], expected: [] },
        {
          name: 'уже по порядку',
          args: [[['А', 'Б'], ['Б', 'В']]],
          expected: ['А', 'Б', 'В'],
          hidden: true,
        },
        {
          name: 'обратный порядок',
          args: [[['В', 'Г'], ['Б', 'В'], ['А', 'Б']]],
          expected: ['А', 'Б', 'В', 'Г'],
          hidden: true,
        },
      ],
      testCode: `test('длинный маршрут собирается за линейное время', function () {
  const cities = Array.from({ length: 5000 }, function (_unused, i) { return 'Город' + i })
  const tickets = []
  for (let i = 0; i < cities.length - 1; i++) tickets.push([cities[i], cities[i + 1]])

  // Перемешиваем детерминированно
  let seed = 3
  for (let i = tickets.length - 1; i > 0; i--) {
    seed = (seed * 1103515245 + 12345) % 2147483648
    const j = seed % (i + 1)
    const temp = tickets[i]
    tickets[i] = tickets[j]
    tickets[j] = temp
  }

  expect(buildRoute(tickets)).toEqual(cities)
})`,
    },

    {
      slug: 'tbank-rate-limiter',
      title: 'Т-Банк: rate limiter',
      difficulty: 'hard',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'createRateLimiter',
      tags: ['async', 'performance'],
      companies: ['tbank', 'sber'],
      descriptionMd: `Реализуйте \`createRateLimiter(limit, intervalMs)\` — ограничитель частоты вызовов
по схеме скользящего окна.

Возвращается функция \`tryCall()\`, которая:

- возвращает \`true\`, если за последние \`intervalMs\` миллисекунд было меньше
  \`limit\` разрешённых вызовов (и засчитывает текущий);
- возвращает \`false\` в противном случае, ничего не засчитывая.

\`\`\`js
const limiter = createRateLimiter(2, 1000)

limiter() // true
limiter() // true
limiter() // false — лимит исчерпан
// ...через 1000 мс от первого вызова снова true
\`\`\`

Окно **скользящее**, а не фиксированное: место освобождается ровно через
\`intervalMs\` после того вызова, который его занял.

В тестах время двигается через \`await __clock.tick(ms)\`.`,
      starterCode: `function createRateLimiter(limit, intervalMs) {
  // Ваш код здесь
}
`,
      solutionCode: `function createRateLimiter(limit, intervalMs) {
  // Очередь отметок времени разрешённых вызовов.
  // Голова — самый старый вызов в окне.
  const timestamps = []
  let head = 0

  return function tryCall() {
    const now = Date.now()
    const windowStart = now - intervalMs

    // Выбрасываем всё, что вышло за окно.
    while (head < timestamps.length && timestamps[head] <= windowStart) head += 1

    // Периодически подрезаем массив, иначе он растёт бесконечно.
    if (head > 1000) {
      timestamps.splice(0, head)
      head = 0
    }

    if (timestamps.length - head >= limit) return false

    timestamps.push(now)
    return true
  }
}
`,
      solutionNotes: `Скользящее окно требует помнить **момент каждого** разрешённого вызова: только
так можно понять, когда освободится место. Простой счётчик со сбросом по таймеру
реализует фиксированное окно, а у него есть известный дефект — на стыке двух
окон можно пропустить вдвое больше вызовов, чем разрешено.

Отметки хранятся в очереди: старые уходят из головы, новые добавляются в хвост.
Голова двигается указателем, а не \`shift()\` — иначе каждое обращение стоило бы
O(n).

Массив периодически подрезается: без этого он рос бы всё время работы
приложения. Амортизированная сложность остаётся O(1).

Условие \`timestamps[head] <= windowStart\` (нестрогое) освобождает место ровно
через \`intervalMs\`, а не через \`intervalMs + 1\`.

Более экономный по памяти вариант — алгоритм «дырявого ведра» (token bucket):
хранится только количество токенов и время последнего пополнения. Он допускает
всплески, но не помнит точных моментов.`,
      hints: [
        'Счётчик со сбросом по таймеру — это фиксированное окно, а не скользящее.',
        'Храните отметки времени разрешённых вызовов и выбрасывайте вышедшие за окно.',
        'Голову очереди двигайте указателем, а не shift().',
      ],
      testCode: `test('в пределах лимита вызовы проходят', function () {
  const limiter = createRateLimiter(3, 1000)

  expect(limiter()).toBe(true)
  expect(limiter()).toBe(true)
  expect(limiter()).toBe(true)
})

test('сверх лимита вызовы отклоняются', function () {
  const limiter = createRateLimiter(2, 1000)

  limiter()
  limiter()

  expect(limiter()).toBe(false)
  expect(limiter()).toBe(false)
})

test('окно скользит', async function () {
  const limiter = createRateLimiter(2, 1000)

  limiter()
  await __clock.tick(500)
  limiter()

  expect(limiter()).toBe(false)

  // Через 1000 мс от первого вызова освобождается одно место.
  await __clock.tick(500)
  expect(limiter()).toBe(true)
  expect(limiter()).toBe(false)

  // Ещё через 500 мс освобождается место второго вызова.
  await __clock.tick(500)
  expect(limiter()).toBe(true)
})

test('отклонённые вызовы не занимают место', async function () {
  const limiter = createRateLimiter(1, 1000)

  expect(limiter()).toBe(true)
  expect(limiter()).toBe(false)
  expect(limiter()).toBe(false)

  await __clock.tick(1000)
  expect(limiter()).toBe(true)
})

test('после полного простоя лимит полностью восстанавливается', async function () {
  const limiter = createRateLimiter(2, 100)

  limiter()
  limiter()
  await __clock.tick(1000)

  expect(limiter()).toBe(true)
  expect(limiter()).toBe(true)
  expect(limiter()).toBe(false)
})

test('на длинной дистанции лимит соблюдается', async function () {
  const limiter = createRateLimiter(5, 50)
  let allowed = 0

  // Пять тысяч попыток по одной в миллисекунду — это сто окон по 50 мс,
  // значит разрешено должно быть около 5 × 100 вызовов.
  for (let i = 0; i < 5000; i++) {
    if (limiter()) allowed += 1
    await __clock.tick(1)
  }

  expect(allowed >= 495).toBe(true)
  expect(allowed <= 505).toBe(true)
})`,
    },

    {
      slug: 'ozon-equal-arrays',
      title: 'Озон: сделать массивы равными',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'minOperations',
      tags: ['arrays', 'algorithms'],
      companies: ['ozon'],
      descriptionMd: `Даны два массива чисел одинаковой длины. За одну операцию можно заменить любой
элемент первого массива на любое число.

Найдите минимальное количество операций, чтобы первый массив стал равен второму
**как мультимножество** — то есть содержал те же числа с теми же количествами,
порядок неважен.

\`\`\`js
minOperations([1, 2, 3], [1, 2, 4]) // 1 — заменить 3 на 4
minOperations([1, 1, 2], [1, 2, 2]) // 1
minOperations([1, 2], [1, 2])       // 0
\`\`\`

Сложность — O(n).`,
      starterCode: `function minOperations(first, second) {
  // Ваш код здесь
}
`,
      solutionCode: `function minOperations(first, second) {
  // Считаем, сколько элементов уже совпадает по количеству:
  // их менять не нужно, остальные — и есть ответ.
  const counts = new Map()

  for (const value of first) {
    counts.set(value, (counts.get(value) || 0) + 1)
  }

  let matched = 0

  for (const value of second) {
    const left = counts.get(value)
    if (left) {
      counts.set(value, left - 1)
      matched += 1
    }
  }

  return second.length - matched
}
`,
      solutionNotes: `Ключевое переосмысление задачи: вместо «сколько заменить» считаем «сколько
можно оставить». Элемент первого массива остаётся на месте, если такое же число
нужно и во втором. Остальные придётся заменить — и ровно столько операций и
нужно.

Счётчик обязателен: по множеству (\`Set\`) задачу не решить, потому что важны
**количества**. Пара \`[1, 1, 2]\` и \`[1, 2, 2]\` содержит одни и те же числа, но
одну единицу всё равно придётся заменить на двойку.

Один проход на подсчёт, второй на сопоставление — O(n) времени и O(n) памяти.

Стоит уточнить у интервьюера, учитывается ли порядок. Если да — задача
превращается в поиск наибольшей общей подпоследовательности и решается совсем
иначе.`,
      hints: [
        'Считайте не заменяемые элементы, а те, что можно оставить.',
        'Set не подойдёт: важны количества, а не сам факт наличия числа.',
      ],
      cases: [
        { name: 'одна замена', args: [[1, 2, 3], [1, 2, 4]], expected: 1 },
        { name: 'разные количества', args: [[1, 1, 2], [1, 2, 2]], expected: 1 },
        { name: 'уже равны', args: [[1, 2], [1, 2]], expected: 0 },
        { name: 'другой порядок', args: [[2, 1], [1, 2]], expected: 0 },
        { name: 'ничего общего', args: [[1, 2], [3, 4]], expected: 2 },
        { name: 'пустые массивы', args: [[], []], expected: 0 },
        { name: 'все одинаковые', args: [[5, 5, 5], [5, 5, 5]], expected: 0, hidden: true },
        { name: 'частичное совпадение', args: [[1, 1, 1], [1, 2, 3]], expected: 2, hidden: true },
      ],
    },

    {
      slug: 'avito-event-bus',
      title: 'Авито: шина событий',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'EventBus',
      tags: ['patterns'],
      companies: ['avito', 'vk'],
      descriptionMd: `Реализуйте класс \`EventBus\` — шину событий для связи независимых частей
приложения.

Методы:

- \`on(event, handler)\` подписывает и возвращает функцию отписки;
- \`off(event, handler)\` отписывает;
- \`once(event, handler)\` подписывает на одно срабатывание;
- \`emit(event, ...args)\` вызывает обработчики и возвращает их количество;
- \`clear(event)\` снимает все подписки на событие (без аргумента — все вообще).

Требования, на которых обычно и проверяют:

- обработчик, упавший с исключением, не должен помешать остальным;
- отписка **во время** \`emit\` не должна ломать текущую рассылку;
- один и тот же обработчик можно подписать дважды, и он сработает дважды.`,
      starterCode: `class EventBus {
  // Ваш код здесь
}
`,
      solutionCode: `class EventBus {
  #handlers = new Map()

  on(event, handler) {
    if (typeof handler !== 'function') {
      throw new TypeError('Обработчик должен быть функцией')
    }

    if (!this.#handlers.has(event)) this.#handlers.set(event, [])
    this.#handlers.get(event).push(handler)

    return () => this.off(event, handler)
  }

  off(event, handler) {
    const list = this.#handlers.get(event)
    if (!list) return this

    const index = list.indexOf(handler)
    if (index !== -1) list.splice(index, 1)
    if (list.length === 0) this.#handlers.delete(event)

    return this
  }

  once(event, handler) {
    const wrapped = (...args) => {
      this.off(event, wrapped)
      handler(...args)
    }

    // Ссылка на исходный обработчик нужна, чтобы off(event, handler)
    // работал и для подписки через once.
    wrapped.original = handler
    return this.on(event, wrapped)
  }

  emit(event, ...args) {
    const list = this.#handlers.get(event)
    if (!list || list.length === 0) return 0

    // Копия списка: обработчик может отписаться прямо во время рассылки,
    // и итерация по живому массиву пропустила бы следующего.
    const snapshot = list.slice()

    for (const handler of snapshot) {
      try {
        handler(...args)
      } catch (error) {
        // Упавший обработчик не должен обрывать рассылку остальным.
        if (typeof console !== 'undefined') console.error(error)
      }
    }

    return snapshot.length
  }

  clear(event) {
    if (event === undefined) this.#handlers.clear()
    else this.#handlers.delete(event)

    return this
  }
}
`,
      solutionNotes: `Три места, где эта задача обычно и ломается.

**Копия списка в \`emit\`.** Если обработчик отписывается прямо во время рассылки
(а \`once\` делает это всегда), \`splice\` сдвигает элементы, и цикл по живому
массиву перескакивает через следующего обработчика. Копия \`slice()\` решает это
полностью.

**Изоляция исключений.** Без \`try/catch\` первый же упавший обработчик оборвёт
рассылку остальным. Для шины событий это недопустимо: подписчики независимы и
ничего не знают друг о друге.

**Отписка через \`once\`.** Подписан на самом деле не исходный обработчик, а
обёртка. Ссылка \`wrapped.original\` позволяет найти её по исходной функции, если
вызвать \`off(event, handler)\`.

Возврат функции отписки из \`on\` — удобная деталь: она избавляет вызывающий код
от необходимости хранить и событие, и ссылку на обработчик.

Утечки памяти — главная практическая опасность шины: подписка живёт, пока её не
сняли, и удерживает всё, что захватил обработчик. Отписка при размонтировании
компонента обязательна.`,
      hints: [
        'В emit итерируйте по копии списка — обработчик может отписаться во время рассылки.',
        'Оборачивайте вызов в try/catch: упавший обработчик не должен обрывать рассылку.',
        'once подписывает обёртку — сохраните ссылку на исходный обработчик.',
      ],
      testCode: `test('подписка и рассылка', function () {
  const bus = new EventBus()
  const seen = []

  bus.on('данные', function (value) { seen.push(value) })
  bus.emit('данные', 42)

  expect(seen).toEqual([42])
})

test('несколько обработчиков и счётчик', function () {
  const bus = new EventBus()
  const seen = []

  bus.on('e', function () { seen.push('первый') })
  bus.on('e', function () { seen.push('второй') })

  expect(bus.emit('e')).toBe(2)
  expect(seen).toEqual(['первый', 'второй'])
})

test('emit без подписчиков', function () {
  expect(new EventBus().emit('нет')).toBe(0)
})

test('on возвращает функцию отписки', function () {
  const bus = new EventBus()
  let calls = 0

  const unsubscribe = bus.on('e', function () { calls += 1 })
  bus.emit('e')
  unsubscribe()
  bus.emit('e')

  expect(calls).toBe(1)
})

test('off снимает подписку', function () {
  const bus = new EventBus()
  let calls = 0
  function handler() { calls += 1 }

  bus.on('e', handler)
  bus.off('e', handler)
  bus.emit('e')

  expect(calls).toBe(0)
})

test('once срабатывает один раз', function () {
  const bus = new EventBus()
  let calls = 0

  bus.once('e', function () { calls += 1 })
  bus.emit('e')
  bus.emit('e')

  expect(calls).toBe(1)
})

test('отписка во время рассылки не ломает её', function () {
  const bus = new EventBus()
  const seen = []

  const off = bus.on('e', function () {
    seen.push('первый')
    off()
  })
  bus.on('e', function () { seen.push('второй') })

  bus.emit('e')

  expect(seen).toEqual(['первый', 'второй'])
})

test('упавший обработчик не мешает остальным', function () {
  const bus = new EventBus()
  const seen = []

  bus.on('e', function () { throw new Error('упал') })
  bus.on('e', function () { seen.push('дошло') })

  bus.emit('e')

  expect(seen).toEqual(['дошло'])
})

test('один обработчик можно подписать дважды', function () {
  const bus = new EventBus()
  let calls = 0
  function handler() { calls += 1 }

  bus.on('e', handler)
  bus.on('e', handler)
  bus.emit('e')

  expect(calls).toBe(2)
})

test('clear снимает подписки', function () {
  const bus = new EventBus()
  let calls = 0

  bus.on('a', function () { calls += 1 })
  bus.on('b', function () { calls += 1 })

  bus.clear('a')
  bus.emit('a')
  bus.emit('b')
  expect(calls).toBe(1)

  bus.clear()
  bus.emit('b')
  expect(calls).toBe(1)
})

test('аргументы доходят до обработчика', function () {
  const bus = new EventBus()
  let received = null

  bus.on('e', function (a, b) { received = [a, b] })
  bus.emit('e', 1, 2)

  expect(received).toEqual([1, 2])
})`,
    },

    {
      slug: 'sber-vdom-diff',
      title: 'Сбер: упрощённый Virtual DOM diff',
      difficulty: 'hard',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'diff',
      tags: ['patterns', 'recursion'],
      companies: ['sber', 'vk'],
      descriptionMd: `Реализуйте \`diff(oldNode, newNode)\` — сравнение двух виртуальных деревьев.

Узел — это либо строка (текст), либо объект
\`{ type, props, children }\`.

Возвращается список операций (патч):

- \`{ op: 'replace', path, node }\` — узел заменяется целиком (изменился тип или
  текст);
- \`{ op: 'props', path, changed }\` — изменились атрибуты; в \`changed\` лежат
  только новые и изменённые значения, удалённые — со значением \`null\`;
- \`{ op: 'remove', path }\` — узел удалён;
- \`{ op: 'add', path, node }\` — узел добавлен.

\`path\` — массив индексов от корня.

\`\`\`js
diff(
  { type: 'div', props: {}, children: ['Привет'] },
  { type: 'div', props: {}, children: ['Пока'] },
)
// [{ op: 'replace', path: [0], node: 'Пока' }]
\`\`\`

Если деревья одинаковы, возвращается пустой массив.`,
      starterCode: `function diff(oldNode, newNode) {
  // Ваш код здесь
}
`,
      solutionCode: `function diffProps(oldProps, newProps) {
  const changed = {}
  let hasChanges = false

  for (const key of Object.keys(newProps)) {
    if (oldProps[key] !== newProps[key]) {
      changed[key] = newProps[key]
      hasChanges = true
    }
  }

  // Удалённые атрибуты помечаются null, иначе их не снять с элемента.
  for (const key of Object.keys(oldProps)) {
    if (!(key in newProps)) {
      changed[key] = null
      hasChanges = true
    }
  }

  return hasChanges ? changed : null
}

function diff(oldNode, newNode, path = []) {
  const patches = []

  if (oldNode === undefined) {
    patches.push({ op: 'add', path, node: newNode })
    return patches
  }

  if (newNode === undefined) {
    patches.push({ op: 'remove', path })
    return patches
  }

  const oldIsText = typeof oldNode === 'string'
  const newIsText = typeof newNode === 'string'

  if (oldIsText || newIsText) {
    // Текст сравнивается целиком: частичного обновления у него нет.
    if (oldNode !== newNode) patches.push({ op: 'replace', path, node: newNode })
    return patches
  }

  if (oldNode.type !== newNode.type) {
    // Смена типа — поддерево не переиспользуется, как и в React.
    patches.push({ op: 'replace', path, node: newNode })
    return patches
  }

  const changed = diffProps(oldNode.props || {}, newNode.props || {})
  if (changed !== null) patches.push({ op: 'props', path, changed })

  const oldChildren = oldNode.children || []
  const newChildren = newNode.children || []
  const length = Math.max(oldChildren.length, newChildren.length)

  for (let i = 0; i < length; i++) {
    patches.push(...diff(oldChildren[i], newChildren[i], path.concat(i)))
  }

  return patches
}
`,
      solutionNotes: `Алгоритм повторяет эвристики настоящего согласования React.

**Смена типа — полная замена.** React не пытается превратить \`<div>\` в \`<span>\`:
вероятность, что поддеревья при этом похожи, мала, а сравнение стоит дорого.
Проще выбросить и построить заново.

**Дети сравниваются по индексу.** Это самая грубая эвристика, и именно из-за неё
нужны ключи: без них вставка элемента в начало списка выглядит как изменение
каждого элемента. С ключами сравнение идёт по идентичности, а не по позиции.

**Удалённые атрибуты помечаются \`null\`.** Просто не упомянуть их недостаточно —
патч должен нести информацию о том, что атрибут надо снять с реального элемента.

Сложность обхода — O(n) по размеру дерева. Полноценный алгоритм сравнения
произвольных деревьев стоил бы O(n³), и React его не использует именно поэтому.

Обратите внимание, что \`path\` строится через \`concat\`, а не \`push\`: массив
разделяется между ветвями рекурсии, и мутация испортила бы соседей.`,
      hints: [
        'Смена типа узла — полная замена, без сравнения поддеревьев.',
        'Удалённые атрибуты помечайте null, иначе их не снять с элемента.',
        'Детей сравнивайте по индексу; path собирайте через concat, а не push.',
      ],
      setupCode: `function el(type, props, children) {
  return { type: type, props: props || {}, children: children || [] }
}
`,
      testCode: `test('одинаковые деревья дают пустой патч', function () {
  const tree = el('div', { id: 'a' }, ['текст'])
  expect(diff(tree, el('div', { id: 'a' }, ['текст']))).toEqual([])
})

test('изменение текста', function () {
  expect(diff(el('div', {}, ['Привет']), el('div', {}, ['Пока'])))
    .toEqual([{ op: 'replace', path: [0], node: 'Пока' }])
})

test('смена типа узла', function () {
  const patches = diff(el('div'), el('span'))

  expect(patches).toHaveLength(1)
  expect(patches[0].op).toBe('replace')
  expect(patches[0].path).toEqual([])
})

test('изменение атрибутов', function () {
  expect(diff(el('div', { id: 'a' }), el('div', { id: 'b' })))
    .toEqual([{ op: 'props', path: [], changed: { id: 'b' } }])
})

test('удалённый атрибут помечается null', function () {
  expect(diff(el('div', { id: 'a', title: 'т' }), el('div', { id: 'a' })))
    .toEqual([{ op: 'props', path: [], changed: { title: null } }])
})

test('добавление ребёнка', function () {
  const patches = diff(el('ul', {}, ['a']), el('ul', {}, ['a', 'b']))

  expect(patches).toEqual([{ op: 'add', path: [1], node: 'b' }])
})

test('удаление ребёнка', function () {
  expect(diff(el('ul', {}, ['a', 'b']), el('ul', {}, ['a'])))
    .toEqual([{ op: 'remove', path: [1] }])
})

test('вложенные изменения', function () {
  const before = el('div', {}, [el('span', { id: 'a' }, ['старый'])])
  const after = el('div', {}, [el('span', { id: 'b' }, ['новый'])])

  expect(diff(before, after)).toEqual([
    { op: 'props', path: [0], changed: { id: 'b' } },
    { op: 'replace', path: [0, 0], node: 'новый' },
  ])
})

test('путь не портится между ветвями', function () {
  const before = el('div', {}, [el('a', { x: 1 }), el('b', { y: 1 })])
  const after = el('div', {}, [el('a', { x: 2 }), el('b', { y: 2 })])

  expect(diff(before, after)).toEqual([
    { op: 'props', path: [0], changed: { x: 2 } },
    { op: 'props', path: [1], changed: { y: 2 } },
  ])
})`,
    },

    {
      slug: 'wb-intersection-lazy-load',
      title: 'Wildberries: ленивая загрузка картинок',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'createLazyLoader',
      tags: ['web-api', 'performance'],
      companies: ['wildberries', 'ozon'],
      descriptionMd: `Реализуйте \`createLazyLoader(observerFactory)\` — ленивую загрузку изображений
через \`IntersectionObserver\`.

Возвращается объект с методами:

- \`observe(element)\` ставит элемент под наблюдение;
- \`disconnect()\` прекращает наблюдение за всеми.

Когда элемент попадает в видимую область, его \`dataset.src\` переносится в \`src\`,
добавляется класс \`loaded\`, и наблюдение за этим элементом прекращается —
повторно загружать картинку не нужно.

\`observerFactory(callback, options)\` создаёт наблюдатель: в тестах он подменён
моком, в бою это \`(cb, opts) => new IntersectionObserver(cb, opts)\`.

Наблюдатель создаётся с \`rootMargin: '200px'\` — чтобы картинка успевала
загрузиться до того, как пользователь до неё доскроллит.`,
      starterCode: `function createLazyLoader(observerFactory) {
  // Ваш код здесь
}
`,
      solutionCode: `function createLazyLoader(observerFactory) {
  function handleEntries(entries, observer) {
    for (const entry of entries) {
      if (!entry.isIntersecting) continue

      const element = entry.target
      const source = element.dataset && element.dataset.src

      if (source) {
        element.src = source
        element.classList.add('loaded')
      }

      // Картинка уже загружена — наблюдать за ней больше незачем.
      observer.unobserve(element)
    }
  }

  const observer = observerFactory(handleEntries, {
    // Запас до края экрана: загрузка успевает начаться заранее.
    rootMargin: '200px',
    threshold: 0,
  })

  return {
    observe(element) {
      observer.observe(element)
      return this
    },
    disconnect() {
      observer.disconnect()
      return this
    },
  }
}
`,
      solutionNotes: `\`IntersectionObserver\` вытеснил обработчики \`scroll\` именно потому, что не
заставляет считать геометрию на каждый кадр: браузер сам сообщает о пересечении,
причём вне основного потока вёрстки. Обработчик \`scroll\` с \`getBoundingClientRect\`
вызывает принудительный пересчёт макета и заметно тормозит на длинных списках.

\`unobserve\` после загрузки — не оптимизация, а необходимость: без него
наблюдатель продолжит присылать события при каждом пересечении, и \`src\` будет
переприсваиваться.

\`rootMargin: '200px'\` расширяет область срабатывания за пределы экрана. Без
запаса картинка начинает грузиться ровно в момент появления, и пользователь
успевает увидеть пустое место.

Фабрика наблюдателя передаётся аргументом ради тестируемости: подменить
глобальный \`IntersectionObserver\` в тестах можно, но внедрение зависимости
делает это явным и не трогает глобальное окружение.

Современная альтернатива для простых случаев — атрибут \`loading="lazy"\`. Свой
загрузчик нужен, когда требуется контроль: плейсхолдеры, приоритеты, метрики.`,
      hints: [
        'После загрузки вызывайте unobserve — иначе события продолжат приходить.',
        'rootMargin даёт запас, чтобы загрузка начиналась до появления на экране.',
        'Фабрика наблюдателя передаётся аргументом ради тестируемости.',
      ],
      setupCode: `// Мок IntersectionObserver: позволяет вручную «показать» элементы.
function createObserverMock() {
  const state = { observed: [], disconnected: false, options: null, callback: null }

  const factory = function (callback, options) {
    state.callback = callback
    state.options = options

    const observer = {
      observe: function (element) { state.observed.push(element) },
      unobserve: function (element) {
        const index = state.observed.indexOf(element)
        if (index !== -1) state.observed.splice(index, 1)
      },
      disconnect: function () { state.disconnected = true; state.observed.length = 0 },
    }

    state.observer = observer
    return observer
  }

  state.intersect = function (elements) {
    const entries = elements.map(function (element) {
      return { target: element, isIntersecting: true }
    })
    state.callback(entries, state.observer)
  }

  return { factory: factory, state: state }
}

function createImage(source) {
  const classes = []
  return {
    dataset: { src: source },
    src: '',
    classList: {
      add: function (name) { classes.push(name) },
      contains: function (name) { return classes.indexOf(name) !== -1 },
    },
  }
}
`,
      testCode: `test('элемент ставится под наблюдение', function () {
  const mock = createObserverMock()
  const loader = createLazyLoader(mock.factory)
  const image = createImage('/фото.jpg')

  loader.observe(image)

  expect(mock.state.observed).toEqual([image])
})

test('наблюдатель создаётся с запасом rootMargin', function () {
  const mock = createObserverMock()
  createLazyLoader(mock.factory)

  expect(mock.state.options.rootMargin).toBe('200px')
})

test('при появлении подставляется src', function () {
  const mock = createObserverMock()
  const loader = createLazyLoader(mock.factory)
  const image = createImage('/фото.jpg')

  loader.observe(image)
  mock.state.intersect([image])

  expect(image.src).toBe('/фото.jpg')
  expect(image.classList.contains('loaded')).toBe(true)
})

test('после загрузки наблюдение прекращается', function () {
  const mock = createObserverMock()
  const loader = createLazyLoader(mock.factory)
  const image = createImage('/фото.jpg')

  loader.observe(image)
  mock.state.intersect([image])

  expect(mock.state.observed).toEqual([])
})

test('невидимые элементы не трогаются', function () {
  const mock = createObserverMock()
  const loader = createLazyLoader(mock.factory)
  const image = createImage('/фото.jpg')

  loader.observe(image)
  mock.state.callback([{ target: image, isIntersecting: false }], mock.state.observer)

  expect(image.src).toBe('')
  expect(mock.state.observed).toEqual([image])
})

test('элемент без data-src не ломает загрузчик', function () {
  const mock = createObserverMock()
  const loader = createLazyLoader(mock.factory)
  const image = createImage('')

  loader.observe(image)
  mock.state.intersect([image])

  expect(image.src).toBe('')
  expect(mock.state.observed).toEqual([])
})

test('несколько элементов сразу', function () {
  const mock = createObserverMock()
  const loader = createLazyLoader(mock.factory)
  const first = createImage('/1.jpg')
  const second = createImage('/2.jpg')

  loader.observe(first)
  loader.observe(second)
  mock.state.intersect([first, second])

  expect(first.src).toBe('/1.jpg')
  expect(second.src).toBe('/2.jpg')
})

test('disconnect прекращает наблюдение', function () {
  const mock = createObserverMock()
  const loader = createLazyLoader(mock.factory)

  loader.observe(createImage('/1.jpg'))
  loader.disconnect()

  expect(mock.state.disconnected).toBe(true)
})`,
    },

    {
      slug: 'vk-deep-freeze',
      title: 'VK: глубокая заморозка объекта',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'deepFreeze',
      tags: ['objects'],
      companies: ['vk', 'avito'],
      descriptionMd: `\`Object.freeze\` замораживает только верхний уровень: вложенные объекты остаются
изменяемыми.

Реализуйте \`deepFreeze(value)\` — рекурсивную заморозку.

- замораживаются вложенные объекты и массивы;
- циклические ссылки не приводят к бесконечной рекурсии;
- примитивы возвращаются как есть;
- возвращается тот же объект, а не копия.

\`\`\`js
const config = deepFreeze({ api: { url: '/v1' } })
config.api.url = '/v2' // в строгом режиме — TypeError, иначе молча игнорируется
config.api.url         // '/v1'
\`\`\``,
      starterCode: `function deepFreeze(value) {
  // Ваш код здесь
}
`,
      solutionCode: `function deepFreeze(value, seen = new WeakSet()) {
  if (value === null || typeof value !== 'object') return value
  if (seen.has(value)) return value

  seen.add(value)

  // Замораживаем до обхода: иначе при циклической ссылке рекурсия
  // вернётся сюда раньше, чем объект станет замороженным.
  Object.freeze(value)

  for (const key of Reflect.ownKeys(value)) {
    const descriptor = Object.getOwnPropertyDescriptor(value, key)
    // У геттера нет value, и вызывать его ради заморозки нельзя:
    // это побочный эффект, которого никто не ждёт.
    if (descriptor && 'value' in descriptor) {
      deepFreeze(descriptor.value, seen)
    }
  }

  return value
}
`,
      solutionNotes: `Заморозка выполняется **до** обхода потомков. При циклической ссылке рекурсия
вернётся к тому же объекту, и \`WeakSet\` её оборвёт — но объект к тому моменту
уже должен быть заморожен, иначе он останется изменяемым.

\`Reflect.ownKeys\` вместо \`Object.keys\` захватывает символьные и неперечисляемые
свойства: замораживать нужно всё, а не только то, что видно в цикле \`for...in\`.

Дескриптор проверяется на наличие \`value\`, потому что у свойства-аксессора его
нет. Обращение \`value[key]\` вызвало бы геттер — а он может делать что угодно,
от запроса к сети до изменения состояния.

\`WeakSet\` не удерживает объекты от сборки мусора, в отличие от обычного \`Set\`.

Практическая оговорка: в нестрогом режиме присваивание в замороженный объект
молча игнорируется, а в строгом (и в модулях) бросает \`TypeError\`. Заморозка
не защищает от изменения объектов внутри \`Map\` и \`Set\` — их содержимое
дескрипторами не описывается.`,
      hints: [
        'Замораживайте объект ДО обхода его свойств.',
        'Циклы отслеживайте через WeakSet.',
        'Reflect.ownKeys захватит символы и неперечисляемые свойства.',
        'У свойства-геттера нет value — вызывать его нельзя.',
      ],
      testCode: `test('верхний уровень заморожен', function () {
  const object = deepFreeze({ a: 1 })
  expect(Object.isFrozen(object)).toBe(true)
})

test('вложенные объекты заморожены', function () {
  const object = deepFreeze({ nested: { deep: { value: 1 } } })

  expect(Object.isFrozen(object.nested)).toBe(true)
  expect(Object.isFrozen(object.nested.deep)).toBe(true)
})

test('массивы заморожены', function () {
  const object = deepFreeze({ list: [1, { a: 1 }] })

  expect(Object.isFrozen(object.list)).toBe(true)
  expect(Object.isFrozen(object.list[1])).toBe(true)
})

test('изменение не проходит', function () {
  const object = deepFreeze({ nested: { value: 1 } })

  try { object.nested.value = 2 } catch (error) { /* строгий режим */ }

  expect(object.nested.value).toBe(1)
})

test('циклическая ссылка не роняет рекурсию', function () {
  const object = { name: 'корень' }
  object.self = object

  deepFreeze(object)

  expect(Object.isFrozen(object)).toBe(true)
  expect(Object.isFrozen(object.self)).toBe(true)
})

test('возвращается тот же объект', function () {
  const source = { a: 1 }
  expect(deepFreeze(source)).toBe(source)
})

test('примитивы возвращаются как есть', function () {
  expect(deepFreeze(42)).toBe(42)
  expect(deepFreeze(null)).toBe(null)
  expect(deepFreeze('строка')).toBe('строка')
})

test('геттер не вызывается', function () {
  let calls = 0
  const object = {}
  Object.defineProperty(object, 'lazy', {
    get: function () { calls += 1; return { a: 1 } },
    enumerable: true,
    configurable: true,
  })

  deepFreeze(object)

  expect(calls).toBe(0)
})

test('символьные свойства обходятся', function () {
  const key = Symbol('вложенный')
  const object = {}
  object[key] = { a: 1 }

  deepFreeze(object)

  expect(Object.isFrozen(object[key])).toBe(true)
})`,
    },

    {
      slug: 'ozon-batch-requests',
      title: 'Озон: склейка одинаковых запросов',
      difficulty: 'hard',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'createBatcher',
      tags: ['async', 'performance'],
      companies: ['ozon', 'tbank'],
      descriptionMd: `На странице десятки компонентов независимо запрашивают данные по идентификатору.
Вместо десятков запросов нужен один — с массивом идентификаторов.

Реализуйте \`createBatcher(loadMany, windowMs)\`:

- возвращается функция \`load(id)\`, отдающая промис с данными;
- вызовы, сделанные в течение \`windowMs\`, накапливаются и уходят одним вызовом
  \`loadMany(ids)\`;
- \`loadMany\` получает **уникальные** идентификаторы и возвращает промис с
  массивом результатов в том же порядке;
- повторный запрос того же идентификатора в одном окне не дублируется — оба
  вызывающих получают один результат;
- если \`loadMany\` отклонилась, отклоняются все промисы этой пачки.

\`\`\`js
const load = createBatcher(ids => api.getUsers(ids), 10)

load(1); load(2); load(1)
// через 10 мс: один вызов api.getUsers([1, 2])
\`\`\``,
      starterCode: `function createBatcher(loadMany, windowMs) {
  // Ваш код здесь
}
`,
      solutionCode: `function createBatcher(loadMany, windowMs) {
  // Текущая накапливаемая пачка. null означает, что окно закрыто.
  let batch = null

  function flush() {
    const current = batch
    batch = null

    const ids = [...current.waiting.keys()]

    Promise.resolve()
      .then(() => loadMany(ids))
      .then(
        (results) => {
          ids.forEach((id, index) => {
            current.waiting.get(id).forEach((resolve) => resolve(results[index]))
          })
        },
        (error) => {
          for (const handlers of current.rejects.values()) {
            handlers.forEach((reject) => reject(error))
          }
        },
      )
  }

  return function load(id) {
    return new Promise((resolve, reject) => {
      if (batch === null) {
        batch = { waiting: new Map(), rejects: new Map(), timer: null }
        batch.timer = setTimeout(flush, windowMs)
      }

      // Одинаковые идентификаторы копятся под одним ключом:
      // в loadMany уйдёт только уникальный набор.
      if (!batch.waiting.has(id)) {
        batch.waiting.set(id, [])
        batch.rejects.set(id, [])
      }

      batch.waiting.get(id).push(resolve)
      batch.rejects.get(id).push(reject)
    })
  }
}
`,
      solutionNotes: `Приём называется батчингом запросов и лежит в основе DataLoader из экосистемы
GraphQL. Выигрыш двойной: меньше сетевых обращений и меньше нагрузки на бэкенд,
которому один запрос со списком обходится дешевле десяти одиночных.

Ключевая структура — карта «идентификатор → список ожидающих». Она решает сразу
две задачи: даёт уникальный набор идентификаторов для \`loadMany\` и позволяет
раздать один результат всем, кто его ждал.

Снимок пачки (\`const current = batch; batch = null\`) делается **до**
асинхронного вызова. Иначе вызовы, пришедшие пока запрос в полёте, дописались бы
в уже отправленную пачку и никогда не дождались бы ответа.

Порядок результатов задаётся порядком \`ids\`, а он берётся из порядка вставки в
\`Map\` — то есть из порядка первых обращений. Это контракт с \`loadMany\`, и его
стоит проговорить явно.

Обёртка \`Promise.resolve().then(() => loadMany(ids))\` защищает от синхронного
исключения внутри \`loadMany\`.

В боевом варианте сюда обычно добавляют ограничение на размер пачки: если за
окно накопилась тысяча идентификаторов, отправлять их одним запросом не стоит.`,
      hints: [
        'Копите карту «идентификатор → список ожидающих resolve».',
        'Снимайте пачку до асинхронного вызова, иначе в неё допишутся новые запросы.',
        'Порядок результатов задаётся порядком уникальных идентификаторов.',
      ],
      testCode: `test('вызовы в одном окне уходят одной пачкой', async function () {
  const calls = []
  const load = createBatcher(function (ids) {
    calls.push(ids)
    return Promise.resolve(ids.map(function (id) { return 'данные ' + id }))
  }, 10)

  const first = load(1)
  const second = load(2)

  await __clock.runAll()

  expect(calls).toEqual([[1, 2]])
  await expect(first).resolves.toBe('данные 1')
  await expect(second).resolves.toBe('данные 2')
})

test('дубликаты не попадают в запрос', async function () {
  const calls = []
  const load = createBatcher(function (ids) {
    calls.push(ids)
    return Promise.resolve(ids.map(function (id) { return id * 10 }))
  }, 10)

  const first = load(1)
  const second = load(1)

  await __clock.runAll()

  expect(calls).toEqual([[1]])
  await expect(first).resolves.toBe(10)
  await expect(second).resolves.toBe(10)
})

test('запросы в разных окнах уходят раздельно', async function () {
  const calls = []
  const load = createBatcher(function (ids) {
    calls.push(ids)
    return Promise.resolve(ids)
  }, 10)

  load(1)
  await __clock.tick(10)
  await __clock.flush()
  load(2)
  await __clock.runAll()

  expect(calls).toEqual([[1], [2]])
})

test('запрос, пришедший во время полёта, попадает в новую пачку', async function () {
  const calls = []
  const load = createBatcher(function (ids) {
    calls.push(ids)
    return new Promise(function (resolve) {
      setTimeout(function () { resolve(ids) }, 50)
    })
  }, 10)

  load(1)
  await __clock.tick(10)
  await __clock.flush()

  const late = load(2)
  await __clock.runAll()

  expect(calls).toEqual([[1], [2]])
  // loadMany возвращает сами идентификаторы, поэтому результат для 2 — это 2.
  await expect(late).resolves.toBe(2)
})

test('ошибка отклоняет все промисы пачки', async function () {
  const load = createBatcher(function () {
    return Promise.reject(new Error('сеть недоступна'))
  }, 10)

  const first = load(1)
  const second = load(2)

  await __clock.runAll()

  await expect(first).rejects.toThrow('сеть недоступна')
  await expect(second).rejects.toThrow('сеть недоступна')
})

test('синхронное исключение в loadMany обрабатывается', async function () {
  const load = createBatcher(function () { throw new Error('сломалось') }, 10)

  const promise = load(1)
  await __clock.runAll()

  await expect(promise).rejects.toThrow('сломалось')
})`,
    },
  ],
}
