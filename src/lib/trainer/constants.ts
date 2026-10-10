/**
 * Справочники тренажёра: языки, режимы проверки, теги, компании.
 *
 * Единственный источник правды — отсюда их берут и Payload-коллекции
 * (для `options` у select-полей), и UI (для фильтров и подписей).
 */

import type {
  TrainerCheckMode,
  TrainerCompare,
  TrainerDifficulty,
  TrainerLanguage,
} from './types'

export type SelectOption<T extends string> = { readonly label: string; readonly value: T }

export const LANGUAGE_OPTIONS: ReadonlyArray<SelectOption<TrainerLanguage>> = [
  { label: 'JavaScript', value: 'js' },
  { label: 'TypeScript', value: 'ts' },
  { label: 'Go', value: 'go' },
  { label: 'Python', value: 'python' },
  { label: 'HTML / CSS', value: 'html' },
  { label: 'React', value: 'react' },
  { label: 'Next.js', value: 'next' },
] as const

export const LANGUAGE_LABELS: Readonly<Record<TrainerLanguage, string>> = {
  js: 'JavaScript',
  ts: 'TypeScript',
  go: 'Go',
  python: 'Python',
  html: 'HTML / CSS',
  react: 'React',
  next: 'Next.js',
}

/** Идентификатор языка для Monaco и Shiki. */
export const MONACO_LANGUAGE: Readonly<Record<TrainerLanguage, string>> = {
  js: 'javascript',
  ts: 'typescript',
  go: 'go',
  python: 'python',
  html: 'html',
  react: 'typescript',
  next: 'typescript',
}

export const CHECK_MODE_OPTIONS: ReadonlyArray<SelectOption<TrainerCheckMode>> = [
  { label: 'Сравнение вывода (легаси)', value: 'stdout' },
  { label: 'Юнит-тесты', value: 'unit' },
  { label: 'Проверка типов TypeScript', value: 'types' },
  { label: 'Go / Python: ввод и вывод программы', value: 'program' },
  { label: 'Frontend: проверки в браузере', value: 'dom' },
] as const

export const DIFFICULTY_OPTIONS: ReadonlyArray<SelectOption<TrainerDifficulty>> = [
  { label: 'Лёгкая', value: 'easy' },
  { label: 'Средняя', value: 'medium' },
  { label: 'Сложная', value: 'hard' },
] as const

export const DIFFICULTY_LABELS: Readonly<Record<TrainerDifficulty, string>> = {
  easy: 'Лёгкая',
  medium: 'Средняя',
  hard: 'Сложная',
}

export const COMPARE_OPTIONS: ReadonlyArray<SelectOption<TrainerCompare>> = [
  { label: 'Структурное (deep)', value: 'deep' },
  { label: 'Строгое (Object.is)', value: 'strict' },
  { label: 'Числа с погрешностью', value: 'approx' },
  { label: 'Массив без учёта порядка', value: 'sorted' },
  { label: 'Массив как множество', value: 'set' },
] as const

export const TRAINER_TAGS = [
  'closures',
  'this',
  'hoisting',
  'event-loop',
  'prototypes',
  'hof',
  'async',
  'promise',
  'arrays',
  'objects',
  'strings',
  'polyfill',
  'data-structures',
  'algorithms',
  'recursion',
  'leetcode',
  'patterns',
  'type-level',
  'generics',
  'web-api',
  'performance',
  'react',
  'hooks',
  'state',
  'forms',
  'accessibility',
  'go',
  'python',
  'concurrency',
  'channels',
  'context',
  'mutex',
  'two-pointers',
  'sliding-window',
  'hash-table',
  'stack',
  'queue',
  'binary-search',
  'sorting',
  'dynamic-programming',
  'graph',
  'tree',
  'heap',
  'linked-list',
  'greedy',
  'backtracking',
  'livecoding',
  'cancelation',
] as const

export type TrainerTag = (typeof TRAINER_TAGS)[number]

