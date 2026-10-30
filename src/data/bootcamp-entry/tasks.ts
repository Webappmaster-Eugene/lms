import { toCaseSpecs, type TrainerCaseInput } from '@/data/trainer/types'
import type { TrainerTaskLike } from '@/lib/trainer/spec'

/**
 * Входное задание буткемпа Node.js: три небольшие функции на JavaScript по теме
 * проката, на 30-60 минут. Решение владельца от 28.10.2026: задание простое,
 * решается в браузере и проверяется автоматически тем же движком, что и тренажёр.
 * Прежнее задание с архивом проекта осталось в CMS и в bootcamp/entry-task, но больше не рассылается.
 */
export type EntryTask = {
  slug: string
  title: string
  descriptionMd: string
  entryName: string
  starterCode: string
  solutionCode: string
  cases: TrainerCaseInput[]
}

export const ENTRY_TASK_MINUTES = '30-60'

const booking = (from: string, to: string) => ({ from, to })
const item = (title: string, category: string, available: boolean) => ({ title, category, available })

export const ENTRY_TASKS: readonly EntryTask[] = [
  {
    slug: 'rental-price',
    title: 'Стоимость аренды',
    entryName: 'rentalPrice',
    descriptionMd: `Прокат берёт плату за каждый день аренды. Напишите функцию
\`rentalPrice(pricePerDay, days)\`, которая возвращает стоимость аренды в рублях.

- Стоимость равна цене за день, умноженной на число дней.
- Если инструмент берут на 7 дней или дольше, действует скидка 10 %.
- Итог округляется до целого рубля по обычным правилам, как это делает \`Math.round\`.

Цена и число дней всегда целые и больше нуля.

\`\`\`js
rentalPrice(500, 3) // 1500
rentalPrice(500, 7) // 3150, со скидкой 10 %
\`\`\``,
    starterCode: `function rentalPrice(pricePerDay, days) {
  // Ваш код здесь
}
`,
    solutionCode: `function rentalPrice(pricePerDay, days) {
  const total = pricePerDay * days
  return Math.round(days >= 7 ? total * 0.9 : total)
}
`,
    cases: [
      { name: 'Один день', args: [500, 1], expected: 500 },
      { name: 'Три дня без скидки', args: [500, 3], expected: 1500 },
      { name: 'Шесть дней ещё без скидки', args: [500, 6], expected: 3000 },
      { name: 'С седьмого дня скидка 10 %', args: [500, 7], expected: 3150 },
      { name: 'Десять дней со скидкой', args: [450, 10], expected: 4050 },
      { name: 'Округление вверх до целого рубля', args: [333, 7], expected: 2098 },
      { name: 'Округление вниз до целого рубля', args: [111, 7], expected: 699 },
      { name: 'Месяц аренды', args: [99, 30], expected: 2673 },
    ],
  },
  {
    slug: 'bookings-overlap',
    title: 'Пересечение броней',
    entryName: 'overlaps',
    descriptionMd: `Бронь задаётся датами начала и конца в формате \`ГГГГ-ММ-ДД\`:
\`{ from: '2027-02-10', to: '2027-02-12' }\`. Обе даты входят в бронь: инструмент
выдают утром первого дня и возвращают вечером последнего.

Напишите функцию \`overlaps(a, b)\`, которая возвращает \`true\`, если у двух броней
есть хотя бы один общий день, и \`false\`, если общих дней нет. Так прокат не
отдаст одну дрель двум клиентам на одни и те же дни.

Даты в таком формате можно сравнивать как обычные строки: \`'2027-02-09' < '2027-02-10'\`.

\`\`\`js
overlaps({ from: '2027-02-10', to: '2027-02-12' }, { from: '2027-02-12', to: '2027-02-14' }) // true
overlaps({ from: '2027-02-10', to: '2027-02-12' }, { from: '2027-02-13', to: '2027-02-14' }) // false
\`\`\``,
    starterCode: `function overlaps(a, b) {
  // Ваш код здесь
}
`,
    solutionCode: `function overlaps(a, b) {
  return a.from <= b.to && b.from <= a.to
}
`,
    cases: [
      { name: 'Вторая бронь начинается внутри первой', args: [booking('2027-02-10', '2027-02-12'), booking('2027-02-11', '2027-02-15')], expected: true },
      { name: 'Общий только последний день первой', args: [booking('2027-02-10', '2027-02-12'), booking('2027-02-12', '2027-02-14')], expected: true },
      { name: 'Вторая начинается на следующий день', args: [booking('2027-02-10', '2027-02-12'), booking('2027-02-13', '2027-02-14')], expected: false },
      { name: 'Вторая целиком раньше первой', args: [booking('2027-02-10', '2027-02-12'), booking('2027-02-01', '2027-02-05')], expected: false },
      { name: 'Вторая начинается раньше и заканчивается внутри первой', args: [booking('2027-02-10', '2027-02-12'), booking('2027-02-08', '2027-02-11')], expected: true },
      { name: 'Общий только первый день первой', args: [booking('2027-02-10', '2027-02-12'), booking('2027-02-05', '2027-02-10')], expected: true },
      { name: 'Вторая внутри первой', args: [booking('2027-02-01', '2027-02-28'), booking('2027-02-10', '2027-02-11')], expected: true },
      { name: 'Вторая целиком накрывает первую', args: [booking('2027-02-10', '2027-02-12'), booking('2027-02-01', '2027-02-28')], expected: true },
      { name: 'Обе брони на один и тот же день', args: [booking('2027-02-10', '2027-02-10'), booking('2027-02-10', '2027-02-10')], expected: true },
      { name: 'Брони на стыке месяцев', args: [booking('2027-01-30', '2027-02-02'), booking('2027-02-01', '2027-02-03')], expected: true },
    ],
  },
  {
    slug: 'catalog-summary',
    title: 'Сводка по каталогу',
    entryName: 'catalogSummary',
    descriptionMd: `Каталог проката хранится массивом позиций:
\`{ title: 'Дрель Bosch', category: 'drills', available: true }\`. Поле \`available\`
показывает, свободен ли инструмент сейчас.

Напишите функцию \`catalogSummary(items)\`, которая возвращает объект: для каждой
категории в нём указано, сколько позиций в категории всего и сколько из них свободно.
Для пустого каталога функция возвращает пустой объект \`{}\`.

\`\`\`js
catalogSummary([
  { title: 'Дрель Bosch', category: 'drills', available: true },
  { title: 'Дрель Makita', category: 'drills', available: false },
  { title: 'Пила Makita', category: 'saws', available: true },
])
// { drills: { total: 2, available: 1 }, saws: { total: 1, available: 1 } }
\`\`\``,
    starterCode: `function catalogSummary(items) {
  // Ваш код здесь
}
`,
    solutionCode: `function catalogSummary(items) {
  const summary = {}
  for (const item of items) {
    const row = summary[item.category] ?? { total: 0, available: 0 }
    row.total += 1
    if (item.available) row.available += 1
    summary[item.category] = row
  }
  return summary
}
`,
    cases: [
      { name: 'Пустой каталог', args: [[]], expected: {} },
      { name: 'Одна свободная позиция', args: [[item('Дрель Bosch', 'drills', true)]], expected: { drills: { total: 1, available: 1 } } },
      {
        name: 'Пример из условия',
        args: [[item('Дрель Bosch', 'drills', true), item('Дрель Makita', 'drills', false), item('Пила Makita', 'saws', true)]],
        expected: { drills: { total: 2, available: 1 }, saws: { total: 1, available: 1 } },
      },
      { name: 'Все позиции заняты', args: [[item('Пила Bosch', 'saws', false), item('Пила Makita', 'saws', false)]], expected: { saws: { total: 2, available: 0 } } },
      {
        name: 'Категории вперемешку',
        args: [[item('Лестница 3 м', 'ladders', true), item('Дрель Bosch', 'drills', false), item('Лестница 5 м', 'ladders', false), item('Дрель Hilti', 'drills', true)]],
        expected: { ladders: { total: 2, available: 1 }, drills: { total: 2, available: 1 } },
      },
    ],
  },
]

export function findEntryTask(slug: string): EntryTask | undefined {
  return ENTRY_TASKS.find((task) => task.slug === slug)
}

/** Задача в форме, которую принимает движок тренажёра. Тесты открыты целиком: кандидат видит, что проверяется. */
export function entryTaskSpec(task: EntryTask): TrainerTaskLike {
  return {
    slug: task.slug,
    checkMode: 'unit',
    languages: ['js'],
    entryName: task.entryName,
    starterCode: task.starterCode,
    solutionCode: task.solutionCode,
    testCases: toCaseSpecs(task.cases),
    timeLimitMs: 3000,
  }
}
