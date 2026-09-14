import type { TrainerTopicSeed } from './types'

/**
 * Тема 14. Паттерны проектирования.
 *
 * На фронтенде спрашивают не «расскажите про GoF», а «напишите EventEmitter» или
 * «сделайте так, чтобы объект нельзя было создать дважды». Здесь — именно
 * прикладные формулировки.
 */
export const patterns: TrainerTopicSeed = {
  slug: 'patterns',
  title: 'Паттерны',
  description: 'EventEmitter, Observer, Singleton, Proxy-валидатор, Factory и Builder',
  category: 'patterns',
  icon: '🧱',
  order: 14,
  tasks: [
    {
      slug: 'event-emitter',
      title: 'EventEmitter',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['js', 'ts'],
      entryName: 'EventEmitter',
      tags: ['patterns'],
      companies: ['yandex', 'ozon', 'avito', 'faang'],
      descriptionMd: `Реализуйте классический \`EventEmitter\` в стиле Node.js.

Методы:

- \`on(event, listener)\` — подписка, возвращает \`this\` для цепочек;
- \`off(event, listener)\` — отписка;
- \`once(event, listener)\` — подписка на одно срабатывание;
- \`emit(event, ...args)\` — возвращает \`true\`, если были слушатели;
- \`listenerCount(event)\` — количество слушателей.

Требования:

- \`off\` должен снимать и подписку, сделанную через \`once\`;
- отписка во время \`emit\` не ломает текущую рассылку;
- слушатели вызываются в порядке подписки.

Эту задачу просят написать чаще любой другой из «паттернов».`,
      starterCode: `class EventEmitter {
  // Ваш код здесь
}
`,
      starterCodeTs: `type Listener = (...args: unknown[]) => void

class EventEmitter {
  // Ваш код здесь
}
`,
      solutionCode: `class EventEmitter {
  #listeners = new Map()

  on(event, listener) {
    if (typeof listener !== 'function') {
      throw new TypeError('Слушатель должен быть функцией')
    }

    if (!this.#listeners.has(event)) this.#listeners.set(event, [])
    this.#listeners.get(event).push(listener)

    return this
  }

  off(event, listener) {
    const list = this.#listeners.get(event)
    if (!list) return this

    // Через once подписана обёртка, поэтому ищем и по ссылке на оригинал.
    const index = list.findIndex(
      (item) => item === listener || item.original === listener,
    )
    if (index !== -1) list.splice(index, 1)
    if (list.length === 0) this.#listeners.delete(event)

    return this
  }

  once(event, listener) {
    const wrapped = (...args) => {
      this.off(event, wrapped)
      listener.apply(this, args)
    }

    wrapped.original = listener
    return this.on(event, wrapped)
  }

  emit(event, ...args) {
    const list = this.#listeners.get(event)
    if (!list || list.length === 0) return false

    // Копия: слушатель может отписаться прямо во время рассылки.
    for (const listener of list.slice()) {
      listener.apply(this, args)
    }

    return true
  }

  listenerCount(event) {
    const list = this.#listeners.get(event)
    return list ? list.length : 0
  }
}
`,
      solutionCodeTs: `type Listener = ((...args: unknown[]) => void) & { original?: (...args: unknown[]) => void }

class EventEmitter {
  readonly #listeners = new Map<string, Listener[]>()

  on(event: string, listener: Listener): this {
    if (typeof listener !== 'function') {
      throw new TypeError('Слушатель должен быть функцией')
    }

    const list = this.#listeners.get(event)
    if (list) list.push(listener)
    else this.#listeners.set(event, [listener])

    return this
  }

  off(event: string, listener: Listener): this {
    const list = this.#listeners.get(event)
    if (!list) return this

    const index = list.findIndex((item) => item === listener || item.original === listener)
    if (index !== -1) list.splice(index, 1)
    if (list.length === 0) this.#listeners.delete(event)

    return this
  }

  once(event: string, listener: Listener): this {
    const wrapped: Listener = (...args: unknown[]): void => {
      this.off(event, wrapped)
      listener.apply(this, args)
    }

    wrapped.original = listener
    return this.on(event, wrapped)
  }

  emit(event: string, ...args: unknown[]): boolean {
    const list = this.#listeners.get(event)
    if (!list || list.length === 0) return false

    for (const listener of list.slice()) {
      listener.apply(this, args)
    }

    return true
  }

  listenerCount(event: string): number {
    return this.#listeners.get(event)?.length ?? 0
  }
}
`,
      solutionNotes: `Отписка во время рассылки — главная ловушка задачи. \`once\` отписывается всегда,
и если итерировать по живому массиву, \`splice\` сдвинет элементы и следующий
слушатель будет пропущен. Копия \`list.slice()\` решает это.

\`wrapped.original\` нужна, чтобы \`off(event, listener)\` снимал и подписку через
\`once\`: в списке лежит обёртка, а пользователь передаёт исходную функцию. Именно
так устроен и настоящий \`EventEmitter\` в Node.js.

В \`once\` отписка идёт **до** вызова слушателя. Если слушатель бросит исключение,
подписка всё равно снята — иначе одноразовый слушатель остался бы навсегда.

Отличие от \`EventBus\` из задач Авито: там исключения слушателей изолируются, а
здесь, как в Node.js, пробрасываются наружу. Это осознанный выбор контракта, и
на собеседовании его стоит проговорить.

Возврат \`this\` из \`on\`/\`off\` даёт цепочки вызовов.`,
      hints: [
        'В emit итерируйте по копии списка.',
        'once подписывает обёртку — сохраните ссылку на оригинал, чтобы off её нашёл.',
        'Отписывайтесь в once до вызова слушателя.',
      ],
      testCode: `test('подписка и рассылка', function () {
  const emitter = new EventEmitter()
  const seen = []

  emitter.on('данные', function (value) { seen.push(value) })

  expect(emitter.emit('данные', 42)).toBe(true)
  expect(seen).toEqual([42])
})

test('emit без слушателей возвращает false', function () {
  expect(new EventEmitter().emit('нет')).toBe(false)
})

test('порядок слушателей сохраняется', function () {
  const emitter = new EventEmitter()
  const seen = []

  emitter.on('e', function () { seen.push(1) })
  emitter.on('e', function () { seen.push(2) })
  emitter.emit('e')

  expect(seen).toEqual([1, 2])
})

test('off снимает подписку', function () {
  const emitter = new EventEmitter()
  let calls = 0
  function listener() { calls += 1 }

  emitter.on('e', listener).off('e', listener)
  emitter.emit('e')

  expect(calls).toBe(0)
})

test('once срабатывает один раз', function () {
  const emitter = new EventEmitter()
  let calls = 0

  emitter.once('e', function () { calls += 1 })
  emitter.emit('e')
  emitter.emit('e')

  expect(calls).toBe(1)
})

test('off снимает подписку, сделанную через once', function () {
  const emitter = new EventEmitter()
  let calls = 0
  function listener() { calls += 1 }

  emitter.once('e', listener)
  emitter.off('e', listener)
  emitter.emit('e')

  expect(calls).toBe(0)
  expect(emitter.listenerCount('e')).toBe(0)
})

test('отписка во время рассылки не ломает её', function () {
  const emitter = new EventEmitter()
  const seen = []

  function first() { seen.push('первый'); emitter.off('e', first) }
  function second() { seen.push('второй') }

  emitter.on('e', first).on('e', second)
  emitter.emit('e')

  expect(seen).toEqual(['первый', 'второй'])
})

test('listenerCount считает слушателей', function () {
  const emitter = new EventEmitter()

  expect(emitter.listenerCount('e')).toBe(0)
  emitter.on('e', function () {})
  emitter.once('e', function () {})
  expect(emitter.listenerCount('e')).toBe(2)
})

test('аргументы доходят до слушателя', function () {
  const emitter = new EventEmitter()
  let received = null

  emitter.on('e', function (a, b) { received = [a, b] })
  emitter.emit('e', 'первый', 'второй')

  expect(received).toEqual(['первый', 'второй'])
})

test('методы возвращают this для цепочек', function () {
  const emitter = new EventEmitter()
  expect(emitter.on('e', function () {})).toBe(emitter)
})

test('не-функция бросает TypeError', function () {
  expect(function () { new EventEmitter().on('e', 42) }).toThrow(TypeError)
})`,
    },

    {
      slug: 'observable-store',
      title: 'Наблюдаемое хранилище',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'createStore',
      tags: ['patterns'],
      companies: ['avito', 'vk'],
      descriptionMd: `Реализуйте \`createStore(initialState)\` — минимальное хранилище состояния в духе
Redux или Zustand.

Возвращается объект с методами:

- \`getState()\` — текущее состояние;
- \`setState(patch)\` — сливает объект-патч (или результат функции
  \`(state) => patch\`) в состояние и уведомляет подписчиков;
- \`subscribe(listener)\` — подписка, возвращает функцию отписки; слушатель
  получает \`(nextState, prevState)\`.

Требования:

- состояние нельзя изменить снаружи: \`getState()\` возвращает то, что нельзя
  испортить случайной мутацией;
- если после слияния ничего не изменилось, подписчики **не** уведомляются;
- подписка во время уведомления не срабатывает в текущем цикле.`,
      starterCode: `function createStore(initialState) {
  // Ваш код здесь
}
`,
      solutionCode: `function createStore(initialState) {
  let state = Object.freeze({ ...initialState })
  const listeners = new Set()

  function getState() {
    return state
  }

  function setState(patch) {
    const partial = typeof patch === 'function' ? patch(state) : patch
    if (partial === null || typeof partial !== 'object') return state

    const next = Object.freeze({ ...state, ...partial })

    // Если ни одно значение не поменялось, уведомлять не о чем.
    const changed = Object.keys(next).some((key) => !Object.is(next[key], state[key]))
    if (!changed && Object.keys(next).length === Object.keys(state).length) return state

    const previous = state
    state = next

    // Снимок подписчиков: подписка во время уведомления не должна
    // сработать в этом же цикле, отписка — не должна ломать обход.
    for (const listener of [...listeners]) listener(state, previous)

    return state
  }

  function subscribe(listener) {
    if (typeof listener !== 'function') {
      throw new TypeError('Слушатель должен быть функцией')
    }

    listeners.add(listener)
    return () => listeners.delete(listener)
  }

  return { getState, setState, subscribe }
}
`,
      solutionNotes: `Состояние заморожено и заменяется целиком, а не мутируется. Это даёт дешёвое
сравнение: достаточно проверить ссылки на значения, глубокое сравнение не нужно.
На той же идее построены \`React.memo\` и селекторы Redux.

Проверка «изменилось ли что-нибудь» нужна, чтобы \`setState\` с тем же значением не
дёргал подписчиков. В UI это прямая экономия на перерисовках.

Снимок \`[...listeners]\` перед обходом решает две задачи сразу: подписка,
сделанная из слушателя, не сработает в этом же цикле (иначе порядок уведомлений
стал бы непредсказуемым), а отписка не сломает итерацию.

\`Set\` вместо массива даёт отписку за O(1) и автоматически исключает дубли
одного и того же слушателя.

Функциональная форма \`setState(state => patch)\` — тот же приём, что в React:
она гарантирует, что патч считается от актуального состояния.`,
      hints: [
        'Замораживайте состояние и заменяйте его целиком, а не мутируйте.',
        'Перед уведомлением сравните значения — иначе подписчики сработают впустую.',
        'Обходите копию множества подписчиков.',
      ],
      testCode: `test('начальное состояние доступно', function () {
  expect(createStore({ count: 0 }).getState()).toEqual({ count: 0 })
})

test('setState сливает патч', function () {
  const store = createStore({ count: 0, name: 'а' })
  store.setState({ count: 1 })

  expect(store.getState()).toEqual({ count: 1, name: 'а' })
})

test('функциональная форма setState', function () {
  const store = createStore({ count: 1 })
  store.setState(function (state) { return { count: state.count + 1 } })

  expect(store.getState().count).toBe(2)
})

test('подписчики получают новое и прошлое состояние', function () {
  const store = createStore({ count: 0 })
  const calls = []

  store.subscribe(function (next, previous) { calls.push([next.count, previous.count]) })
  store.setState({ count: 5 })

  expect(calls).toEqual([[5, 0]])
})

test('состояние нельзя испортить мутацией', function () {
  const store = createStore({ count: 0 })
  const state = store.getState()

  try { state.count = 99 } catch (error) { /* строгий режим */ }

  expect(store.getState().count).toBe(0)
})

test('без изменений подписчики не уведомляются', function () {
  const store = createStore({ count: 1 })
  let calls = 0

  store.subscribe(function () { calls += 1 })
  store.setState({ count: 1 })

  expect(calls).toBe(0)
})

test('отписка работает', function () {
  const store = createStore({ count: 0 })
  let calls = 0

  const unsubscribe = store.subscribe(function () { calls += 1 })
  store.setState({ count: 1 })
  unsubscribe()
  store.setState({ count: 2 })

  expect(calls).toBe(1)
})

test('подписка во время уведомления не срабатывает в этом цикле', function () {
  const store = createStore({ count: 0 })
  const seen = []

  store.subscribe(function () {
    seen.push('первый')
    store.subscribe(function () { seen.push('поздний') })
  })

  store.setState({ count: 1 })

  expect(seen).toEqual(['первый'])
})

test('новое состояние — новый объект', function () {
  const store = createStore({ count: 0 })
  const before = store.getState()
  store.setState({ count: 1 })

  expect(store.getState()).not.toBe(before)
})`,
    },

    {
      slug: 'singleton',
      title: 'Singleton',
      difficulty: 'easy',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'Config',
      tags: ['patterns'],
      companies: ['sber'],
      descriptionMd: `Реализуйте класс \`Config\` в виде синглтона: сколько бы раз ни вызвали
\`new Config()\`, возвращается один и тот же экземпляр.

Требования:

- \`new Config({ url: '/api' })\` при первом вызове задаёт настройки;
- при повторном вызове аргументы игнорируются, возвращается созданный ранее
  экземпляр;
- \`Config.getInstance()\` возвращает тот же экземпляр (создавая его при
  необходимости);
- \`Config.reset()\` сбрасывает синглтон — нужно для тестов;
- метод \`get(key)\` читает настройку.`,
      starterCode: `class Config {
  // Ваш код здесь
}
`,
      solutionCode: `class Config {
  // Статическое приватное поле: снаружи к нему не подобраться.
  static #instance = null

  #settings

  constructor(settings = {}) {
    // Конструктор, вернувший объект, перекрывает создаваемый экземпляр —
    // именно на этом и держится синглтон через new.
    if (Config.#instance !== null) return Config.#instance

    this.#settings = { ...settings }
    Config.#instance = this
  }

  static getInstance(settings) {
    return Config.#instance !== null ? Config.#instance : new Config(settings)
  }

  static reset() {
    Config.#instance = null
  }

  get(key) {
    return this.#settings[key]
  }
}
`,
      solutionNotes: `Возврат объекта из конструктора перекрывает создаваемый экземпляр — это и
делает \`new Config()\` синглтоном без всяких обходных путей. То же свойство
оператора \`new\` разбиралось в задаче «Свой оператор new».

Статическое приватное поле \`#instance\` по-настоящему закрыто: его нельзя
подменить снаружи, в отличие от \`Config._instance\`.

\`reset()\` существует ради тестируемости. Синглтон — глобальное состояние, и без
способа его сбросить тесты начинают влиять друг на друга. Это, кстати, главная
претензия к паттерну.

В модульном JavaScript синглтон часто не нужен вовсе: модуль и так вычисляется
один раз, и \`export const config = createConfig()\` даёт тот же эффект проще и
без скрытого глобального состояния. Класс-синглтон уместен, когда нужна ленивая
инициализация с параметрами.`,
      hints: [
        'Конструктор может вернуть объект — это перекроет создаваемый экземпляр.',
        'Экземпляр храните в статическом приватном поле.',
        'reset() нужен, чтобы тесты не влияли друг на друга.',
      ],
      testCode: `test('повторный new возвращает тот же экземпляр', function () {
  Config.reset()
  const first = new Config({ url: '/api' })
  const second = new Config({ url: '/другое' })

  expect(second).toBe(first)
  expect(second.get('url')).toBe('/api')
})

test('getInstance возвращает тот же экземпляр', function () {
  Config.reset()
  const created = new Config({ url: '/api' })

  expect(Config.getInstance()).toBe(created)
})

test('getInstance создаёт экземпляр при необходимости', function () {
  Config.reset()
  const instance = Config.getInstance({ url: '/lazy' })

  expect(instance.get('url')).toBe('/lazy')
  expect(Config.getInstance()).toBe(instance)
})

test('reset сбрасывает синглтон', function () {
  Config.reset()
  const first = new Config({ url: '/первый' })
  Config.reset()
  const second = new Config({ url: '/второй' })

  expect(second).not.toBe(first)
  expect(second.get('url')).toBe('/второй')
})

test('настройки читаются через get', function () {
  Config.reset()
  const config = new Config({ url: '/api', timeout: 5000 })

  expect(config.get('timeout')).toBe(5000)
  expect(config.get('нет')).toBeUndefined()
})

test('настройки не связаны с исходным объектом', function () {
  Config.reset()
  const settings = { url: '/api' }
  const config = new Config(settings)
  settings.url = '/подменили'

  expect(config.get('url')).toBe('/api')
})`,
    },

    {
      slug: 'proxy-validator',
      title: 'Валидация через Proxy',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'createValidated',
      tags: ['patterns', 'objects'],
      companies: ['tbank', 'sber'],
      descriptionMd: `Реализуйте \`createValidated(target, schema)\` — обёртку над объектом, которая
проверяет значения при записи.

\`schema\` — объект, где ключу соответствует функция-валидатор: она возвращает
\`true\` или строку с описанием ошибки.

\`\`\`js
const user = createValidated({ age: 0 }, {
  age: value => typeof value === 'number' && value >= 0 || 'возраст должен быть неотрицательным числом',
})

user.age = 25   // ок
user.age = -1   // TypeError: возраст должен быть неотрицательным числом
\`\`\`

Требования:

- запись невалидного значения бросает \`TypeError\` с текстом от валидатора и не
  меняет объект;
- ключи без валидатора записываются свободно;
- чтение несуществующего ключа бросает \`ReferenceError\` — это ловит опечатки;
- \`delete\` работает как обычно.`,
      starterCode: `function createValidated(target, schema) {
  // Ваш код здесь
}
`,
      solutionCode: `function createValidated(target, schema) {
  return new Proxy(target, {
    get(object, key, receiver) {
      // Символы пропускаем: Symbol.toPrimitive, Symbol.iterator и прочие
      // служебные обращения не должны падать.
      if (typeof key === 'symbol' || key in object) {
        return Reflect.get(object, key, receiver)
      }

      throw new ReferenceError('Свойство ' + String(key) + ' не существует')
    },

    set(object, key, value, receiver) {
      const validate = schema[key]

      if (typeof validate === 'function') {
        const result = validate(value)
        if (result !== true) {
          throw new TypeError(typeof result === 'string' ? result : 'Некорректное значение ' + String(key))
        }
      }

      return Reflect.set(object, key, value, receiver)
    },

    has(object, key) {
      return Reflect.has(object, key)
    },

    deleteProperty(object, key) {
      return Reflect.deleteProperty(object, key)
    },
  })
}
`,
      solutionNotes: `\`Proxy\` перехватывает операции с объектом, не меняя его самого. Это позволяет
добавить проверки к уже существующей структуре — в отличие от геттеров и
сеттеров, которые пришлось бы объявлять для каждого свойства заранее и которые
не работают для новых ключей.

\`Reflect\` вызывает операцию по умолчанию. Писать \`object[key] = value\` вместо
\`Reflect.set\` можно, но \`Reflect\` корректно передаёт \`receiver\` — это важно, когда
у объекта есть наследуемые аксессоры.

Пропуск символьных ключей в \`get\` обязателен. Движок сам обращается к
\`Symbol.toPrimitive\`, \`Symbol.iterator\`, \`Symbol.toStringTag\` — и без этой ветки
обычное приведение объекта к строке падало бы с \`ReferenceError\`.

Строгое сравнение \`result !== true\` означает, что валидатор обязан вернуть
именно \`true\`. Так «истинная» строка не проходит случайно за успех — она как раз
и есть сообщение об ошибке.

Практическая оговорка: \`Proxy\` не бесплатен, обращения через него в разы
медленнее прямых. Для горячих путей он не годится; его место — отладочные
обёртки, реактивность (Vue 3), валидация конфигурации.`,
      hints: [
        'Перехватывайте get и set через Proxy и вызывайте операцию по умолчанию через Reflect.',
        'Символьные ключи в get надо пропускать — иначе сломается приведение к строке.',
        'Валидатор обязан вернуть именно true; строка — это сообщение об ошибке.',
      ],
      setupCode: `const userSchema = {
  age: function (value) {
    return (typeof value === 'number' && value >= 0) || 'возраст должен быть неотрицательным числом'
  },
  name: function (value) {
    return (typeof value === 'string' && value.length > 0) || 'имя не может быть пустым'
  },
}
`,
      testCode: `test('валидное значение записывается', function () {
  const user = createValidated({ age: 0, name: 'Аня' }, userSchema)
  user.age = 25

  expect(user.age).toBe(25)
})

test('невалидное значение бросает TypeError', function () {
  const user = createValidated({ age: 0, name: 'Аня' }, userSchema)

  expect(function () { user.age = -1 }).toThrow('возраст должен быть неотрицательным числом')
  expect(user.age).toBe(0)
})

test('другой тип тоже отвергается', function () {
  const user = createValidated({ age: 0, name: 'Аня' }, userSchema)

  expect(function () { user.name = '' }).toThrow('имя не может быть пустым')
})

test('ключи без валидатора записываются свободно', function () {
  const user = createValidated({ age: 0, name: 'Аня' }, userSchema)
  user.city = 'Москва'

  expect(user.city).toBe('Москва')
})

test('чтение несуществующего ключа бросает ReferenceError', function () {
  const user = createValidated({ age: 0 }, userSchema)

  expect(function () { return user.опечатка }).toThrow(ReferenceError)
})

test('приведение к строке не падает', function () {
  const user = createValidated({ age: 1 }, userSchema)

  expect(function () { return String(user) }).not.toThrow()
})

test('оператор in работает', function () {
  const user = createValidated({ age: 0 }, userSchema)

  expect('age' in user).toBe(true)
  expect('нет' in user).toBe(false)
})

test('delete работает', function () {
  const user = createValidated({ age: 0, city: 'Москва' }, userSchema)
  delete user.city

  expect('city' in user).toBe(false)
})

test('исходный объект меняется вместе с прокси', function () {
  const source = { age: 0 }
  const user = createValidated(source, userSchema)
  user.age = 10

  expect(source.age).toBe(10)
})`,
    },

    {
      slug: 'builder-query',
      title: 'Builder: конструктор запроса',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'createQuery',
      tags: ['patterns'],
      companies: ['ozon'],
      descriptionMd: `Реализуйте \`createQuery(table)\` — построитель SQL-подобного запроса с цепочкой
вызовов.

Методы:

- \`select(...columns)\` — выбираемые колонки (по умолчанию \`*\`);
- \`where(column, operator, value)\` — условие, вызовов может быть несколько;
- \`orderBy(column, direction)\` — сортировка (\`'asc'\` по умолчанию);
- \`limit(count)\` — ограничение;
- \`build()\` — собранная строка запроса.

\`\`\`js
createQuery('users')
  .select('id', 'name')
  .where('age', '>', 18)
  .where('city', '=', 'Москва')
  .orderBy('name')
  .limit(10)
  .build()
// SELECT id, name FROM users WHERE age > 18 AND city = 'Москва' ORDER BY name ASC LIMIT 10
\`\`\`

Строки в значениях оборачиваются одинарными кавычками, числа — нет.
**Каждый метод возвращает новый построитель**, исходный не меняется.`,
      starterCode: `function createQuery(table) {
  // Ваш код здесь
}
`,
      solutionCode: `function formatValue(value) {
  if (typeof value === 'string') return "'" + value.replace(/'/g, "''") + "'"
  if (value === null) return 'NULL'
  return String(value)
}

function createQuery(table, state) {
  const current = state || { columns: [], conditions: [], order: null, limit: null }

  // Каждый метод возвращает новый построитель: общее изменяемое состояние
  // сделало бы переиспользование частично собранного запроса ловушкой.
  const next = (patch) => createQuery(table, { ...current, ...patch })

  return {
    select(...columns) {
      return next({ columns: current.columns.concat(columns) })
    },

    where(column, operator, value) {
      return next({
        conditions: current.conditions.concat(
          column + ' ' + operator + ' ' + formatValue(value),
        ),
      })
    },

    orderBy(column, direction = 'asc') {
      return next({ order: column + ' ' + String(direction).toUpperCase() })
    },

    limit(count) {
      return next({ limit: count })
    },

    build() {
      const columns = current.columns.length > 0 ? current.columns.join(', ') : '*'
      let query = 'SELECT ' + columns + ' FROM ' + table

      if (current.conditions.length > 0) {
        query += ' WHERE ' + current.conditions.join(' AND ')
      }
      if (current.order !== null) query += ' ORDER BY ' + current.order
      if (current.limit !== null) query += ' LIMIT ' + current.limit

      return query
    },
  }
}
`,
      solutionNotes: `Ключевое решение — неизменяемость. Построитель, мутирующий себя, выглядит
проще, но превращает частично собранный запрос в ловушку: два ответвления от
одной основы начнут портить друг друга. Возврат нового объекта делает
переиспользование безопасным, и тест это проверяет.

Состояние передаётся вторым аргументом той же функции — приём, который избавляет
от отдельного класса и приватных полей.

Экранирование кавычек (\`'\` → \`''\`) — минимальная защита. В реальном коде
подстановка значений в SQL-строку недопустима: нужны параметризованные запросы.
На собеседовании об этом стоит сказать вслух — вопрос часто задаётся именно
чтобы услышать про SQL-инъекции.

Паттерн Builder уместен, когда у объекта много необязательных параметров и
порядок их задания неважен: конструктор с десятью аргументами читается хуже.`,
      hints: [
        'Каждый метод должен возвращать новый построитель, а не мутировать текущий.',
        'Состояние удобно передавать вторым аргументом той же фабрики.',
        'Строки оборачивайте кавычками и экранируйте внутренние.',
      ],
      testCode: `test('полный запрос', function () {
  const query = createQuery('users')
    .select('id', 'name')
    .where('age', '>', 18)
    .where('city', '=', 'Москва')
    .orderBy('name')
    .limit(10)
    .build()

  expect(query).toBe(
    "SELECT id, name FROM users WHERE age > 18 AND city = 'Москва' ORDER BY name ASC LIMIT 10",
  )
})

test('без условий выбираются все колонки', function () {
  expect(createQuery('users').build()).toBe('SELECT * FROM users')
})

test('направление сортировки', function () {
  expect(createQuery('users').orderBy('age', 'desc').build())
    .toBe('SELECT * FROM users ORDER BY age DESC')
})

test('числа не оборачиваются кавычками', function () {
  expect(createQuery('t').where('n', '=', 5).build()).toBe('SELECT * FROM t WHERE n = 5')
})

test('кавычки в значении экранируются', function () {
  expect(createQuery('t').where('name', '=', "О'Коннор").build())
    .toBe("SELECT * FROM t WHERE name = 'О''Коннор'")
})

test('null превращается в NULL', function () {
  expect(createQuery('t').where('x', 'IS', null).build()).toBe('SELECT * FROM t WHERE x IS NULL')
})

test('построитель неизменяем', function () {
  const base = createQuery('users').where('active', '=', 1)

  const first = base.where('role', '=', 'admin').build()
  const second = base.where('role', '=', 'user').build()

  expect(first).toBe("SELECT * FROM users WHERE active = 1 AND role = 'admin'")
  expect(second).toBe("SELECT * FROM users WHERE active = 1 AND role = 'user'")
  expect(base.build()).toBe('SELECT * FROM users WHERE active = 1')
})`,
    },

    {
      slug: 'factory-notifications',
      title: 'Factory: фабрика уведомлений',
      difficulty: 'easy',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'createNotifier',
      tags: ['patterns'],
      descriptionMd: `Реализуйте фабрику уведомлений \`createNotifier(type, options)\`.

Поддерживаются типы \`'email'\`, \`'sms'\` и \`'push'\`; каждый возвращает объект с
методами \`send(message)\` и \`describe()\`.

- \`email\`: \`send\` возвращает \`'Письмо на <адрес>: <сообщение>'\`;
- \`sms\`: \`'SMS на <номер>: <сообщение>'\`, при этом сообщение обрезается до 70
  символов;
- \`push\`: \`'Push на <устройство>: <сообщение>'\`;
- \`describe()\` возвращает строку \`'<тип> → <получатель>'\`.

Неизвестный тип — \`TypeError\` с текстом \`'Неизвестный тип уведомления: <тип>'\`.

Дополнительно реализуйте \`registerNotifier(type, factory)\` — регистрацию новых
типов без изменения кода фабрики.`,
      starterCode: `function createNotifier(type, options) {
  // Ваш код здесь
}

function registerNotifier(type, factory) {
  // Ваш код здесь
}
`,
      solutionCode: `const SMS_LIMIT = 70

// Реестр вместо switch: новые типы добавляются снаружи,
// сама фабрика при этом не меняется.
const notifierFactories = new Map([
  [
    'email',
    (options) => ({
      send: (message) => 'Письмо на ' + options.address + ': ' + message,
      describe: () => 'email → ' + options.address,
    }),
  ],
  [
    'sms',
    (options) => ({
      send: (message) => 'SMS на ' + options.phone + ': ' + message.slice(0, SMS_LIMIT),
      describe: () => 'sms → ' + options.phone,
    }),
  ],
  [
    'push',
    (options) => ({
      send: (message) => 'Push на ' + options.device + ': ' + message,
      describe: () => 'push → ' + options.device,
    }),
  ],
])

function createNotifier(type, options = {}) {
  const factory = notifierFactories.get(type)

  if (!factory) {
    throw new TypeError('Неизвестный тип уведомления: ' + type)
  }

  return factory(options)
}

function registerNotifier(type, factory) {
  if (typeof factory !== 'function') {
    throw new TypeError('Фабрика должна быть функцией')
  }

  notifierFactories.set(type, factory)
}
`,
      solutionNotes: `Смысл фабрики — в том, что вызывающий код не знает о конкретных реализациях. Он
просит «уведомитель типа X» и получает объект с известным интерфейсом.

Реестр вместо \`switch\` — то, что превращает фабрику из формальности в полезный
приём. С \`switch\` каждый новый тип требует правки самой фабрики (нарушение
принципа открытости-закрытости); с реестром типы регистрируются снаружи, в том
числе из другого модуля.

Все реализации обязаны иметь одинаковый интерфейс — иначе вызывающему коду
пришлось бы различать типы, и вся польза от фабрики исчезла бы.

Ограничение длины SMS живёт внутри своей реализации: вызывающий код о нём не
знает и знать не должен. Это и есть инкапсуляция различий, ради которой паттерн
существует.`,
      hints: [
        'Держите реестр «тип → фабрика» вместо switch.',
        'Все реализации должны иметь одинаковый набор методов.',
        'Особенности конкретного типа прячьте внутри его реализации.',
      ],
      testCode: `test('email отправляет письмо', function () {
  const notifier = createNotifier('email', { address: 'a@b.ru' })
  expect(notifier.send('Привет')).toBe('Письмо на a@b.ru: Привет')
})

test('sms обрезает длинное сообщение', function () {
  const notifier = createNotifier('sms', { phone: '+79990000000' })
  const long = 'а'.repeat(100)

  expect(notifier.send(long)).toBe('SMS на +79990000000: ' + 'а'.repeat(70))
})

test('push отправляет уведомление', function () {
  const notifier = createNotifier('push', { device: 'iPhone' })
  expect(notifier.send('Привет')).toBe('Push на iPhone: Привет')
})

test('describe описывает получателя', function () {
  expect(createNotifier('email', { address: 'a@b.ru' }).describe()).toBe('email → a@b.ru')
})

test('неизвестный тип бросает TypeError', function () {
  expect(function () { createNotifier('голубь', {}) })
    .toThrow('Неизвестный тип уведомления: голубь')
})

test('у всех типов одинаковый интерфейс', function () {
  const types = [
    createNotifier('email', { address: 'a' }),
    createNotifier('sms', { phone: 'b' }),
    createNotifier('push', { device: 'c' }),
  ]

  for (const notifier of types) {
    expect(typeof notifier.send).toBe('function')
    expect(typeof notifier.describe).toBe('function')
  }
})

test('новый тип регистрируется снаружи', function () {
  registerNotifier('telegram', function (options) {
    return {
      send: function (message) { return 'Telegram на ' + options.chatId + ': ' + message },
      describe: function () { return 'telegram → ' + options.chatId },
    }
  })

  const notifier = createNotifier('telegram', { chatId: '@user' })
  expect(notifier.send('Привет')).toBe('Telegram на @user: Привет')
})

test('регистрация не-функции бросает TypeError', function () {
  expect(function () { registerNotifier('плохой', 42) }).toThrow(TypeError)
})`,
    },
  ],
}
