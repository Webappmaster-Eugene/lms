import type { TrainerTopicSeed } from './types'

/**
 * Тема 7. Строки.
 *
 * Разминочные задачи собеседования. Кажутся простыми, но подножки в них
 * стабильные: юникод и суррогатные пары, регистр, пробелы и пунктуация.
 */
export const strings: TrainerTopicSeed = {
  slug: 'strings',
  title: 'Строки',
  description: 'Палиндромы, анаграммы, преобразование регистров и подсчёты',
  category: 'javascript',
  icon: '🔤',
  order: 7,
  tasks: [
    {
      slug: 'is-palindrome',
      title: 'Палиндром',
      difficulty: 'easy',
      checkMode: 'unit',
      languages: ['js', 'ts'],
      entryName: 'isPalindrome',
      tags: ['strings'],
      companies: ['yandex', 'wildberries'],
      descriptionMd: `Реализуйте \`isPalindrome(text)\` — проверку, читается ли строка одинаково в обе
стороны.

При сравнении игнорируются регистр, пробелы и знаки препинания; учитываются
только буквы и цифры.

\`\`\`js
isPalindrome('А роза упала на лапу Азора') // true
isPalindrome('Не гни, шею, вешинген!')      // true
isPalindrome('привет')                      // false
isPalindrome('')                            // true
\`\`\``,
      starterCode: `function isPalindrome(text) {
  // Ваш код здесь
}
`,
      starterCodeTs: `function isPalindrome(text: string): boolean {
  // Ваш код здесь
}
`,
      solutionCode: `function isPalindrome(text) {
  const normalized = text.toLowerCase().replace(/[^\\p{L}\\p{N}]/gu, '')

  let left = 0
  let right = normalized.length - 1

  while (left < right) {
    if (normalized[left] !== normalized[right]) return false
    left += 1
    right -= 1
  }

  return true
}
`,
      solutionCodeTs: `function isPalindrome(text: string): boolean {
  const normalized = text.toLowerCase().replace(/[^\\p{L}\\p{N}]/gu, '')

  let left = 0
  let right = normalized.length - 1

  while (left < right) {
    if (normalized[left] !== normalized[right]) return false
    left += 1
    right -= 1
  }

  return true
}
`,
      solutionNotes: `Юникодные классы \`\\p{L}\` (буква) и \`\\p{N}\` (цифра) с флагом \`u\` работают и с
кириллицей. Наивное \`[^a-z0-9]\` вырезало бы все русские буквы — и любая русская
строка стала бы палиндромом.

Два указателя с двух концов дают O(n) времени и O(1) дополнительной памяти
сверх нормализованной строки. Вариант \`normalized === [...normalized].reverse().join('')\`
короче, но создаёт ещё две копии строки.

Пустая строка и строка из одного символа — палиндромы: цикл в них просто не
выполняется.`,
      hints: [
        'Для кириллицы нужны юникодные классы \\p{L} и \\p{N} с флагом u.',
        'Двумя указателями с концов строки — O(n) без лишних копий.',
      ],
      cases: [
        { name: 'русская фраза', args: ['А роза упала на лапу Азора'], expected: true },
        { name: 'не палиндром', args: ['привет'], expected: false },
        { name: 'пустая строка', args: [''], expected: true },
        { name: 'один символ', args: ['а'], expected: true },
        { name: 'с пунктуацией', args: ['А роза, упала — на лапу Азора!'], expected: true },
        { name: 'цифры', args: ['12321'], expected: true },
        { name: 'разный регистр', args: ['Шалаш'], expected: true, hidden: true },
        { name: 'только знаки препинания', args: ['!!!'], expected: true, hidden: true },
      ],
    },

    {
      slug: 'is-anagram',
      title: 'Анаграммы',
      difficulty: 'easy',
      checkMode: 'unit',
      languages: ['js', 'ts'],
      entryName: 'isAnagram',
      tags: ['strings'],
      companies: ['ozon', 'faang'],
      leetcodeNumber: 242,
      sourceUrl: 'https://leetcode.com/problems/valid-anagram/',
      descriptionMd: `Реализуйте \`isAnagram(first, second)\` — проверку, состоят ли две строки из одних
и тех же букв.

Регистр и пробелы игнорируются.

\`\`\`js
isAnagram('листок', 'столик')  // true
isAnagram('Аист', 'Тиса')      // true
isAnagram('раб', 'бар ')       // true
isAnagram('привет', 'пока')    // false
\`\`\`

Решение должно работать за O(n). Сортировка даёт O(n log n) — попробуйте
обойтись без неё.`,
      starterCode: `function isAnagram(first, second) {
  // Ваш код здесь
}
`,
      starterCodeTs: `function isAnagram(first: string, second: string): boolean {
  // Ваш код здесь
}
`,
      solutionCode: `function isAnagram(first, second) {
  const normalize = (text) => text.toLowerCase().replace(/\\s/g, '')

  const a = normalize(first)
  const b = normalize(second)

  if (a.length !== b.length) return false

  const counts = new Map()

  for (const char of a) {
    counts.set(char, (counts.get(char) || 0) + 1)
  }

  for (const char of b) {
    const left = counts.get(char)
    if (!left) return false
    counts.set(char, left - 1)
  }

  return true
}
`,
      solutionCodeTs: `function isAnagram(first: string, second: string): boolean {
  const normalize = (text: string): string => text.toLowerCase().replace(/\\s/g, '')

  const a = normalize(first)
  const b = normalize(second)

  if (a.length !== b.length) return false

  const counts = new Map<string, number>()

  for (const char of a) {
    counts.set(char, (counts.get(char) ?? 0) + 1)
  }

  for (const char of b) {
    const left = counts.get(char)
    if (!left) return false
    counts.set(char, left - 1)
  }

  return true
}
`,
      solutionNotes: `Счётчик символов даёт O(n) вместо O(n log n) у решения через сортировку.

Сравнение длин в начале — не микрооптимизация, а необходимая проверка: без неё
строка «раб» и «барбар» разошлись бы только на втором проходе, а «раб» и «ра»
вообще прошли бы как анаграммы.

Проверка \`if (!left)\` покрывает сразу два случая: символа в счётчике не было
вовсе и он уже израсходован. Ноль и \`undefined\` здесь одинаково означают
«больше такого символа нет».

Перебор \`for...of\` по строке идёт по кодовым точкам, а не по единицам UTF-16, —
эмодзи и символы вне базовой плоскости не разваливаются пополам.`,
      hints: [
        'Считайте символы в Map за один проход, во втором — вычитайте.',
        'Сравните длины до подсчёта.',
        'Ноль в счётчике и отсутствие ключа — одинаково «символа больше нет».',
      ],
      cases: [
        { name: 'простая анаграмма', args: ['листок', 'столик'], expected: true },
        { name: 'разный регистр', args: ['Аист', 'Тиса'], expected: true },
        { name: 'не анаграмма', args: ['привет', 'пока'], expected: false },
        { name: 'разная длина', args: ['раб', 'барбар'], expected: false },
        { name: 'пробелы игнорируются', args: ['раб', 'бар '], expected: true },
        { name: 'пустые строки', args: ['', ''], expected: true },
        { name: 'повторяющиеся буквы', args: ['ааб', 'абб'], expected: false, hidden: true },
      ],
    },

    {
      slug: 'reverse-string',
      title: 'Разворот строки',
      difficulty: 'easy',
      checkMode: 'unit',
      languages: ['js', 'ts'],
      entryName: 'reverseString',
      tags: ['strings'],
      companies: ['yandex'],
      descriptionMd: `Реализуйте \`reverseString(text)\` — разворот строки.

Решение должно корректно работать с символами вне базовой плоскости юникода:

\`\`\`js
reverseString('привет')  // 'тевирп'
reverseString('ab😀cd')  // 'dc😀ba' — эмодзи не должно развалиться
\`\`\`

Метод \`Array.prototype.reverse\` использовать нельзя.`,
      starterCode: `function reverseString(text) {
  // Ваш код здесь
}
`,
      starterCodeTs: `function reverseString(text: string): string {
  // Ваш код здесь
}
`,
      solutionCode: `function reverseString(text) {
  // Перебор строки идёт по кодовым точкам, а не по единицам UTF-16,
  // поэтому суррогатная пара остаётся целой.
  const characters = [...text]

  let result = ''
  for (let i = characters.length - 1; i >= 0; i--) {
    result += characters[i]
  }

  return result
}
`,
      solutionCodeTs: `function reverseString(text: string): string {
  const characters = [...text]

  let result = ''
  for (let i = characters.length - 1; i >= 0; i--) {
    result += characters[i]
  }

  return result
}
`,
      solutionNotes: `Строки в JavaScript хранятся в UTF-16, и эмодзи занимает две единицы —
суррогатную пару. Обход по индексам (\`text[i]\`) разрезал бы её пополам и на
выходе дал бы мусор.

Spread и \`for...of\` перебирают строку по кодовым точкам, поэтому пара остаётся
целой. Это самая частая «вторая часть» этой задачи на собеседовании.

Полностью корректный разворот произвольного текста ещё сложнее: составные
эмодзи (флаги, семьи) склеены нулевой шириной и модификаторами. Для них нужен
\`Intl.Segmenter\` с \`granularity: 'grapheme'\`.`,
      hints: [
        'Обход по индексам разрежет эмодзи пополам.',
        'Spread-оператор перебирает строку по кодовым точкам.',
      ],
      cases: [
        { name: 'кириллица', args: ['привет'], expected: 'тевирп' },
        { name: 'латиница', args: ['abc'], expected: 'cba' },
        { name: 'пустая строка', args: [''], expected: '' },
        { name: 'один символ', args: ['а'], expected: 'а' },
        { name: 'эмодзи не разваливается', args: ['ab😀cd'], expected: 'dc😀ba', hidden: true },
      ],
    },

    {
      slug: 'case-converters',
      title: 'camelCase и kebab-case',
      difficulty: 'medium',
      checkMode: 'unit',
      languages: ['js'],
      entryName: 'toCamelCase',
      tags: ['strings'],
      companies: ['avito', 'tbank'],
      descriptionMd: `Реализуйте две функции преобразования регистра:

- \`toCamelCase(text)\` превращает \`kebab-case\` и \`snake_case\` в \`camelCase\`;
- \`toKebabCase(text)\` превращает \`camelCase\` и \`PascalCase\` в \`kebab-case\`.

\`\`\`js
toCamelCase('background-color')  // 'backgroundColor'
toCamelCase('user_first_name')   // 'userFirstName'

toKebabCase('backgroundColor')   // 'background-color'
toKebabCase('BackgroundColor')   // 'background-color'
toKebabCase('parseHTMLString')   // 'parse-html-string'
\`\`\`

Задача встречается в любом коде, который переводит ответы API из \`snake_case\`
в стиль фронтенда.`,
      starterCode: `function toCamelCase(text) {
  // Ваш код здесь
}

function toKebabCase(text) {
  // Ваш код здесь
}
`,
      solutionCode: `function toCamelCase(text) {
  return text.replace(/[-_]+(.)?/g, (_match, char) => (char ? char.toUpperCase() : ''))
}

function toKebabCase(text) {
  return text
    // Граница «строчная или цифра → заглавная»: backgroundColor
    .replace(/([a-zа-яё0-9])([A-ZА-ЯЁ])/g, '$1-$2')
    // Граница «аббревиатура → слово»: HTMLString
    .replace(/([A-ZА-ЯЁ]+)([A-ZА-ЯЁ][a-zа-яё])/g, '$1-$2')
    .toLowerCase()
}
`,
      solutionNotes: `В \`toCamelCase\` квантификатор \`[-_]+\` схлопывает подряд идущие разделители, а
\`(.)?\` делает символ после них необязательным — иначе разделитель в конце строки
остался бы на месте.

В \`toKebabCase\` двух замен не избежать. Первая ловит обычную границу слов
(\`colorValue\` → \`color-Value\`). Вторая — границу после аббревиатуры:
в \`parseHTMLString\` нужно разрезать между \`HTML\` и \`String\`, но не внутри \`HTML\`.
Без неё получилось бы \`parse-h-t-m-l-string\`.

\`toLowerCase()\` применяется в самом конце, когда все дефисы уже расставлены.`,
      hints: [
        'В camelCase достаточно одной замены с колбэком, поднимающим регистр следующего символа.',
        'В kebab-case нужны две замены: обычная граница слов и граница после аббревиатуры.',
        'Приводите к нижнему регистру в самом конце.',
      ],
      cases: [
        { name: 'kebab в camel', args: ['background-color'], expected: 'backgroundColor' },
        { name: 'snake в camel', args: ['user_first_name'], expected: 'userFirstName' },
        { name: 'уже camelCase', args: ['alreadyCamel'], expected: 'alreadyCamel' },
        { name: 'пустая строка', args: [''], expected: '' },
        { name: 'подряд идущие разделители', args: ['a--b'], expected: 'aB', hidden: true },
      ],
      testCode: `test('camelCase в kebab-case', function () {
  expect(toKebabCase('backgroundColor')).toBe('background-color')
})

test('PascalCase в kebab-case', function () {
  expect(toKebabCase('BackgroundColor')).toBe('background-color')
})

test('аббревиатура режется правильно', function () {
  expect(toKebabCase('parseHTMLString')).toBe('parse-html-string')
})

test('уже kebab-case', function () {
  expect(toKebabCase('already-kebab')).toBe('already-kebab')
})

test('круговое преобразование', function () {
  expect(toCamelCase(toKebabCase('userFirstName'))).toBe('userFirstName')
})`,
    },

    {
      slug: 'count-chars',
      title: 'Частоты символов',
      difficulty: 'easy',
      checkMode: 'unit',
      languages: ['js', 'ts'],
      entryName: 'countChars',
      tags: ['strings', 'objects'],
      descriptionMd: `Реализуйте \`countChars(text)\` — подсчёт частоты символов.

Возвращается \`Map\`, где ключ — символ, значение — количество вхождений.
Пробелы пропускаются, регистр игнорируется. Порядок ключей — порядок первого
появления символа.

\`\`\`js
countChars('привет')  // Map { 'п' => 1, 'р' => 1, 'и' => 1, 'в' => 1, 'е' => 1, 'т' => 1 }
countChars('аб а')    // Map { 'а' => 2, 'б' => 1 }
\`\`\`

\`Map\`, а не объект, — чтобы не ловить коллизии с \`constructor\` и \`__proto__\`.`,
      starterCode: `function countChars(text) {
  // Ваш код здесь
}
`,
      starterCodeTs: `function countChars(text: string): Map<string, number> {
  // Ваш код здесь
}
`,
      solutionCode: `function countChars(text) {
  const counts = new Map()

  for (const char of text.toLowerCase()) {
    if (/\\s/.test(char)) continue
    counts.set(char, (counts.get(char) || 0) + 1)
  }

  return counts
}
`,
      solutionCodeTs: `function countChars(text: string): Map<string, number> {
  const counts = new Map<string, number>()

  for (const char of text.toLowerCase()) {
    if (/\\s/.test(char)) continue
    counts.set(char, (counts.get(char) ?? 0) + 1)
  }

  return counts
}
`,
      solutionNotes: `\`Map\` сохраняет порядок вставки, поэтому ключи идут в порядке первого появления
символа — у обычного объекта такой гарантии для всех ключей нет (целочисленные
ключи сортируются).

\`counts.get(char) || 0\` короче проверки \`has\`, и здесь это безопасно: счётчик
никогда не бывает нулевым, значит ложное срабатывание \`||\` невозможно.

\`for...of\` по строке идёт по кодовым точкам, поэтому эмодзи считается одним
символом, а не двумя половинками.`,
      hints: [
        'Map сохраняет порядок вставки и не конфликтует с ключами вроде constructor.',
        'for...of по строке идёт по кодовым точкам.',
      ],
      cases: [
        { name: 'все символы разные', args: ['абв'], expected: new Map([['а', 1], ['б', 1], ['в', 1]]) },
        { name: 'повторы и пробелы', args: ['аб а'], expected: new Map([['а', 2], ['б', 1]]) },
        { name: 'пустая строка', args: [''], expected: new Map() },
        { name: 'разный регистр', args: ['Аа'], expected: new Map([['а', 2]]), hidden: true },
      ],
    },

    {
      slug: 'truncate',
      title: 'Обрезка строки по словам',
      difficulty: 'easy',
      checkMode: 'unit',
      languages: ['js', 'ts'],
      entryName: 'truncate',
      tags: ['strings'],
      companies: ['wildberries'],
      descriptionMd: `Реализуйте \`truncate(text, maxLength, suffix)\` — обрезку строки до заданной
длины.

- если строка короче или равна \`maxLength\`, она возвращается без изменений;
- иначе строка обрезается так, чтобы **вместе с суффиксом** не превышать
  \`maxLength\`;
- обрезка идёт по границе слова: последнее слово не рвётся посередине;
- \`suffix\` по умолчанию — многоточие \`'…'\`;
- если целого слова не помещается, строка режется жёстко по символам.

\`\`\`js
truncate('Привет, дорогой мир', 12)  // 'Привет,…'
truncate('Короткая', 20)             // 'Короткая'
\`\`\``,
      starterCode: `function truncate(text, maxLength, suffix = '…') {
  // Ваш код здесь
}
`,
      starterCodeTs: `function truncate(text: string, maxLength: number, suffix = '…'): string {
  // Ваш код здесь
}
`,
      solutionCode: `function truncate(text, maxLength, suffix = '…') {
  if (text.length <= maxLength) return text

  const limit = maxLength - suffix.length
  if (limit <= 0) return suffix.slice(0, maxLength)

  const cut = text.slice(0, limit)
  const lastSpace = cut.lastIndexOf(' ')

  // Целое слово не поместилось — режем жёстко.
  const body = lastSpace > 0 ? cut.slice(0, lastSpace) : cut

  return body.trimEnd() + suffix
}
`,
      solutionCodeTs: `function truncate(text: string, maxLength: number, suffix = '…'): string {
  if (text.length <= maxLength) return text

  const limit = maxLength - suffix.length
  if (limit <= 0) return suffix.slice(0, maxLength)

  const cut = text.slice(0, limit)
  const lastSpace = cut.lastIndexOf(' ')

  const body = lastSpace > 0 ? cut.slice(0, lastSpace) : cut

  return body.trimEnd() + suffix
}
`,
      solutionNotes: `Длина суффикса вычитается из лимита заранее — иначе результат оказался бы
длиннее \`maxLength\`, а именно этого и добивались.

\`lastIndexOf(' ')\` ищет границу слова. Условие \`> 0\`, а не \`!== -1\`: пробел на
нулевой позиции означал бы пустой результат.

Вырожденный случай, когда суффикс сам длиннее лимита, обрабатывается отдельно —
иначе \`slice\` с отрицательным аргументом отсчитал бы от конца строки и вернул
бы что-то неожиданное.

\`trimEnd()\` убирает пробел, оставшийся перед суффиксом.`,
      hints: [
        'Вычтите длину суффикса из лимита до обрезки.',
        'Границу слова ищите через lastIndexOf(" ") в уже обрезанной части.',
        'Отдельно обработайте случай, когда суффикс длиннее лимита.',
      ],
      cases: [
        { name: 'короткая строка не меняется', args: ['Короткая', 20], expected: 'Короткая' },
        { name: 'обрезка по слову', args: ['Привет, дорогой мир', 12], expected: 'Привет,…' },
        { name: 'ровно по длине', args: ['абвгд', 5], expected: 'абвгд' },
        { name: 'свой суффикс', args: ['Привет дорогой мир', 12, '...'], expected: 'Привет...' },
        { name: 'слово не помещается', args: ['Оченьдлинноеслово', 8], expected: 'Оченьдл…', hidden: true },
      ],
    },

    {
      slug: 'capitalize-words',
      title: 'Заглавные буквы в словах',
      difficulty: 'easy',
      checkMode: 'unit',
      languages: ['js', 'ts'],
      entryName: 'capitalizeWords',
      tags: ['strings'],
      descriptionMd: `Реализуйте \`capitalizeWords(text)\` — приведение каждого слова к виду
«Первая буква заглавная, остальные строчные».

- разделителями считаются пробелы и дефисы;
- количество и вид разделителей сохраняются;
- слова после дефиса тоже пишутся с заглавной.

\`\`\`js
capitalizeWords('привет мир')          // 'Привет Мир'
capitalizeWords('ИВАН ПЕТРОВ')         // 'Иван Петров'
capitalizeWords('иван-петрович сидоров') // 'Иван-Петрович Сидоров'
\`\`\``,
      starterCode: `function capitalizeWords(text) {
  // Ваш код здесь
}
`,
      starterCodeTs: `function capitalizeWords(text: string): string {
  // Ваш код здесь
}
`,
      solutionCode: `function capitalizeWords(text) {
  return text
    .toLowerCase()
    .replace(/(^|[\\s-])(\\p{L})/gu, (_match, separator, letter) => separator + letter.toUpperCase())
}
`,
      solutionCodeTs: `function capitalizeWords(text: string): string {
  return text
    .toLowerCase()
    .replace(/(^|[\\s-])(\\p{L})/gu, (_match, separator: string, letter: string) =>
      separator + letter.toUpperCase(),
    )
}
`,
      solutionNotes: `Одна замена с захватом разделителя решает всю задачу и заодно сохраняет
исходные разделители как есть: их не нужно восстанавливать после \`split\`.

Альтернатива через \`split(' ')\` теряет двойные пробелы и не справляется с
дефисами без второго прохода.

\`^\` в группе \`(^|[\\s-])\` нужен для первого слова: перед ним разделителя нет.

\`toLowerCase()\` применяется первым — это и приводит \`ИВАН\` к \`Иван\`, а не
оставляет \`ИВАН\` как есть.

Класс \`\\p{L}\` с флагом \`u\` работает и с кириллицей; \`[a-z]\` пропустил бы русские
буквы.`,
      hints: [
        'Одна замена с захватом разделителя сохранит исходные пробелы и дефисы.',
        'Сначала приведите всю строку к нижнему регистру.',
        'Для кириллицы нужен класс \\p{L} с флагом u.',
      ],
      cases: [
        { name: 'два слова', args: ['привет мир'], expected: 'Привет Мир' },
        { name: 'верхний регистр', args: ['ИВАН ПЕТРОВ'], expected: 'Иван Петров' },
        { name: 'через дефис', args: ['иван-петрович сидоров'], expected: 'Иван-Петрович Сидоров' },
        { name: 'пустая строка', args: [''], expected: '' },
        { name: 'двойные пробелы сохраняются', args: ['а  б'], expected: 'А  Б', hidden: true },
        { name: 'латиница', args: ['hello world'], expected: 'Hello World', hidden: true },
      ],
    },
  ],
}
