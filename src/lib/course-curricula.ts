import type { ImportedSection } from './yandex-disk-structure'

/**
 * Названия уроков для курсов, где на диске их нет: файлы подписаны только
 * номерами ("lesson12.mp4", "17.mkv"). Источники — план обучения, приложенный
 * к раздаче, и заголовки тем на экране в самих видео.
 *
 * Разбор диска остаётся источником структуры и ссылок, здесь только названия,
 * поэтому повторный импорт их не теряет.
 */

/** Полная программа: применяется, только если число уроков совпадает с разобранным. */
type Syllabus = {
  sections: Array<{ title: string; lessons: string[] }>
}

/** Точечные названия: секция → номер урока → название. */
type LessonNames = Record<string, Record<number, string>>

type Curriculum = { syllabus?: Syllabus; names?: LessonNames }

const NEXTJS_14: Syllabus = {
  sections: [
  {
    title: 'Введение',
    lessons: [
      'Преимушества NextJS',
      'Как устроен курс',
      'Обзор проекта',
      'Обзор курсов',
      'Курс с наставником',
      'Курс с наставником и проектами',
      'Как проходить обновленный курс',
      'Работа на платформе',
    ],
  },
  {
    title: 'Настройка окружения',
    lessons: [
      'Установка софта',
      'Работа с nvm',
      'Настройка VSCode',
    ],
  },
  {
    title: 'TypeScript',
    lessons: [
      'Вводное видео',
      'Компилятор TypeScript',
      'Базовые типы',
      'Interfaces and Types',
      'Литеральные типы',
      'Enums',
      'Tuple',
      'Generics',
      'JSX',
    ],
  },
  {
    title: 'Старт проекта',
    lessons: [
      'Обзор модуля',
      'О новом router',
      'App Router - Развертка проекта',
      'Page Router - Развертка проекта',
      'App Router - Структура проекта',
      'Page Router - Структура проекта',
      'Настройка eslint',
      'Настройка stylelint',
      'Отладка в VSCode',
      'React Dev Tools',
    ],
  },
  {
    title: 'Компоненты Head и Document',
    lessons: [
      'Жизненный цикл React',
      'App Router - Компонент head',
      'Pages Router - Компоненты head',
      'React Fragment',
      'App Router - Корневой документ',
      'Pages Router - Компонент Document',
    ],
  },
  {
    title: 'Figma для разработчика',
    lessons: [
      'Обзор Модуля',
      'Разбор интерфейса',
      'Свойства компонент',
      'Экспорт графики',
    ],
  },
  {
    title: 'Простые компоненты',
    lessons: [
      'Font',
      'Шрифты и цвета',
      'Первый компонент',
      'Библиотека classnames',
      'Classnames',
      'HTMLProps',
      'Детали HTMLprops',
      'Работа с svg',
      'SVG Next 13',
      'Упражнение - Компонент р',
      'Компонент тэга',
    ],
  },
  {
    title: 'Statefull компоненты',
    lessons: [
      'App Router - Клиентские компоненты',
      'React Hooks',
      'useState',
      'useEffect',
      'Правила использования Hooks',
      'Архитектура компонента рейтинга',
      'Компонент рейтинга - 1',
      'Компонент рейтинга - 2',
    ],
  },
  {
    title: 'НОС компоненты',
    lessons: [
      'Что такое НОС',
      'App Router - Работа с layout',
      'App Router - Группы роутов',
      'App Router - Template',
      'App Router - Структура проекта',
      'Pages Router - Layout',
      'Pages Router - Пишем HOC withLayout',
    ],
  },
  {
    title: 'CSS Grid',
    lessons: [
      'Обзор модуля',
      'Template и gap',
      'Justify и  align',
      'Распределение ячеек',
      'Template-area',
      'Лучшие практики',
      'Верстка layout',
      'Упражнение - Верстка footer',
    ],
  },
  {
    title: 'Server side rendering',
    lessons: [
      'Переменные окружения',
      'Как работает SSR',
      'App Router - SSR в NextJS',
      'Pages Router - SSR в  NextJS',
      'App Router - Получение данных',
      'App Router - Динамические страницы',
      'App Router - notFound',
      'App Router - generateStaticParams',
      'Ревалидация страниц',
      'Pages Router - Использование getStaticProps',
      'Pages Router - Использование getStaticPaths',
    ],
  },
  {
    title: 'Контекст',
    lessons: [
      'useContext',
      'App Router - Работа с контекстом',
      'Пишем свой контекст',
      'Верстка меню',
    ],
  },
  {
    title: 'Роутинг',
    lessons: [
      'Обновление компонента Link',
      'Компонент Link',
      'App Router - Параллельные роуты',
      'App Router - Loading',
      'App Router - Error page',
      'useRouter',
      'Упражнение - Добавление страниц',
      'Структура роутинга',
      'Верстка Sidebar',
    ],
  },
  {
    title: 'Страница продуктов',
    lessons: [
      'Компоненты страниц',
      'Верстка страницы продуктов - 1',
      'Regex отображения цены',
      'Упражнение - Доработка страницы',
      'Верстка страницы продуктов - 2',
      'Вставка HTML',
      'useReducer',
      'Компонент сортировки',
      'Reducer сортировки',
    ],
  },
  {
    title: 'Компонент продукта',
    lessons: [
      'Компонент Input',
      'Упражнение - Компонент Textarea',
      'Компонент поиска',
      'Компонент продукта - Планирование',
      'Компонент продукта - сетка',
      'Компонент продукта - стили',
      'Склонение слов',
      'Компонент Image',
      'Компонент продукта - адаптив',
    ],
  },
  {
    title: 'Работа с формами',
    lessons: [
      'Компонент отзыва',
      'Форма отзыва',
      'useForm',
      'Работа с формами',
      'Проброс ref',
      'Обработка ошибок',
      'Упражнение - Обработка ошибок Rating',
      'Отправка запроса со страницы',
      'useRef',
      'Упражнение - Исправление бага useReducer',
    ],
  },
  {
    title: 'Анимация на Framer Motion',
    lessons: [
      'Вводное видео',
      'Принципы анимации',
      'Анимация меню',
      'Анимация сортировки',
      'Пишем свой hook',
      'useAnimation',
      'Упражнение - Анимация отзывов',
      'Динамическая иконка',
      'Мобильное меню',
      'Жесты и MotionValues',
      'Производительность',
    ],
  },
  {
    title: 'Доступность',
    lessons: [
      'Виды доступности',
      'Цветовая доступность',
      'Доступность меню с клавиатуры',
      'Доступность форм с клавиатуры',
      'Упражнение - Доступность сортировки',
      'ARIA атрибуты',
      'Использование Screen Reader',
      'Aria-label и aria-labelledby',
      'Aria-hidden',
      'Добавление lankmarks',
      'Доступность форм',
      'Упражнение - Доступность оповещений',
      'Доступность меню и списка',
      'Уменьшение движения',
    ],
  },
  {
    title: 'Подготовка к production',
    lessons: [
      'Script',
      'App Router - Расчет -meta',
      'Page Router - Добавление meta на страницу',
      'Установка метрики',
      'Husky',
      'Next export',
      'Страницы 404, 500',
      'Сборка контейнера Docker',
      'Запуск через docker-compose',
      'Github actions',
    ],
  },
  ],
}

