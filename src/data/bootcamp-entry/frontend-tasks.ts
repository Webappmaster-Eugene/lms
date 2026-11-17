import type { EntryTask } from '@/data/bootcamp-entry/tasks'
import { raw } from '@/lib/trainer/literal'

/** Проверяем JavaScript до обучения React; правила учебного API здесь не подменяются. */
export const FRONTEND_ENTRY_TASKS: readonly EntryTask[] = [
  {
    slug: 'frontend-catalog-filter',
    title: 'Найти доступные инструменты',
    entryName: 'availableIds',
    descriptionMd: `Напишите функцию \`availableIds(items, query)\`.

Каждая позиция содержит \`id\`, \`name\` и \`available\`. Верните массив ID тех
позиций, у которых \`available === true\`, а название содержит поисковый запрос.
У запроса нужно убрать пробелы по краям. Регистр букв не учитывается.
Пустой запрос подходит любому названию. Порядок ID совпадает с порядком позиций.
Исходный массив и его элементы менять не нужно.

\`\`\`js
availableIds([
  { id: 'a', name: 'Дрель', available: true },
  { id: 'b', name: 'Шуруповёрт', available: false }
], ' ДР ') // ['a']
\`\`\``,
    starterCode: 'function availableIds(items, query) {\n  // Ваш код здесь\n}\n',
    solutionCode: `function availableIds(items, query) {
  const needle = query.trim().toLowerCase()
  return items
    .filter((item) => item.available === true && item.name.toLowerCase().includes(needle))
    .map((item) => item.id)
}
`,
    cases: [
      { name: 'Пустой каталог', args: [[], 'дрель'], expected: [] },
      { name: 'Регистр и пробелы запроса', args: [[{ id: 'a', name: 'Ударная дрель', available: true }], ' ДРЕЛЬ '], expected: ['a'] },
      { name: 'Недоступная позиция не подходит', args: [[{ id: 'a', name: 'Дрель', available: false }], 'дрель'], expected: [] },
      { name: 'Совпадение внутри названия', args: [[{ id: 'a', name: 'Перфоратор', available: true }, { id: 'b', name: 'Дрель', available: true }], 'орат'], expected: ['a'] },
      { name: 'Пустой запрос и исходный порядок', args: [[{ id: 'z', name: 'Пила', available: true }, { id: 'a', name: 'Дрель', available: true }, { id: 'b', name: 'Ключ', available: false }], '  '], expected: ['z', 'a'] },
      { name: 'Нет совпадений', args: [[{ id: 'a', name: 'Дрель', available: true }], 'насос'], expected: [] },
      { name: 'Исходные данные доступны только для чтения', args: [raw('Object.freeze([Object.freeze({ id: "a", name: "Дрель", available: true })])'), 'дрель'], expected: ['a'] },
    ],
  },
  {
    slug: 'frontend-search-query',
    title: 'Адрес страницы поиска',
    entryName: 'catalogQuery',
    descriptionMd: `Напишите функцию \`catalogQuery(query, page)\`, которая возвращает
строку параметров адреса каталога, начиная с \`?\`.

На странице 20 позиций, нумерация страниц начинается с 1.
Сначала идёт \`q\`, затем \`offset\`, затем \`limit\`.
У запроса уберите пробелы по краям и закодируйте его через \`encodeURIComponent\`.
Если после удаления пробелов запрос пустой, параметра \`q\` быть не должно.
\`page\` всегда целое положительное число. Это упражнение на строки JavaScript,
а не полное описание параметров API учебного сервиса.

\`\`\`js
catalogQuery(' drill ', 2) // '?q=drill&offset=20&limit=20'
catalogQuery(' ', 1) // '?offset=0&limit=20'
\`\`\``,
    starterCode: 'function catalogQuery(query, page) {\n  // Ваш код здесь\n}\n',
    solutionCode: `function catalogQuery(query, page) {
  const trimmed = query.trim()
  const search = trimmed ? 'q=' + encodeURIComponent(trimmed) + '&' : ''
  return '?' + search + 'offset=' + (page - 1) * 20 + '&limit=20'
}
`,
    cases: [
      { name: 'Первая страница', args: ['drill', 1], expected: '?q=drill&offset=0&limit=20' },
      { name: 'Пробелы по краям и вторая страница', args: [' drill ', 2], expected: '?q=drill&offset=20&limit=20' },
      { name: 'Пустой запрос', args: ['', 1], expected: '?offset=0&limit=20' },
      { name: 'Только пробелы', args: ['  ', 3], expected: '?offset=40&limit=20' },
      { name: 'Кодирование специальных символов', args: ['a&b + c', 1], expected: '?q=a%26b%20%2B%20c&offset=0&limit=20' },
      { name: 'Кириллица', args: ['дрель', 5], expected: '?q=%D0%B4%D1%80%D0%B5%D0%BB%D1%8C&offset=80&limit=20' },
    ],
  },
  {
    slug: 'frontend-catalog-update',
    title: 'Обновить позицию каталога',
    entryName: 'updateCatalog',
    descriptionMd: `Напишите функцию \`updateCatalog(items, patch)\`.

Верните новый массив: для позиции с \`id === patch.id\` объедините прежние поля
с полями \`patch\`, причём новые значения заменяют прежние. Остальные позиции
и порядок сохраняются. Если такого ID нет, ничего добавлять не нужно.
ID в исходном массиве уникальны. Исходный массив и его элементы менять нельзя.

\`\`\`js
updateCatalog([{ id: 'a', name: 'Дрель', available: true }], {
  id: 'a', available: false
}) // [{ id: 'a', name: 'Дрель', available: false }]
\`\`\``,
    starterCode: 'function updateCatalog(items, patch) {\n  // Ваш код здесь\n}\n',
    solutionCode: `function updateCatalog(items, patch) {
  return items.map((item) => item.id === patch.id ? { ...item, ...patch } : item)
}
`,
    cases: [
      { name: 'Пустой массив', args: [[], { id: 'a', available: true }], expected: [] },
      { name: 'Замена поля с сохранением названия', args: [[{ id: 'a', name: 'Дрель', available: true }], { id: 'a', available: false }], expected: [{ id: 'a', name: 'Дрель', available: false }] },
      { name: 'Незнакомый ID не добавляется', args: [[{ id: 'a', name: 'Пила' }], { id: 'b', name: 'Дрель' }], expected: [{ id: 'a', name: 'Пила' }] },
      { name: 'Порядок и соседние позиции', args: [[{ id: 'z', name: 'Пила' }, { id: 'a', name: 'Дрель' }], { id: 'a', name: 'Дрель ударная' }], expected: [{ id: 'z', name: 'Пила' }, { id: 'a', name: 'Дрель ударная' }] },
      { name: 'Добавление поля', args: [[{ id: 'a', name: 'Дрель' }], { id: 'a', category: 'drills' }], expected: [{ id: 'a', name: 'Дрель', category: 'drills' }] },
      { name: 'Пустая строка и false являются значениями', args: [[{ id: 'a', name: 'Дрель', available: true }], { id: 'a', name: '', available: false }], expected: [{ id: 'a', name: '', available: false }] },
      { name: 'Исходный объект и массив менять нельзя', args: [raw('Object.freeze([Object.freeze({ id: "a", name: "Дрель", available: true })])'), raw('Object.freeze({ id: "a", available: false })')], expected: [{ id: 'a', name: 'Дрель', available: false }] },
    ],
  },
]
