import type { TrainerTopicSeed } from './types'

/**
 * Тема 17. Web API.
 *
 * Браузерных API в песочнице нет, поэтому в каждой задаче зависимости
 * передаются аргументом, а тесты подставляют мок. Это не упрощение ради
 * тренажёра: внедрение зависимостей — ровно то, что делает такой код
 * тестируемым и в реальном проекте.
 */
export const webApi: TrainerTopicSeed = {
  slug: 'web-api',
  title: 'Web API',
  description: 'Хранилище с TTL, отмена запросов, ретраи и работа с AbortController',
  category: 'webapi',
  icon: '🌐',
  order: 17,
  tasks: [
    {
      slug: 'storage-with-ttl',
      title: 'Хранилище с временем жизни',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'createStorage',
      tags: ['web-api'],
      companies: ['ozon', 'wildberries'],
      descriptionMd: `\`localStorage\` не умеет истекать: записанное лежит вечно. Реализуйте обёртку
\`createStorage(backend, prefix)\`, добавляющую время жизни.

\`backend\` — объект с методами \`getItem\`, \`setItem\`, \`removeItem\`, \`key\`,
\`length\` (интерфейс \`localStorage\`). \`prefix\` добавляется ко всем ключам.

Методы обёртки:

- \`set(key, value, ttlMs)\` — сохраняет значение; без \`ttlMs\` оно бессрочно;
- \`get(key)\` — значение или \`null\`, если его нет или срок истёк;
- \`remove(key)\`, \`clear()\` — удаление (\`clear\` трогает только свои ключи);
- \`cleanup()\` — удаляет все истёкшие записи, возвращает их количество.

Требования:

- значения любого типа, сериализуемого в JSON;
- истёкшая запись удаляется при первом же обращении;
- повреждённый JSON в хранилище не роняет \`get\` — запись считается отсутствующей;
- отказ \`setItem\` (переполнена квота) не роняет \`set\`, а возвращает \`false\`.`,
      starterCode: `function createStorage(backend, prefix = 'app:') {
  // Ваш код здесь
}
`,
      solutionCode: `function createStorage(backend, prefix = 'app:') {
  const withPrefix = (key) => prefix + key

  function readEntry(fullKey) {
    const raw = backend.getItem(fullKey)
    if (raw === null || raw === undefined) return null

    try {
      const entry = JSON.parse(raw)
      if (entry === null || typeof entry !== 'object') return null
      return entry
    } catch (error) {
      // Повреждённые данные считаем отсутствующими: чужая запись,
      // старый формат или обрыв записи — лечится одинаково.
      return null
    }
  }

  function isExpired(entry) {
    return typeof entry.expiresAt === 'number' && entry.expiresAt <= Date.now()
  }

  return {
    set(key, value, ttlMs) {
      const entry = { value }
      if (typeof ttlMs === 'number' && ttlMs > 0) entry.expiresAt = Date.now() + ttlMs

      try {
        backend.setItem(withPrefix(key), JSON.stringify(entry))
        return true
      } catch (error) {
        // Квота переполнена или приватный режим — не повод ронять приложение.
        return false
      }
    },

    get(key) {
      const fullKey = withPrefix(key)
      const entry = readEntry(fullKey)
      if (entry === null) return null

      if (isExpired(entry)) {
        backend.removeItem(fullKey)
        return null
      }

      return entry.value
    },

    remove(key) {
      backend.removeItem(withPrefix(key))
    },

    clear() {
      for (const fullKey of ownKeys()) backend.removeItem(fullKey)
    },

    cleanup() {
      let removed = 0

      for (const fullKey of ownKeys()) {
        const entry = readEntry(fullKey)
        if (entry === null || isExpired(entry)) {
          backend.removeItem(fullKey)
          removed += 1
        }
      }

      return removed
    },
  }

  // Ключи собираются заранее: удаление во время обхода сдвигает индексы.
  function ownKeys() {
    const keys = []

    for (let i = 0; i < backend.length; i++) {
      const key = backend.key(i)
      if (typeof key === 'string' && key.startsWith(prefix)) keys.push(key)
    }

    return keys
  }
}
`,
      solutionNotes: `Срок хранится вместе со значением (\`{ value, expiresAt }\`), а не отдельным
ключом: так запись атомарна и не может «потерять» свой срок.

Проверка истечения выполняется при чтении, а не по таймеру. Таймер не переживёт
перезагрузку страницы, а отметка времени — переживёт.

Сбор ключей до удаления обязателен. \`backend.key(i)\` работает по индексу, и
удаление во время обхода сдвигает оставшиеся — часть ключей была бы пропущена.
Эта ошибка воспроизводится и с настоящим \`localStorage\`.

\`try/catch\` вокруг \`JSON.parse\` нужен всегда: в хранилище может лежать что
угодно — запись другого приложения, данные старого формата, обрывок после сбоя.

\`setItem\` бросает \`QuotaExceededError\` при переполнении (~5 МБ) и в Safari в
приватном режиме. Возврат \`false\` вместо исключения позволяет вызывающему коду
продолжить работу без кэша.

Префикс изолирует записи приложения: \`clear()\` не трогает чужие ключи, в отличие
от \`localStorage.clear()\`.`,
      hints: [
        'Храните срок вместе со значением одним JSON-объектом.',
        'Проверяйте истечение при чтении — таймер не переживёт перезагрузку.',
        'Соберите ключи до удаления: key(i) работает по индексу.',
        'JSON.parse оборачивайте в try/catch, а setItem может бросить при переполнении квоты.',
      ],
      setupCode: `// Мок в интерфейсе localStorage.
function createBackendMock(options) {
  const data = new Map()
  const failOnSet = options && options.failOnSet

  return {
    get length() { return data.size },
    key: function (index) { return [...data.keys()][index] ?? null },
    getItem: function (key) { return data.has(key) ? data.get(key) : null },
    setItem: function (key, value) {
      if (failOnSet) throw new Error('QuotaExceededError')
      data.set(key, String(value))
    },
    removeItem: function (key) { data.delete(key) },
    _raw: data,
  }
}
`,
      testCode: `test('запись и чтение', function () {
  const storage = createStorage(createBackendMock())
  storage.set('имя', 'Аня')

  expect(storage.get('имя')).toBe('Аня')
})

test('значения любого типа', function () {
  const storage = createStorage(createBackendMock())
  storage.set('объект', { a: [1, 2] })

  expect(storage.get('объект')).toEqual({ a: [1, 2] })
})

test('отсутствующий ключ даёт null', function () {
  expect(createStorage(createBackendMock()).get('нет')).toBe(null)
})

test('запись живёт до истечения срока', async function () {
  const storage = createStorage(createBackendMock())
  storage.set('сессия', 'токен', 1000)

  await __clock.tick(999)
  expect(storage.get('сессия')).toBe('токен')

  await __clock.tick(1)
  expect(storage.get('сессия')).toBe(null)
})

test('истёкшая запись удаляется при чтении', async function () {
  const backend = createBackendMock()
  const storage = createStorage(backend)
  storage.set('сессия', 'токен', 100)

  await __clock.tick(100)
  storage.get('сессия')

  expect(backend.length).toBe(0)
})

test('без ttl запись бессрочна', async function () {
  const storage = createStorage(createBackendMock())
  storage.set('навсегда', 1)

  await __clock.tick(1000000)
  expect(storage.get('навсегда')).toBe(1)
})

test('повреждённый JSON не роняет чтение', function () {
  const backend = createBackendMock()
  backend.setItem('app:сломано', '{не json')
  const storage = createStorage(backend)

  expect(storage.get('сломано')).toBe(null)
})

test('переполнение квоты возвращает false', function () {
  const storage = createStorage(createBackendMock({ failOnSet: true }))
  expect(storage.set('ключ', 'значение')).toBe(false)
})

test('clear трогает только свои ключи', function () {
  const backend = createBackendMock()
  backend.setItem('чужой:ключ', 'значение')

  const storage = createStorage(backend, 'app:')
  storage.set('свой', 1)
  storage.clear()

  expect(backend.getItem('чужой:ключ')).toBe('значение')
  expect(storage.get('свой')).toBe(null)
})

test('cleanup удаляет истёкшие записи', async function () {
  const storage = createStorage(createBackendMock())
  storage.set('короткая', 1, 100)
  storage.set('длинная', 2, 10000)
  storage.set('вечная', 3)

  await __clock.tick(100)

  expect(storage.cleanup()).toBe(1)
  expect(storage.get('длинная')).toBe(2)
  expect(storage.get('вечная')).toBe(3)
})

test('remove удаляет запись', function () {
  const storage = createStorage(createBackendMock())
  storage.set('ключ', 1)
  storage.remove('ключ')

  expect(storage.get('ключ')).toBe(null)
})`,
    },

    {
      slug: 'fetch-with-timeout',
      title: 'Запрос с таймаутом и отменой',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'fetchWithTimeout',
      tags: ['web-api', 'async'],
      companies: ['ozon', 'avito', 'tbank'],
      descriptionMd: `У \`fetch\` нет встроенного таймаута: запрос может висеть сколько угодно.
Реализуйте \`fetchWithTimeout(fetchFn, url, options)\`.

\`options\`:

- \`timeoutMs\` — через сколько отменить запрос (по умолчанию 5000);
- \`signal\` — внешний сигнал отмены (необязательно);
- остальные поля передаются в \`fetchFn\` как есть.

Поведение:

- при срабатывании таймаута запрос отменяется, а промис отклоняется ошибкой с
  \`name === 'TimeoutError'\`;
- при отмене через внешний \`signal\` промис отклоняется ошибкой с
  \`name === 'AbortError'\`;
- таймер снимается в любом исходе — и при успехе, и при ошибке;
- \`fetchFn\` получает \`signal\`, по которому запрос можно прервать.

В тестах \`fetchFn\` подменён моком, время двигается через \`__clock\`.`,
      starterCode: `function fetchWithTimeout(fetchFn, url, options = {}) {
  // Ваш код здесь
}
`,
      solutionCode: `function fetchWithTimeout(fetchFn, url, options = {}) {
  const { timeoutMs = 5000, signal: externalSignal, ...rest } = options

  const controller = new AbortController()
  let timedOut = false

  const timer = setTimeout(() => {
    timedOut = true
    controller.abort()
  }, timeoutMs)

  // Внешняя отмена пробрасывается в наш контроллер: у запроса
  // должен быть один сигнал, а причин отмены — две.
  const onExternalAbort = () => controller.abort()

  if (externalSignal) {
    if (externalSignal.aborted) controller.abort()
    else externalSignal.addEventListener('abort', onExternalAbort)
  }

  const cleanup = () => {
    clearTimeout(timer)
    if (externalSignal) externalSignal.removeEventListener('abort', onExternalAbort)
  }

  return Promise.resolve()
    .then(() => fetchFn(url, { ...rest, signal: controller.signal }))
    .then(
      (response) => {
        cleanup()
        return response
      },
      (error) => {
        cleanup()

        if (timedOut) {
          const timeoutError = new Error('Превышено время ожидания: ' + timeoutMs + ' мс')
          timeoutError.name = 'TimeoutError'
          throw timeoutError
        }

        if (externalSignal && externalSignal.aborted) {
          const abortError = new Error('Запрос отменён')
          abortError.name = 'AbortError'
          throw abortError
        }

        throw error
      },
    )
}
`,
      solutionNotes: `У запроса может быть только один \`signal\`, а причин отмены две: таймаут и
внешняя отмена. Поэтому создаётся собственный контроллер, а внешний сигнал
пробрасывается в него подпиской на событие \`abort\`.

Флаг \`timedOut\` нужен, чтобы отличить одну причину от другой: сам сигнал этого
не сообщает — отмена выглядит одинаково. Разные имена ошибок важны для
вызывающего кода: таймаут обычно имеет смысл повторить, явную отмену — нет.

\`cleanup\` вызывается в обеих ветках. Невыключённый таймер продержит колбэк в
памяти до срабатывания, а неснятая подписка на \`abort\` — весь контроллер. На
странице с сотнями запросов это заметная утечка.

Проверка \`externalSignal.aborted\` до подписки обязательна: сигнал мог быть
отменён ещё до вызова, и события \`abort\` уже не будет.

Обёртка \`Promise.resolve().then(() => fetchFn(...))\` защищает от синхронного
исключения внутри \`fetchFn\`.

В современных браузерах часть этого решает \`AbortSignal.timeout(ms)\` и
\`AbortSignal.any([...])\` — но поддержка их появилась недавно, и на собеседовании
обычно просят именно ручную реализацию.`,
      hints: [
        'Создайте свой AbortController, а внешний сигнал пробросьте в него подпиской на abort.',
        'Заведите флаг, чтобы отличить таймаут от внешней отмены — сигнал этого не скажет.',
        'Снимайте таймер и подписку в обеих ветках, иначе получите утечку.',
        'Проверьте, не отменён ли внешний сигнал ещё до подписки.',
      ],
      setupCode: `// Мок fetch: отдаёт ответ через заданное время и уважает signal.
function createFetchMock(delayMs, response) {
  const calls = []

  const fetchFn = function (url, options) {
    calls.push({ url: url, options: options })

    return new Promise(function (resolve, reject) {
      function fail() {
        const error = new Error('Прервано')
        error.name = 'AbortError'
        reject(error)
      }

      // Как настоящий fetch: уже отменённый сигнал отклоняет запрос сразу,
      // не дожидаясь события abort — его уже не будет.
      if (options && options.signal && options.signal.aborted) {
        fail()
        return
      }

      const timer = setTimeout(function () {
        resolve(response !== undefined ? response : { ok: true, url: url })
      }, delayMs)

      if (options && options.signal) {
        options.signal.addEventListener('abort', function () {
          clearTimeout(timer)
          fail()
        })
      }
    })
  }

  fetchFn.calls = calls
  return fetchFn
}
`,
      testCode: `test('успешный запрос возвращает ответ', async function () {
  const fetchFn = createFetchMock(10, { ok: true, data: 'готово' })
  const promise = fetchWithTimeout(fetchFn, '/api', { timeoutMs: 1000 })

  await __clock.runAll()

  await expect(promise).resolves.toEqual({ ok: true, data: 'готово' })
})

test('таймаут отклоняет промис', async function () {
  const fetchFn = createFetchMock(5000)
  const promise = fetchWithTimeout(fetchFn, '/api', { timeoutMs: 100 })
  let captured = null
  promise.catch(function (error) { captured = error })

  await __clock.runAll()

  expect(captured).not.toBe(null)
  expect(captured.name).toBe('TimeoutError')
})

test('fetchFn получает signal', async function () {
  const fetchFn = createFetchMock(10)
  const promise = fetchWithTimeout(fetchFn, '/api', { timeoutMs: 1000 })

  await __clock.runAll()
  await promise

  expect(fetchFn.calls[0].options.signal).toBeDefined()
})

test('остальные опции передаются в fetchFn', async function () {
  const fetchFn = createFetchMock(10)
  const promise = fetchWithTimeout(fetchFn, '/api', {
    timeoutMs: 1000,
    method: 'POST',
    headers: { 'X-Test': '1' },
  })

  await __clock.runAll()
  await promise

  expect(fetchFn.calls[0].options.method).toBe('POST')
  expect(fetchFn.calls[0].options.headers).toEqual({ 'X-Test': '1' })
  expect(fetchFn.calls[0].options.timeoutMs).toBeUndefined()
})

test('внешняя отмена даёт AbortError', async function () {
  const fetchFn = createFetchMock(5000)
  const controller = new AbortController()

  const promise = fetchWithTimeout(fetchFn, '/api', {
    timeoutMs: 10000,
    signal: controller.signal,
  })
  let captured = null
  promise.catch(function (error) { captured = error })

  controller.abort()
  await __clock.runAll()

  expect(captured).not.toBe(null)
  expect(captured.name).toBe('AbortError')
})

test('уже отменённый сигнал отклоняет запрос сразу', async function () {
  const fetchFn = createFetchMock(5000)
  const controller = new AbortController()
  controller.abort()

  const promise = fetchWithTimeout(fetchFn, '/api', {
    timeoutMs: 10000,
    signal: controller.signal,
  })
  let captured = null
  promise.catch(function (error) { captured = error })

  await __clock.runAll()

  expect(captured).not.toBe(null)
  expect(captured.name).toBe('AbortError')
})

test('таймер снимается при успехе', async function () {
  const fetchFn = createFetchMock(10)
  const promise = fetchWithTimeout(fetchFn, '/api', { timeoutMs: 1000 })

  await __clock.runAll()
  await promise

  expect(__clock.pending()).toBe(0)
})

test('ошибка самого запроса пробрасывается', async function () {
  const failing = function () { return Promise.reject(new Error('сеть недоступна')) }
  const promise = fetchWithTimeout(failing, '/api', { timeoutMs: 1000 })

  await __clock.runAll()

  await expect(promise).rejects.toThrow('сеть недоступна')
})`,
    },

    {
      slug: 'structured-clone-polyfill',
      title: 'Полифилл structuredClone',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'structuredCopy',
      tags: ['web-api', 'objects'],
      descriptionMd: `\`structuredClone\` появился в браузерах недавно. Реализуйте его упрощённый
аналог \`structuredCopy(value)\`.

Отличия от глубокого клонирования объектов:

- поддерживаются \`Date\`, \`RegExp\`, \`Map\`, \`Set\`, типизированные массивы;
- **функции и символы не клонируются** — при их обнаружении бросается
  \`DataCloneError\` (обычный \`Error\` с \`name = 'DataCloneError'\`), как и в
  настоящем API;
- циклические ссылки поддерживаются;
- прототипы **не** сохраняются: экземпляр класса превращается в обычный объект.

\`\`\`js
structuredCopy({ date: new Date(0), list: [1, 2] })
structuredCopy({ fn: () => {} }) // DataCloneError
\`\`\``,
      starterCode: `function structuredCopy(value) {
  // Ваш код здесь
}
`,
      solutionCode: `function structuredCopy(value, seen = new WeakMap()) {
  if (typeof value === 'function' || typeof value === 'symbol') {
    const error = new Error('Значение нельзя клонировать: ' + typeof value)
    error.name = 'DataCloneError'
    throw error
  }

  if (value === null || typeof value !== 'object') return value

  if (seen.has(value)) return seen.get(value)

  if (value instanceof Date) return new Date(value.getTime())
  if (value instanceof RegExp) return new RegExp(value.source, value.flags)

  if (ArrayBuffer.isView(value)) {
    // Типизированный массив копируется своим же конструктором.
    return new value.constructor(value)
  }

  if (value instanceof Map) {
    const copy = new Map()
    seen.set(value, copy)
    value.forEach((item, key) => {
      copy.set(structuredCopy(key, seen), structuredCopy(item, seen))
    })
    return copy
  }

  if (value instanceof Set) {
    const copy = new Set()
    seen.set(value, copy)
    value.forEach((item) => copy.add(structuredCopy(item, seen)))
    return copy
  }

  if (Array.isArray(value)) {
    const copy = []
    seen.set(value, copy)
    value.forEach((item, index) => {
      copy[index] = structuredCopy(item, seen)
    })
    return copy
  }

  // Прототип намеренно не сохраняется: настоящий structuredClone
  // тоже отдаёт обычный объект, теряя класс.
  const copy = {}
  seen.set(value, copy)
  for (const key of Object.keys(value)) {
    copy[key] = structuredCopy(value[key], seen)
  }

  return copy
}
`,
      solutionNotes: `Отличие от задачи «глубокое клонирование» — в двух осознанных ограничениях,
которые есть и в настоящем API.

**Функции не клонируются.** Алгоритм структурного клонирования сериализует
значение для передачи между потоками (Web Worker, \`postMessage\`), а замыкание
функции передать невозможно. Отсюда \`DataCloneError\` вместо тихого пропуска.

**Прототипы теряются.** Экземпляр класса приходит на другую сторону обычным
объектом: определения класса там может не быть вовсе. Поэтому \`Object.create\`
с прототипом здесь был бы неверен — в отличие от задачи про \`deepClone\`.

Типизированный массив копируется собственным конструктором
(\`new value.constructor(value)\`), который создаёт новый буфер.

Циклы разрываются \`WeakMap\`, и копия кладётся туда до обхода потомков — иначе
рекурсия вернулась бы к незаполненному объекту.

Настоящий \`structuredClone\` умеет больше: \`ArrayBuffer\`, \`Blob\`, \`File\`,
\`ImageData\`, \`Error\` — и поддерживает передачу владения буфером через
\`transfer\`.`,
      hints: [
        'Функции и символы должны бросать ошибку, а не копироваться молча.',
        'Прототипы намеренно не сохраняются — экземпляр класса становится обычным объектом.',
        'Типизированный массив копируется своим же конструктором.',
        'Циклы разрывайте WeakMap, кладя копию до обхода потомков.',
      ],
      testCode: `test('вложенные структуры копируются', function () {
  const source = { a: 1, nested: { b: [1, 2] } }
  const copy = structuredCopy(source)

  expect(copy).toEqual(source)
  expect(copy.nested).not.toBe(source.nested)
})

test('Date и RegExp', function () {
  const copy = structuredCopy({ date: new Date(1000), re: /abc/gi })

  expect(copy.date.getTime()).toBe(1000)
  expect(String(copy.re)).toBe('/abc/gi')
})

test('Map и Set', function () {
  const copy = structuredCopy({ map: new Map([['k', 1]]), set: new Set([1, 2]) })

  expect(copy.map.get('k')).toBe(1)
  expect(copy.set.has(2)).toBe(true)
})

test('типизированный массив', function () {
  const source = new Uint8Array([1, 2, 3])
  const copy = structuredCopy(source)

  expect(copy).toBeInstanceOf(Uint8Array)
  expect(Array.from(copy)).toEqual([1, 2, 3])
  expect(copy).not.toBe(source)
})

test('циклическая ссылка', function () {
  const source = { name: 'корень' }
  source.self = source

  const copy = structuredCopy(source)

  expect(copy.self).toBe(copy)
})

test('функция бросает DataCloneError', function () {
  let captured = null
  try { structuredCopy({ fn: function () {} }) } catch (error) { captured = error }

  expect(captured).not.toBe(null)
  expect(captured.name).toBe('DataCloneError')
})

test('символ бросает DataCloneError', function () {
  let captured = null
  try { structuredCopy({ sym: Symbol('x') }) } catch (error) { captured = error }

  expect(captured).not.toBe(null)
  expect(captured.name).toBe('DataCloneError')
})

test('прототип не сохраняется', function () {
  class Point {
    constructor(x) { this.x = x }
  }

  const copy = structuredCopy(new Point(1))

  expect(copy.x).toBe(1)
  expect(copy instanceof Point).toBe(false)
})

test('примитивы возвращаются как есть', function () {
  expect(structuredCopy(42)).toBe(42)
  expect(structuredCopy(null)).toBe(null)
  expect(structuredCopy(undefined)).toBeUndefined()
})`,
    },

    {
      slug: 'idle-callback-scheduler',
      title: 'Планировщик фоновых задач',
      difficulty: 'hard',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'createScheduler',
      tags: ['web-api', 'performance'],
      companies: ['yandex', 'vk'],
      descriptionMd: `Тяжёлые вычисления в основном потоке блокируют отрисовку и делают интерфейс
неотзывчивым. Реализуйте \`createScheduler(schedule)\` — планировщик, выполняющий
задачи порциями.

\`schedule(callback)\` — функция, откладывающая выполнение (в браузере это
\`requestIdleCallback\` или \`setTimeout\`); в тестах подменяется моком.
\`callback\` получает объект с методом \`timeRemaining()\`, возвращающим оставшийся
бюджет в миллисекундах.

Методы планировщика:

- \`add(task, priority)\` — добавляет задачу (функцию), возвращает функцию отмены;
  чем **больше** \`priority\`, тем раньше выполнится задача (по умолчанию 0);
- \`flush()\` — выполняет все задачи немедленно;
- геттер \`size\`.

Требования:

- внутри одной порции задачи выполняются, пока \`timeRemaining() > 0\`;
- при равном приоритете порядок — как при добавлении;
- упавшая задача не мешает остальным;
- новая порция планируется, только если задачи остались;
- отменённая задача не выполняется.`,
      starterCode: `function createScheduler(schedule) {
  // Ваш код здесь
}
`,
      solutionCode: `function createScheduler(schedule) {
  const tasks = []
  let scheduled = false
  let sequence = 0

  function ensureScheduled() {
    if (scheduled || tasks.length === 0) return

    scheduled = true
    schedule(runChunk)
  }

  function runChunk(deadline) {
    scheduled = false

    // Пока есть бюджет — выполняем задачи одну за другой.
    while (tasks.length > 0 && deadline.timeRemaining() > 0) {
      runNext()
    }

    // Остаток переносим на следующую порцию.
    ensureScheduled()
  }

  function runNext() {
    // Наибольший приоритет, при равенстве — раньше добавленная.
    let bestIndex = 0
    for (let i = 1; i < tasks.length; i++) {
      const candidate = tasks[i]
      const best = tasks[bestIndex]
      if (
        candidate.priority > best.priority ||
        (candidate.priority === best.priority && candidate.order < best.order)
      ) {
        bestIndex = i
      }
    }

    const entry = tasks.splice(bestIndex, 1)[0]

    try {
      entry.task()
    } catch (error) {
      // Упавшая задача не должна остановить очередь.
      if (typeof console !== 'undefined') console.error(error)
    }
  }

  return {
    get size() {
      return tasks.length
    },

    add(task, priority = 0) {
      if (typeof task !== 'function') {
        throw new TypeError('Задача должна быть функцией')
      }

      const entry = { task, priority, order: sequence++ }
      tasks.push(entry)
      ensureScheduled()

      return () => {
        const index = tasks.indexOf(entry)
        if (index !== -1) tasks.splice(index, 1)
      }
    },

    flush() {
      while (tasks.length > 0) runNext()
    },
  }
}
`,
      solutionNotes: `Идея разбиения работы на порции — основа отзывчивого интерфейса. Кадр длится
16 мс; если занять их целиком, браузер не успеет отрисоваться, и страница
«подвиснет». Планировщик выполняет задачи, пока есть бюджет, и возвращает
управление браузеру.

\`timeRemaining()\` проверяется **перед** каждой задачей, а не после: узнать
заранее, сколько она займёт, невозможно, поэтому логика такая — «есть бюджет,
пробуем ещё одну».

Флаг \`scheduled\` не даёт заказать несколько порций подряд: добавление десяти
задач должно приводить к одной порции, а не к десяти.

Порядковый номер \`order\` обеспечивает стабильность при равных приоритетах.
Простая сортировка по приоритету этого не гарантирует, а поиск минимума без
номера переставил бы равные задачи.

Отмена возвращается замыканием над самой записью, а не над индексом: индексы
сдвигаются при выполнении соседних задач.

Именно так устроен планировщик React (Scheduler) — с очередью по приоритетам и
уступкой управления браузеру. Настоящий \`requestIdleCallback\` не поддерживается
в Safari, поэтому в продакшене его подменяют на \`setTimeout\` или
\`MessageChannel\`.`,
      hints: [
        'Проверяйте бюджет перед каждой задачей — сколько она займёт, заранее неизвестно.',
        'Флаг «порция уже заказана» не даст запланировать несколько подряд.',
        'Для стабильного порядка при равных приоритетах нужен порядковый номер.',
        'Функция отмены должна замыкаться на саму запись, а не на индекс.',
      ],
      setupCode: `// Мок планировщика: порции запускаются вручную с заданным бюджетом.
function createScheduleMock() {
  const state = { pending: [], calls: 0 }

  const schedule = function (callback) {
    state.calls += 1
    state.pending.push(callback)
  }

  // Выполнить одну запланированную порцию с бюджетом budgetSteps задач.
  state.runChunk = function (budgetSteps) {
    const callback = state.pending.shift()
    if (!callback) return

    let left = budgetSteps
    callback({ timeRemaining: function () { return left-- > 0 ? 10 : 0 } })
  }

  state.runAll = function () {
    let guard = 0
    while (state.pending.length > 0 && guard++ < 100) state.runChunk(1000)
  }

  return { schedule: schedule, state: state }
}
`,
      testCode: `test('задачи выполняются в порции', function () {
  const mock = createScheduleMock()
  const scheduler = createScheduler(mock.schedule)
  const seen = []

  scheduler.add(function () { seen.push(1) })
  scheduler.add(function () { seen.push(2) })

  mock.state.runAll()

  expect(seen).toEqual([1, 2])
})

test('приоритет определяет порядок', function () {
  const mock = createScheduleMock()
  const scheduler = createScheduler(mock.schedule)
  const seen = []

  scheduler.add(function () { seen.push('низкий') }, 0)
  scheduler.add(function () { seen.push('высокий') }, 10)
  scheduler.add(function () { seen.push('средний') }, 5)

  mock.state.runAll()

  expect(seen).toEqual(['высокий', 'средний', 'низкий'])
})

test('при равном приоритете порядок добавления', function () {
  const mock = createScheduleMock()
  const scheduler = createScheduler(mock.schedule)
  const seen = []

  scheduler.add(function () { seen.push(1) }, 5)
  scheduler.add(function () { seen.push(2) }, 5)
  scheduler.add(function () { seen.push(3) }, 5)

  mock.state.runAll()

  expect(seen).toEqual([1, 2, 3])
})

test('порция ограничена бюджетом', function () {
  const mock = createScheduleMock()
  const scheduler = createScheduler(mock.schedule)
  const seen = []

  for (let i = 0; i < 5; i++) scheduler.add(function () { seen.push(i) })

  mock.state.runChunk(2)

  expect(seen).toHaveLength(2)
  expect(scheduler.size).toBe(3)
})

test('остаток переносится на следующую порцию', function () {
  const mock = createScheduleMock()
  const scheduler = createScheduler(mock.schedule)
  let calls = 0

  for (let i = 0; i < 4; i++) scheduler.add(function () { calls += 1 })

  mock.state.runChunk(2)
  mock.state.runChunk(2)

  expect(calls).toBe(4)
  expect(scheduler.size).toBe(0)
})

test('несколько задач заказывают одну порцию', function () {
  const mock = createScheduleMock()
  const scheduler = createScheduler(mock.schedule)

  scheduler.add(function () {})
  scheduler.add(function () {})
  scheduler.add(function () {})

  expect(mock.state.calls).toBe(1)
})

test('пустая очередь не планирует порцию', function () {
  const mock = createScheduleMock()
  const scheduler = createScheduler(mock.schedule)
  const cancel = scheduler.add(function () {})
  cancel()

  mock.state.runAll()

  expect(mock.state.calls).toBe(1)
  expect(scheduler.size).toBe(0)
})

test('отменённая задача не выполняется', function () {
  const mock = createScheduleMock()
  const scheduler = createScheduler(mock.schedule)
  const seen = []

  scheduler.add(function () { seen.push('первая') })
  const cancel = scheduler.add(function () { seen.push('отменённая') })
  cancel()

  mock.state.runAll()

  expect(seen).toEqual(['первая'])
})

test('упавшая задача не мешает остальным', function () {
  const mock = createScheduleMock()
  const scheduler = createScheduler(mock.schedule)
  const seen = []

  scheduler.add(function () { throw new Error('упала') })
  scheduler.add(function () { seen.push('дошло') })

  mock.state.runAll()

  expect(seen).toEqual(['дошло'])
})

test('flush выполняет всё немедленно', function () {
  const mock = createScheduleMock()
  const scheduler = createScheduler(mock.schedule)
  let calls = 0

  for (let i = 0; i < 10; i++) scheduler.add(function () { calls += 1 })
  scheduler.flush()

  expect(calls).toBe(10)
  expect(scheduler.size).toBe(0)
})

test('не-функция бросает TypeError', function () {
  const mock = createScheduleMock()
  const scheduler = createScheduler(mock.schedule)

  expect(function () { scheduler.add(42) }).toThrow(TypeError)
})`,
    },
  ],
}
