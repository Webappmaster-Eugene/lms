import type { TrainerTopicSeed } from './types'

/**
 * Тема 8. Структуры данных.
 *
 * LRU-кэш — самая частая «настоящая» задача на структуры на фронтенд-собеседовании,
 * потому что в ней сразу видно, понимает ли человек, почему Map с его порядком
 * вставки решает задачу за O(1), а массив — нет.
 */
export const dataStructures: TrainerTopicSeed = {
  slug: 'data-structures',
  title: 'Структуры данных',
  description: 'Стек, очередь, связный список, дерево поиска, LRU-кэш и префиксное дерево',
  category: 'algorithms',
  icon: '🏗️',
  order: 8,
  tasks: [
    {
      slug: 'stack',
      title: 'Стек',
      difficulty: 'easy',
      checkMode: 'unit',
      languages: ['js', 'ts'],
      entryName: 'Stack',
      tags: ['data-structures'],
      descriptionMd: `Реализуйте класс \`Stack\` — структуру «последним пришёл, первым вышел».

Методы:

- \`push(value)\` кладёт значение наверх и возвращает новый размер;
- \`pop()\` снимает и возвращает верхнее значение (\`undefined\` на пустом стеке);
- \`peek()\` возвращает верхнее значение, не снимая его;
- \`isEmpty()\` — пуст ли стек;
- геттер \`size\` — количество элементов.

Внутреннее хранилище не должно быть доступно снаружи.`,
      starterCode: `class Stack {
  // Ваш код здесь
}
`,
      starterCodeTs: `class Stack<T> {
  // Ваш код здесь
}
`,
      solutionCode: `class Stack {
  #items = []

  get size() {
    return this.#items.length
  }

  push(value) {
    this.#items.push(value)
    return this.#items.length
  }

  pop() {
    return this.#items.pop()
  }

  peek() {
    return this.#items[this.#items.length - 1]
  }

  isEmpty() {
    return this.#items.length === 0
  }
}
`,
      solutionCodeTs: `class Stack<T> {
  #items: T[] = []

  get size(): number {
    return this.#items.length
  }

  push(value: T): number {
    this.#items.push(value)
    return this.#items.length
  }

  pop(): T | undefined {
    return this.#items.pop()
  }

  peek(): T | undefined {
    return this.#items[this.#items.length - 1]
  }

  isEmpty(): boolean {
    return this.#items.length === 0
  }
}
`,
      solutionNotes: `Массив уже даёт стек: \`push\` и \`pop\` работают с конца за O(1) амортизированно.
Реализовывать что-то поверх него нужно только ради инкапсуляции и понятного
интерфейса.

Приватное поле \`#items\` закрывает хранилище по-настоящему: к нему нельзя
обратиться снаружи даже по имени. Соглашение с подчёркиванием (\`_items\`) от
этого не защищает.

Стек нужен везде, где нужен откат: история undo, обход дерева без рекурсии,
проверка парности скобок, стек вызовов самого движка.`,
      hints: [
        'Массив с push и pop уже ведёт себя как стек.',
        'Приватное поле с # действительно недоступно снаружи, в отличие от _items.',
      ],
      testCode: `test('push и pop по принципу LIFO', function () {
  const stack = new Stack()
  stack.push(1)
  stack.push(2)

  expect(stack.pop()).toBe(2)
  expect(stack.pop()).toBe(1)
})

test('push возвращает новый размер', function () {
  const stack = new Stack()
  expect(stack.push('a')).toBe(1)
  expect(stack.push('b')).toBe(2)
})

test('peek не снимает элемент', function () {
  const stack = new Stack()
  stack.push('a')

  expect(stack.peek()).toBe('a')
  expect(stack.size).toBe(1)
})

test('пустой стек', function () {
  const stack = new Stack()

  expect(stack.isEmpty()).toBe(true)
  expect(stack.pop()).toBeUndefined()
  expect(stack.peek()).toBeUndefined()
  expect(stack.size).toBe(0)
})

test('хранилище недоступно снаружи', function () {
  const stack = new Stack()
  stack.push(1)

  expect(Object.keys(stack)).toEqual([])
})`,
    },

    {
      slug: 'queue',
      title: 'Очередь за O(1)',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'Queue',
      tags: ['data-structures'],
      companies: ['yandex'],
      descriptionMd: `Реализуйте класс \`Queue\` — структуру «первым пришёл, первым вышел».

Методы:

- \`enqueue(value)\` добавляет в конец и возвращает новый размер;
- \`dequeue()\` забирает из начала (\`undefined\` на пустой очереди);
- \`peek()\` возвращает первый элемент, не забирая его;
- \`isEmpty()\`, геттер \`size\`.

**Важно:** \`dequeue\` должен работать за O(1). Наивный вариант через
\`array.shift()\` сдвигает все элементы и даёт O(n) — на больших очередях это
заметно.`,
      starterCode: `class Queue {
  // Ваш код здесь
}
`,
      solutionCode: `class Queue {
  // Два указателя вместо сдвига: голова движется вперёд по массиву,
  // а сам массив периодически подрезается, чтобы не расти бесконечно.
  #items = []
  #head = 0

  get size() {
    return this.#items.length - this.#head
  }

  enqueue(value) {
    this.#items.push(value)
    return this.size
  }

  dequeue() {
    if (this.#head >= this.#items.length) return undefined

    const value = this.#items[this.#head]
    // Ссылку затираем, иначе массив держал бы удалённые значения в памяти.
    this.#items[this.#head] = undefined
    this.#head += 1

    // Когда обработанная часть заняла больше половины, подрезаем массив.
    if (this.#head > 32 && this.#head * 2 >= this.#items.length) {
      this.#items = this.#items.slice(this.#head)
      this.#head = 0
    }

    return value
  }

  peek() {
    return this.#head < this.#items.length ? this.#items[this.#head] : undefined
  }

  isEmpty() {
    return this.size === 0
  }
}
`,
      solutionNotes: `\`array.shift()\` переиндексирует весь массив — это O(n) на каждое извлечение и
O(n²) на полный проход очереди. Для очереди на сотни тысяч элементов разница
принципиальная.

Приём с указателем головы даёт O(1): элементы не двигаются, двигается индекс.
Расплата — массив растёт, даже когда очередь короткая, поэтому обработанная
часть периодически отрезается. Амортизированная сложность остаётся O(1).

Затирание \`#items[#head] = undefined\` — не косметика: без него массив продолжал
бы удерживать ссылки на извлечённые объекты, и сборщик мусора не смог бы их
освободить.

Размер считается как \`длина - голова\`, а не через отдельный счётчик: одно
состояние вместо двух, рассинхронизироваться нечему.`,
      hints: [
        'shift() — это O(n). Заведите указатель на голову очереди вместо сдвига.',
        'Периодически подрезайте массив, иначе он будет расти бесконечно.',
        'Извлечённую ячейку затирайте — иначе массив удержит объект в памяти.',
      ],
      testCode: `test('enqueue и dequeue по принципу FIFO', function () {
  const queue = new Queue()
  queue.enqueue(1)
  queue.enqueue(2)

  expect(queue.dequeue()).toBe(1)
  expect(queue.dequeue()).toBe(2)
})

test('peek не забирает элемент', function () {
  const queue = new Queue()
  queue.enqueue('a')

  expect(queue.peek()).toBe('a')
  expect(queue.size).toBe(1)
})

test('пустая очередь', function () {
  const queue = new Queue()

  expect(queue.isEmpty()).toBe(true)
  expect(queue.dequeue()).toBeUndefined()
  expect(queue.peek()).toBeUndefined()
})

test('size корректен после операций', function () {
  const queue = new Queue()
  queue.enqueue(1)
  queue.enqueue(2)
  queue.dequeue()

  expect(queue.size).toBe(1)
})

test('shift не используется: много операций', function () {
  const queue = new Queue()
  for (let i = 0; i < 200; i++) queue.enqueue(i)
  for (let i = 0; i < 150; i++) expect(queue.dequeue()).toBe(i)

  expect(queue.size).toBe(50)
  expect(queue.peek()).toBe(150)
})

test('очередь переиспользуется после опустошения', function () {
  const queue = new Queue()
  queue.enqueue(1)
  queue.dequeue()
  queue.enqueue(2)

  expect(queue.dequeue()).toBe(2)
  expect(queue.isEmpty()).toBe(true)
})`,
    },

    {
      slug: 'linked-list',
      title: 'Односвязный список',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'LinkedList',
      tags: ['data-structures'],
      companies: ['sber', 'faang'],
      descriptionMd: `Реализуйте класс \`LinkedList\` — односвязный список.

Методы:

- \`add(value)\` добавляет в конец;
- \`remove(value)\` удаляет **первое** вхождение, возвращает \`true\`/\`false\`;
- \`find(value)\` возвращает узел \`{ value, next }\` или \`null\`;
- \`toArray()\` возвращает значения массивом;
- \`reverse()\` разворачивает список на месте;
- геттер \`size\`.

Добавление в конец должно быть за O(1) — держите ссылку на хвост.`,
      starterCode: `class LinkedList {
  // Ваш код здесь
}
`,
      solutionCode: `class LinkedList {
  #head = null
  #tail = null
  #size = 0

  get size() {
    return this.#size
  }

  add(value) {
    const node = { value, next: null }

    if (this.#tail === null) {
      this.#head = node
      this.#tail = node
    } else {
      this.#tail.next = node
      this.#tail = node
    }

    this.#size += 1
    return this
  }

  find(value) {
    let current = this.#head
    while (current !== null) {
      if (Object.is(current.value, value)) return current
      current = current.next
    }
    return null
  }

  remove(value) {
    let previous = null
    let current = this.#head

    while (current !== null) {
      if (Object.is(current.value, value)) {
        if (previous === null) this.#head = current.next
        else previous.next = current.next

        if (current === this.#tail) this.#tail = previous

        this.#size -= 1
        return true
      }

      previous = current
      current = current.next
    }

    return false
  }

  reverse() {
    let previous = null
    let current = this.#head
    this.#tail = this.#head

    while (current !== null) {
      const next = current.next
      current.next = previous
      previous = current
      current = next
    }

    this.#head = previous
    return this
  }

  toArray() {
    const result = []
    let current = this.#head

    while (current !== null) {
      result.push(current.value)
      current = current.next
    }

    return result
  }
}
`,
      solutionNotes: `Ссылка на хвост — то, ради чего стоит писать список вручную: без неё добавление
в конец требует прохода по всему списку, то есть O(n).

Удаление требует **предыдущего** узла: в односвязном списке от узла назад не
дойти. Отсюда пара указателей \`previous\`/\`current\`.

Три случая при удалении легко забыть: удаление головы (меняется \`#head\`),
удаление хвоста (меняется \`#tail\`) и удаление единственного элемента, когда
меняются оба.

\`reverse\` на месте — классические три указателя. Порядок строк критичен: ссылку
на следующий узел надо сохранить **до** того, как она будет перезаписана,
иначе остаток списка потеряется.

\`Object.is\` вместо \`===\` позволяет искать \`NaN\`.`,
      hints: [
        'Держите ссылку на хвост — иначе add будет O(n).',
        'Для удаления нужен предыдущий узел: идите парой указателей.',
        'Не забудьте обновить хвост при удалении последнего элемента.',
        'В reverse сохраняйте ссылку на следующий узел ДО перезаписи.',
      ],
      testCode: `test('добавление и toArray', function () {
  const list = new LinkedList()
  list.add(1)
  list.add(2)
  list.add(3)

  expect(list.toArray()).toEqual([1, 2, 3])
  expect(list.size).toBe(3)
})

test('find возвращает узел', function () {
  const list = new LinkedList()
  list.add('a')
  list.add('b')

  const node = list.find('b')
  expect(node.value).toBe('b')
  expect(node.next).toBe(null)
  expect(list.find('нет')).toBe(null)
})

test('удаление из середины', function () {
  const list = new LinkedList()
  list.add(1)
  list.add(2)
  list.add(3)

  expect(list.remove(2)).toBe(true)
  expect(list.toArray()).toEqual([1, 3])
  expect(list.size).toBe(2)
})

test('удаление головы', function () {
  const list = new LinkedList()
  list.add(1)
  list.add(2)

  list.remove(1)
  expect(list.toArray()).toEqual([2])
})

test('удаление хвоста и добавление после него', function () {
  const list = new LinkedList()
  list.add(1)
  list.add(2)

  list.remove(2)
  list.add(3)

  expect(list.toArray()).toEqual([1, 3])
})

test('удаление единственного элемента', function () {
  const list = new LinkedList()
  list.add(1)

  list.remove(1)
  list.add(2)

  expect(list.toArray()).toEqual([2])
  expect(list.size).toBe(1)
})

test('удаление несуществующего значения', function () {
  const list = new LinkedList()
  list.add(1)

  expect(list.remove(99)).toBe(false)
  expect(list.size).toBe(1)
})

test('разворот списка', function () {
  const list = new LinkedList()
  list.add(1)
  list.add(2)
  list.add(3)

  list.reverse()
  expect(list.toArray()).toEqual([3, 2, 1])

  list.add(0)
  expect(list.toArray()).toEqual([3, 2, 1, 0])
})

test('пустой список', function () {
  const list = new LinkedList()

  expect(list.toArray()).toEqual([])
  expect(list.size).toBe(0)
  expect(list.remove(1)).toBe(false)
})`,
    },

    {
      slug: 'lru-cache',
      title: 'LRU-кэш',
      difficulty: 'hard',
      checkMode: 'unit',
      languages: ['js', 'ts'],
      entryName: 'LRUCache',
      tags: ['data-structures', 'performance'],
      companies: ['yandex', 'ozon', 'tbank', 'faang'],
      leetcodeNumber: 146,
      sourceUrl: 'https://leetcode.com/problems/lru-cache/',
      descriptionMd: `Реализуйте \`LRUCache\` — кэш с вытеснением давно не используемых записей.

- \`new LRUCache(capacity)\` задаёт вместимость;
- \`get(key)\` возвращает значение или \`-1\`, если ключа нет, и помечает запись как
  недавно использованную;
- \`put(key, value)\` добавляет или обновляет запись; при переполнении вытесняется
  **самая давно использованная**;
- геттер \`size\`.

Обе операции должны работать за O(1).

\`\`\`js
const cache = new LRUCache(2)
cache.put('a', 1)
cache.put('b', 2)
cache.get('a')      // 1 — теперь 'a' свежее, чем 'b'
cache.put('c', 3)   // вытесняется 'b'
cache.get('b')      // -1
\`\`\``,
      starterCode: `class LRUCache {
  constructor(capacity) {
    // Ваш код здесь
  }
}
`,
      starterCodeTs: `class LRUCache<K, V> {
  constructor(capacity: number) {
    // Ваш код здесь
  }
}
`,
      solutionCode: `class LRUCache {
  #capacity
  #items = new Map()

  constructor(capacity) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError('Вместимость должна быть целым числом не меньше 1')
    }
    this.#capacity = capacity
  }

  get size() {
    return this.#items.size
  }

  get(key) {
    if (!this.#items.has(key)) return -1

    // Map хранит ключи в порядке вставки, поэтому «освежить» запись —
    // это удалить и вставить заново: она уходит в конец.
    const value = this.#items.get(key)
    this.#items.delete(key)
    this.#items.set(key, value)

    return value
  }

  put(key, value) {
    if (this.#items.has(key)) this.#items.delete(key)

    this.#items.set(key, value)

    if (this.#items.size > this.#capacity) {
      // Первый ключ итератора — самый давний.
      const oldest = this.#items.keys().next().value
      this.#items.delete(oldest)
    }

    return this
  }
}
`,
      solutionCodeTs: `class LRUCache<K, V> {
  readonly #capacity: number
  readonly #items = new Map<K, V>()

  constructor(capacity: number) {
    if (!Number.isInteger(capacity) || capacity < 1) {
      throw new RangeError('Вместимость должна быть целым числом не меньше 1')
    }
    this.#capacity = capacity
  }

  get size(): number {
    return this.#items.size
  }

  get(key: K): V | -1 {
    if (!this.#items.has(key)) return -1

    const value = this.#items.get(key) as V
    this.#items.delete(key)
    this.#items.set(key, value)

    return value
  }

  put(key: K, value: V): this {
    if (this.#items.has(key)) this.#items.delete(key)

    this.#items.set(key, value)

    if (this.#items.size > this.#capacity) {
      const oldest = this.#items.keys().next().value as K
      this.#items.delete(oldest)
    }

    return this
  }
}
`,
      solutionNotes: `Классический ответ на эту задачу — хеш-таблица плюс двусвязный список. В
JavaScript его можно не писать: \`Map\` уже гарантирует порядок вставки ключей,
а \`delete\` + \`set\` перемещает запись в конец за O(1). Фактически \`Map\` и есть
хеш-таблица со встроенным двусвязным списком.

Самый давний ключ достаётся как первый элемент итератора:
\`map.keys().next().value\`. Это тоже O(1) — итератор не обходит всю коллекцию.

В \`put\` существующий ключ сначала удаляется: без этого \`set\` обновил бы значение,
но **не** сдвинул бы запись в конец, и свежеобновлённая запись вытеснилась бы
первой.

Проверка переполнения идёт после вставки — тогда одна ветка обрабатывает и
добавление нового ключа, и обновление старого.

Где встречается: кэш ответов API, кэш отрисованных компонентов, пул соединений.`,
      hints: [
        'Map хранит ключи в порядке вставки — двусвязный список писать не нужно.',
        'Освежить запись = удалить и вставить заново.',
        'Самый давний ключ: map.keys().next().value.',
        'В put существующий ключ сначала удалите, иначе он не сдвинется в конец.',
      ],
      testCode: `test('базовые get и put', function () {
  const cache = new LRUCache(2)
  cache.put('a', 1)

  expect(cache.get('a')).toBe(1)
  expect(cache.get('нет')).toBe(-1)
})

test('вытесняется самый давний', function () {
  const cache = new LRUCache(2)
  cache.put('a', 1)
  cache.put('b', 2)
  cache.put('c', 3)

  expect(cache.get('a')).toBe(-1)
  expect(cache.get('b')).toBe(2)
  expect(cache.get('c')).toBe(3)
})

test('get освежает запись', function () {
  const cache = new LRUCache(2)
  cache.put('a', 1)
  cache.put('b', 2)
  cache.get('a')
  cache.put('c', 3)

  expect(cache.get('a')).toBe(1)
  expect(cache.get('b')).toBe(-1)
})

test('put существующего ключа освежает запись', function () {
  const cache = new LRUCache(2)
  cache.put('a', 1)
  cache.put('b', 2)
  cache.put('a', 10)
  cache.put('c', 3)

  expect(cache.get('a')).toBe(10)
  expect(cache.get('b')).toBe(-1)
})

test('размер не превышает вместимость', function () {
  const cache = new LRUCache(2)
  cache.put('a', 1)
  cache.put('b', 2)
  cache.put('c', 3)

  expect(cache.size).toBe(2)
})

test('вместимость 1', function () {
  const cache = new LRUCache(1)
  cache.put('a', 1)
  cache.put('b', 2)

  expect(cache.get('a')).toBe(-1)
  expect(cache.get('b')).toBe(2)
})

test('некорректная вместимость', function () {
  expect(function () { new LRUCache(0) }).toThrow(RangeError)
})`,
    },

    {
      slug: 'binary-search-tree',
      title: 'Бинарное дерево поиска',
      difficulty: 'hard',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'BinarySearchTree',
      tags: ['data-structures', 'recursion'],
      companies: ['sber', 'faang'],
      descriptionMd: `Реализуйте класс \`BinarySearchTree\` для чисел.

Методы:

- \`insert(value)\` вставляет значение (дубликаты игнорируются);
- \`has(value)\` — есть ли значение в дереве;
- \`remove(value)\` удаляет значение, возвращает \`true\`/\`false\`;
- \`inOrder()\` возвращает значения в порядке возрастания;
- геттер \`size\`.

Инвариант дерева поиска: слева — меньшие значения, справа — большие.

Самая тонкая часть — удаление узла с двумя потомками.`,
      starterCode: `class BinarySearchTree {
  // Ваш код здесь
}
`,
      solutionCode: `class BinarySearchTree {
  #root = null
  #size = 0

  get size() {
    return this.#size
  }

  insert(value) {
    const node = { value, left: null, right: null }

    if (this.#root === null) {
      this.#root = node
      this.#size = 1
      return this
    }

    let current = this.#root
    for (;;) {
      if (value === current.value) return this

      const side = value < current.value ? 'left' : 'right'
      if (current[side] === null) {
        current[side] = node
        this.#size += 1
        return this
      }
      current = current[side]
    }
  }

  has(value) {
    let current = this.#root

    while (current !== null) {
      if (value === current.value) return true
      current = value < current.value ? current.left : current.right
    }

    return false
  }

  remove(value) {
    const before = this.#size
    this.#root = this.#removeFrom(this.#root, value)
    return this.#size < before
  }

  #removeFrom(node, value) {
    if (node === null) return null

    if (value < node.value) {
      node.left = this.#removeFrom(node.left, value)
      return node
    }

    if (value > node.value) {
      node.right = this.#removeFrom(node.right, value)
      return node
    }

    this.#size -= 1

    // Не больше одного потомка — узел заменяется этим потомком.
    if (node.left === null) return node.right
    if (node.right === null) return node.left

    // Два потомка: на место узла встаёт минимальный из правого поддерева —
    // он больше всего левого и меньше всего остального правого.
    let successor = node.right
    while (successor.left !== null) successor = successor.left

    node.value = successor.value
    // Преемник удаляется из правого поддерева; размер он уже уменьшил выше,
    // поэтому компенсируем лишнее уменьшение.
    this.#size += 1
    node.right = this.#removeFrom(node.right, successor.value)

    return node
  }

  inOrder() {
    const result = []

    const walk = (node) => {
      if (node === null) return
      walk(node.left)
      result.push(node.value)
      walk(node.right)
    }

    walk(this.#root)
    return result
  }
}
`,
      solutionNotes: `Симметричный обход (левое поддерево → узел → правое) выдаёт значения по
возрастанию — это прямое следствие инварианта дерева, а не совпадение.

Удаление разбирается на три случая. Лист и узел с одним потомком заменяются
потомком. Узел с двумя потомками заменить нечем — поэтому на его место
поднимается **преемник**: минимальное значение правого поддерева. Оно
единственное подходит: больше всего левого поддерева и меньше всего остального
правого. Симметрично годится максимум левого поддерева.

Рекурсия возвращает новый корень поддерева, и родитель просто присваивает его
себе. Это избавляет от отдельной работы со ссылками родителя, где легко
ошибиться.

Все операции — O(h), где h — высота дерева. У сбалансированного дерева это
O(log n), у выродившегося в цепочку (вставка отсортированных данных) — O(n).
Поэтому в реальных задачах берут самобалансирующиеся варианты: AVL или
красно-чёрное дерево.`,
      hints: [
        'Симметричный обход сразу даёт отсортированный порядок.',
        'Рекурсивное удаление удобно строить так, чтобы функция возвращала новый корень поддерева.',
        'Узел с двумя потомками заменяется минимумом правого поддерева.',
      ],
      testCode: `test('вставка и обход по возрастанию', function () {
  const tree = new BinarySearchTree()
  ;[5, 3, 7, 1, 4].forEach(function (value) { tree.insert(value) })

  expect(tree.inOrder()).toEqual([1, 3, 4, 5, 7])
  expect(tree.size).toBe(5)
})

test('поиск значения', function () {
  const tree = new BinarySearchTree()
  ;[5, 3, 7].forEach(function (value) { tree.insert(value) })

  expect(tree.has(3)).toBe(true)
  expect(tree.has(99)).toBe(false)
})

test('дубликаты игнорируются', function () {
  const tree = new BinarySearchTree()
  tree.insert(5)
  tree.insert(5)

  expect(tree.size).toBe(1)
})

test('удаление листа', function () {
  const tree = new BinarySearchTree()
  ;[5, 3, 7].forEach(function (value) { tree.insert(value) })

  expect(tree.remove(3)).toBe(true)
  expect(tree.inOrder()).toEqual([5, 7])
  expect(tree.size).toBe(2)
})

test('удаление узла с одним потомком', function () {
  const tree = new BinarySearchTree()
  ;[5, 3, 7, 1].forEach(function (value) { tree.insert(value) })

  tree.remove(3)
  expect(tree.inOrder()).toEqual([1, 5, 7])
})

test('удаление узла с двумя потомками', function () {
  const tree = new BinarySearchTree()
  ;[5, 3, 8, 7, 9].forEach(function (value) { tree.insert(value) })

  tree.remove(8)
  expect(tree.inOrder()).toEqual([3, 5, 7, 9])
  expect(tree.size).toBe(4)
})

test('удаление корня', function () {
  const tree = new BinarySearchTree()
  ;[5, 3, 8].forEach(function (value) { tree.insert(value) })

  tree.remove(5)
  expect(tree.inOrder()).toEqual([3, 8])
  expect(tree.has(5)).toBe(false)
})

test('удаление несуществующего значения', function () {
  const tree = new BinarySearchTree()
  tree.insert(5)

  expect(tree.remove(99)).toBe(false)
  expect(tree.size).toBe(1)
})

test('пустое дерево', function () {
  const tree = new BinarySearchTree()

  expect(tree.inOrder()).toEqual([])
  expect(tree.has(1)).toBe(false)
  expect(tree.remove(1)).toBe(false)
})`,
    },

    {
      slug: 'hash-table',
      title: 'Хеш-таблица с цепочками',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'HashTable',
      tags: ['data-structures'],
      companies: ['sber'],
      descriptionMd: `Реализуйте \`HashTable\` — хеш-таблицу со строковыми ключами и разрешением
коллизий методом цепочек.

Методы:

- \`set(key, value)\` записывает или обновляет значение;
- \`get(key)\` возвращает значение или \`undefined\`;
- \`has(key)\`, \`delete(key)\` (возвращает \`true\`/\`false\`);
- \`keys()\` возвращает массив ключей;
- геттер \`size\`.

Вместимость задаётся в конструкторе (по умолчанию 16). Коллизии обязаны
обрабатываться корректно — тесты специально подбирают ключи в одну корзину.

Использовать \`Map\` и обычный объект как хранилище нельзя.`,
      starterCode: `class HashTable {
  constructor(capacity = 16) {
    // Ваш код здесь
  }
}
`,
      solutionCode: `class HashTable {
  #buckets
  #size = 0

  constructor(capacity = 16) {
    this.#buckets = new Array(capacity)
  }

  get size() {
    return this.#size
  }

  #hash(key) {
    // Полиномиальный хеш (djb2): множитель 31 хорошо разбрасывает строки.
    let hash = 0
    const text = String(key)

    for (let i = 0; i < text.length; i++) {
      hash = (hash * 31 + text.charCodeAt(i)) | 0
    }

    return Math.abs(hash) % this.#buckets.length
  }

  set(key, value) {
    const index = this.#hash(key)
    const bucket = this.#buckets[index] || (this.#buckets[index] = [])

    for (const entry of bucket) {
      if (entry.key === key) {
        entry.value = value
        return this
      }
    }

    bucket.push({ key, value })
    this.#size += 1
    return this
  }

  get(key) {
    const bucket = this.#buckets[this.#hash(key)]
    if (!bucket) return undefined

    const entry = bucket.find((item) => item.key === key)
    return entry ? entry.value : undefined
  }

  has(key) {
    const bucket = this.#buckets[this.#hash(key)]
    return Boolean(bucket) && bucket.some((item) => item.key === key)
  }

  delete(key) {
    const bucket = this.#buckets[this.#hash(key)]
    if (!bucket) return false

    const index = bucket.findIndex((item) => item.key === key)
    if (index === -1) return false

    bucket.splice(index, 1)
    this.#size -= 1
    return true
  }

  keys() {
    const result = []

    for (const bucket of this.#buckets) {
      if (!bucket) continue
      for (const entry of bucket) result.push(entry.key)
    }

    return result
  }
}
`,
      solutionNotes: `Каждая корзина — массив пар. При коллизии пары просто складываются в один
массив, и поиск внутри корзины идёт линейно. Это и есть метод цепочек.

Хеш умножается на 31 — нечётное простое число, которое хорошо разбрасывает
строки и вычисляется быстро (\`x * 31\` — это \`(x << 5) - x\`). Побитовое \`| 0\`
удерживает результат в диапазоне 32-битного целого, не давая ему уйти в
неточную область чисел с плавающей точкой.

\`Math.abs\` нужен потому, что \`| 0\` даёт знаковое число, а индекс корзины
отрицательным быть не может.

В \`set\` сначала ищется существующий ключ: без этого повторная запись создавала
бы вторую пару с тем же ключом, и \`size\` разошёлся бы с реальностью.

Сложность — O(1) в среднем и O(n) в худшем случае, когда все ключи попали в одну
корзину. Промышленные реализации от этого защищаются: увеличивают число корзин,
когда коэффициент заполнения превышает порог, и перехешируют содержимое.`,
      hints: [
        'Каждая корзина — массив пар { key, value }.',
        'В set сначала ищите существующий ключ в корзине, иначе появятся дубликаты.',
        'Побитовое | 0 удержит хеш в пределах 32-битного целого.',
      ],
      testCode: `test('запись и чтение', function () {
  const table = new HashTable()
  table.set('имя', 'Аня')

  expect(table.get('имя')).toBe('Аня')
  expect(table.get('нет')).toBeUndefined()
})

test('обновление значения не увеличивает размер', function () {
  const table = new HashTable()
  table.set('a', 1)
  table.set('a', 2)

  expect(table.get('a')).toBe(2)
  expect(table.size).toBe(1)
})

test('коллизии обрабатываются', function () {
  // Крошечная таблица гарантирует попадание разных ключей в одну корзину.
  const table = new HashTable(1)
  table.set('a', 1)
  table.set('b', 2)
  table.set('c', 3)

  expect(table.get('a')).toBe(1)
  expect(table.get('b')).toBe(2)
  expect(table.get('c')).toBe(3)
  expect(table.size).toBe(3)
})

test('удаление при коллизии', function () {
  const table = new HashTable(1)
  table.set('a', 1)
  table.set('b', 2)

  expect(table.delete('a')).toBe(true)
  expect(table.get('a')).toBeUndefined()
  expect(table.get('b')).toBe(2)
  expect(table.size).toBe(1)
})

test('удаление несуществующего ключа', function () {
  const table = new HashTable()
  expect(table.delete('нет')).toBe(false)
})

test('has', function () {
  const table = new HashTable()
  table.set('a', undefined)

  expect(table.has('a')).toBe(true)
  expect(table.has('b')).toBe(false)
})

test('keys возвращает все ключи', function () {
  const table = new HashTable(2)
  table.set('a', 1)
  table.set('b', 2)
  table.set('c', 3)

  expect(table.keys().sort()).toEqual(['a', 'b', 'c'])
})`,
    },

    {
      slug: 'trie',
      title: 'Префиксное дерево',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'Trie',
      tags: ['data-structures'],
      companies: ['yandex', 'faang'],
      leetcodeNumber: 208,
      sourceUrl: 'https://leetcode.com/problems/implement-trie-prefix-tree/',
      descriptionMd: `Реализуйте \`Trie\` — префиксное дерево, структуру для автодополнения.

Методы:

- \`insert(word)\` добавляет слово;
- \`has(word)\` — есть ли **точно такое** слово;
- \`startsWith(prefix)\` — есть ли хоть одно слово с таким префиксом;
- \`autocomplete(prefix)\` возвращает все слова с этим префиксом (в
  лексикографическом порядке);
- геттер \`size\` — количество слов.

Именно на этой структуре работает подсказка в поисковой строке: поиск по
префиксу занимает время длины префикса и не зависит от количества слов.`,
      starterCode: `class Trie {
  // Ваш код здесь
}
`,
      solutionCode: `class Trie {
  #root = { children: new Map(), isWord: false }
  #size = 0

  get size() {
    return this.#size
  }

  insert(word) {
    let node = this.#root

    for (const char of word) {
      if (!node.children.has(char)) {
        node.children.set(char, { children: new Map(), isWord: false })
      }
      node = node.children.get(char)
    }

    if (!node.isWord) {
      node.isWord = true
      this.#size += 1
    }

    return this
  }

  #findNode(prefix) {
    let node = this.#root

    for (const char of prefix) {
      const next = node.children.get(char)
      if (!next) return null
      node = next
    }

    return node
  }

  has(word) {
    const node = this.#findNode(word)
    return node !== null && node.isWord
  }

  startsWith(prefix) {
    return this.#findNode(prefix) !== null
  }

  autocomplete(prefix) {
    const start = this.#findNode(prefix)
    if (start === null) return []

    const result = []

    const walk = (node, accumulated) => {
      if (node.isWord) result.push(accumulated)

      // Сортировка ключей даёт лексикографический порядок результата.
      for (const char of [...node.children.keys()].sort()) {
        walk(node.children.get(char), accumulated + char)
      }
    }

    walk(start, prefix)
    return result
  }
}
`,
      solutionNotes: `Флаг \`isWord\` отделяет законченное слово от промежуточного узла. Без него
нельзя было бы отличить «кот» как слово от «кот» как префикса слова «котёнок» —
именно поэтому \`has\` проверяет флаг, а \`startsWith\` довольствуется самим узлом.

\`Map\` для потомков, а не объект: ключи-символы могут быть любыми, включая те,
что совпадают с именами наследуемых свойств.

Поиск по префиксу — O(длина префикса) и не зависит от количества слов в
словаре. Массив строк с \`filter(w => w.startsWith(p))\` дал бы O(количество × длина).

Сортировка ключей на каждом уровне даёт лексикографический порядок без
сортировки итогового массива.

За экономию времени платят памятью: у каждого узла своя \`Map\`. Когда это важно,
одинаковые ветви сжимают (radix tree) или строят автомат.`,
      hints: [
        'Каждый узел — это Map потомков плюс флаг «здесь заканчивается слово».',
        'Флаг нужен, чтобы отличить слово от префикса другого слова.',
        'Для автодополнения найдите узел префикса и обойдите его поддерево.',
      ],
      testCode: `test('вставка и поиск слова', function () {
  const trie = new Trie()
  trie.insert('кот')

  expect(trie.has('кот')).toBe(true)
  expect(trie.has('ко')).toBe(false)
  expect(trie.has('котёнок')).toBe(false)
})

test('startsWith находит префикс', function () {
  const trie = new Trie()
  trie.insert('котёнок')

  expect(trie.startsWith('кот')).toBe(true)
  expect(trie.startsWith('пёс')).toBe(false)
})

test('слово и его префикс сосуществуют', function () {
  const trie = new Trie()
  trie.insert('кот')
  trie.insert('котёнок')

  expect(trie.has('кот')).toBe(true)
  expect(trie.has('котёнок')).toBe(true)
  expect(trie.size).toBe(2)
})

test('автодополнение', function () {
  const trie = new Trie()
  ;['кот', 'котёнок', 'кофе', 'пёс'].forEach(function (word) { trie.insert(word) })

  expect(trie.autocomplete('ко')).toEqual(['кот', 'котёнок', 'кофе'])
})

test('автодополнение по несуществующему префиксу', function () {
  const trie = new Trie()
  trie.insert('кот')

  expect(trie.autocomplete('яблоко')).toEqual([])
})

test('пустой префикс возвращает все слова', function () {
  const trie = new Trie()
  ;['б', 'а'].forEach(function (word) { trie.insert(word) })

  expect(trie.autocomplete('')).toEqual(['а', 'б'])
})

test('повторная вставка не увеличивает размер', function () {
  const trie = new Trie()
  trie.insert('кот')
  trie.insert('кот')

  expect(trie.size).toBe(1)
})

test('пустое дерево', function () {
  const trie = new Trie()

  expect(trie.size).toBe(0)
  expect(trie.has('кот')).toBe(false)
  expect(trie.autocomplete('к')).toEqual([])
})`,
    },
  ],
}