/**
 * Темы взяты с экрана: автор ведёт занятия по доске Miro, где название темы
 * написано крупно на первом слайде.
 */
const PAROMOV_ARCHITECTURE: LessonNames = {
  'Архитектура основы': {
    1: 'Ценности и цели курса',
    2: 'Что такое архитектура',
    3: 'Информация — основа всего',
    4: 'Состояние и кэш',
    5: 'Как мы понимаем код',
    6: 'Важнейшие характеристики кода',
  },
  'Архитектура инкапсуляция': {
    1: 'Инкапсуляция — не ООП принцип',
    2: 'Инкапсуляция React-компонентов',
  },
  'Архитектура DRY': {
    1: 'DRY на практике',
    2: 'DRY: состояние и производные данные',
    3: 'DRY: типичная ошибка при работе с формами',
    4: 'DRY: необычные следствия',
  },
  'Архитектура Redux': {
    1: 'О чём будет курс',
    2: 'Что такое Redux',
    4: 'Состояние и контекст',
    5: 'Состояние общего назначения',
    6: 'Почему разработчики страдают от Redux',
    7: 'Зачем нужен Redux',
    8: 'Базовые концепции Redux',
    9: 'Что такое Action',
    10: 'Где живёт экшен',
    11: 'Какая логика должна быть в редьюсере',
    12: 'Где бизнес-логика',
    13: 'Ответственность селекторов',
    14: 'Всё вместе на примере',
    15: 'Однонаправленный поток данных',
    16: 'Зачем Redux иммутабельность',
    17: 'Зачем Redux моностор',
    18: 'Почему Redux позволяет писать крупные приложения',
    19: 'Extra: что такое Command',
    20: 'Пример из реального мира',
    21: 'Проект',
  },
}