export const TAG_LABELS: Readonly<Record<TrainerTag, string>> = {
  closures: 'Замыкания',
  this: 'Контекст this',
  hoisting: 'Всплытие',
  'event-loop': 'Event Loop',
  prototypes: 'Прототипы',
  hof: 'Функции высшего порядка',
  async: 'Асинхронность',
  promise: 'Promise',
  arrays: 'Массивы',
  objects: 'Объекты',
  strings: 'Строки',
  polyfill: 'Полифиллы',
  'data-structures': 'Структуры данных',
  algorithms: 'Алгоритмы',
  recursion: 'Рекурсия',
  leetcode: 'LeetCode',
  patterns: 'Паттерны',
  'type-level': 'Система типов',
  generics: 'Дженерики',
  'web-api': 'Web API',
  performance: 'Производительность',
  'react': 'React',
  'hooks': 'Хуки React',
  'state': 'Состояние',
  'forms': 'Формы',
  'accessibility': 'Доступность',
  'go': 'Go',
  'python': 'Python',
  'concurrency': 'Конкурентность',
  'channels': 'Каналы',
  'context': 'Контекст и отмена',
  'mutex': 'Мьютексы',
  'two-pointers': 'Два указателя',
  'sliding-window': 'Скользящее окно',
  'hash-table': 'Хеш-таблицы',
  'stack': 'Стек',
  'queue': 'Очередь',
  'binary-search': 'Бинарный поиск',
  'sorting': 'Сортировка',
  'dynamic-programming': 'Динамическое программирование',
  'graph': 'Графы',
  'tree': 'Деревья',
  'heap': 'Куча',
  'linked-list': 'Связный список',
  'greedy': 'Жадные алгоритмы',
  'backtracking': 'Поиск с возвратом',
  'livecoding': 'Лайвкодинг',
  'cancelation': 'Отмена операций',
}

export const TAG_OPTIONS: ReadonlyArray<SelectOption<TrainerTag>> = TRAINER_TAGS.map((tag) => ({
  label: TAG_LABELS[tag],
  value: tag,
}))

export const TRAINER_COMPANIES = [
  'yandex',
  'ozon',
  'avito',
  'tbank',
  'sber',
  'wildberries',
  'vk',
  'faang',
  'mts',
  'google',
  'meta',
  'amazon',
  'microsoft',
  'uber',
  'airbnb',
] as const

export type TrainerCompany = (typeof TRAINER_COMPANIES)[number]

export const COMPANY_LABELS: Readonly<Record<TrainerCompany, string>> = {
  yandex: 'Яндекс',
  ozon: 'Озон',
  avito: 'Авито',
  tbank: 'Т-Банк',
  sber: 'Сбер',
  wildberries: 'Wildberries',
  vk: 'VK',
  faang: 'FAANG / зарубеж',
  mts: 'МТС / KION',
  google: 'Google',
  meta: 'Meta',
  amazon: 'Amazon',
  microsoft: 'Microsoft',
  uber: 'Uber',
  airbnb: 'Airbnb',
}

export const COMPANY_OPTIONS: ReadonlyArray<SelectOption<TrainerCompany>> = TRAINER_COMPANIES.map(
  (company) => ({ label: COMPANY_LABELS[company], value: company }),
)

export const TOPIC_CATEGORIES = [
  'javascript',
  'typescript',
  'algorithms',
  'leetcode',
  'companies',
  'patterns',
  'webapi',
  'go',
  'frontend',
  'python',
] as const

export type TrainerTopicCategory = (typeof TOPIC_CATEGORIES)[number]

export const TOPIC_CATEGORY_LABELS: Readonly<Record<TrainerTopicCategory, string>> = {
  javascript: 'JavaScript',
  typescript: 'TypeScript',
  algorithms: 'Алгоритмы и структуры данных',
  leetcode: 'LeetCode',
  companies: 'Задачи компаний',
  patterns: 'Паттерны',
  webapi: 'Web API',
  go: 'Go',
  python: 'Python',
  frontend: 'HTML, CSS, React и Next.js',
}

export const TOPIC_CATEGORY_OPTIONS: ReadonlyArray<SelectOption<TrainerTopicCategory>> =
  TOPIC_CATEGORIES.map((category) => ({
    label: TOPIC_CATEGORY_LABELS[category],
    value: category,
  }))

/** Лимиты, общие для клиента и сервера. */
export const TRAINER_LIMITS = {
  /** Максимальная длина решения пользователя. */
  maxCodeLength: 20_000,
  /** Максимальное число строк перехваченного вывода. */
  maxConsoleLines: 200,
  /** Максимальный суммарный размер вывода. */
  maxConsoleChars: 10_240,
  /** Лимит времени по умолчанию, если у задачи он не задан. */
  defaultTimeLimitMs: 5_000,
  /** Верхняя граница лимита времени, которую можно выставить у задачи. */
  maxTimeLimitMs: 10_000,
  /** Максимальная длина одного сериализованного значения в отчёте. */
  maxSerializedLength: 600,
} as const