const REACT_PATTERNS: LessonNames = {
  '58 React паттернов': {
    31: 'Состояние',
    32: 'Normalization',
    33: 'Cache и source of truth segregation',
    34: 'Hidden cache',
    35: 'User interaction state',
    36: 'Finite state machine',
    37: 'Siblings communication',
    38: 'Generic component',
    40: 'Compound components',
    41: 'Context control',
    42: 'Callback',
    43: 'Hook return jsx',
    44: 'HOC',
    45: 'Magic props',
    46: 'Real slots',
    47: 'Zero code optimization',
    48: 'Метрики производительности',
    49: 'Render as you fetch',
    50: 'Server side rendering',
    51: 'Streaming',
    52: 'Static site generation',
    53: 'Server components',
    54: 'Memoization',
    55: 'Lift state down, lift content up',
    56: 'Transitions и useDeferredValue',
    57: 'Virtualization',
    58: 'INP и плавность интерфейса',
  },
}

const ADVANCED_TYPING: LessonNames = {
  'Продвинутая типизация': {
    1: 'Введение: type level программирование',
    2: 'Что кому assignable',
    3: 'Правила assignable',
    4: 'Структурная типизация',
    5: 'Union двух типов',
    6: 'Assignable для функций',
  },
}

export const COURSE_CURRICULA: Record<string, Curriculum> = {
  'nextjs-14': { syllabus: NEXTJS_14 },
  'frontend-architecture-paromov': { names: PAROMOV_ARCHITECTURE },
  'react-patterns-58': { names: REACT_PATTERNS },
  'advanced-typing': { names: ADVANCED_TYPING },
}

/**
 * Подставляет названия из программы курса.
 *
 * Полную программу применяем только при точном совпадении числа уроков —
 * иначе сдвиг на один файл подписал бы весь курс неверно. Точечные названия
 * ставятся по номеру урока внутри секции и не трогают остальные.
 */
export function applyCurriculum(
  slug: string,
  sections: ImportedSection[],
): { sections: ImportedSection[]; warnings: string[] } {
  const curriculum = COURSE_CURRICULA[slug]
  if (!curriculum) return { sections, warnings: [] }

  if (curriculum.names) {
    for (const section of sections) {
      const names = curriculum.names[section.title]
      if (!names) continue
      for (const lesson of section.lessons) {
        const name = names[lesson.order]
        if (name) lesson.title = name
      }
    }
  }

  const syllabus = curriculum.syllabus
  if (!syllabus) return { sections, warnings: [] }

  const lessons = sections.flatMap((section) => section.lessons)
  const planned = syllabus.sections.reduce((sum, section) => sum + section.lessons.length, 0)

  if (lessons.length !== planned) {
    return {
      sections,
      warnings: [
        `Программа курса не применена: в плане ${planned} уроков, в папке ${lessons.length}`,
      ],
    }
  }

  let cursor = 0
  const rebuilt = syllabus.sections.map((planSection, index) => ({
    order: index + 1,
    title: planSection.title,
    lessons: planSection.lessons.map((title, position) => {
      const lesson = lessons[cursor++]
      return { ...lesson, order: position + 1, title }
    }),
  }))

  return { sections: rebuilt, warnings: [] }
}
