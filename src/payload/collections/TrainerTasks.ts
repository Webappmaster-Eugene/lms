import type { CollectionConfig, FieldAccess } from 'payload'

import { INTERVIEW_FORMAT_OPTIONS, validateCompanyEvidence } from '@/lib/trainer/metadata'
import { isAdmin } from '@/payload/access/isAdmin'
import { trainerTaskReadAccess } from '@/server/trainer-access'
import { cleanupLearningTargetGrants } from '@/payload/hooks/learningAccessCleanup'
import { generateSlug } from '@/payload/hooks/generateSlug'
import { cleanupTaskRelations } from '@/payload/hooks/cleanupOwnedRelations'
import {
  CHECK_MODE_OPTIONS,
  COMPANY_OPTIONS,
  COMPARE_OPTIONS,
  DIFFICULTY_OPTIONS,
  LANGUAGE_OPTIONS,
  TAG_OPTIONS,
  TRAINER_LIMITS,
} from '@/lib/trainer/constants'

/**
 * Поле показывается только для перечисленных режимов проверки.
 * Сигнатура условия в Payload позиционная: (data, siblingData, ctx).
 */
const showForModes =
  (...modes: string[]) =>
  (data: Partial<{ checkMode: string }>): boolean =>
    modes.includes(data?.checkMode ?? 'stdout')

/**
 * Данные скрытого кейса (аргументы и ожидаемое значение) видит только админ: иначе студент
 * подсматривает их через REST и подгоняет решение под проверку. Сервер берёт кейсы с overrideAccess.
 */
const readUnlessHiddenCase: FieldAccess = ({ req, siblingData }) =>
  req.user?.role === 'admin' || !(siblingData as { hidden?: boolean } | undefined)?.hidden

export const TrainerTasks: CollectionConfig = {
  slug: 'trainer-tasks',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'topic', 'difficulty', 'checkMode', 'order', 'isPublished'],
    group: 'Тренажёр',
  },
  access: {
    create: isAdmin,
    read: trainerTaskReadAccess,
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: {
    beforeValidate: [generateSlug],
    beforeDelete: [cleanupLearningTargetGrants('trainer-tasks'), cleanupTaskRelations],
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      label: 'Название задачи',
    },
    {
      name: 'slug',
      type: 'text',
      unique: true,
      required: true,
      label: 'Slug',
      admin: {
        position: 'sidebar',
        description: 'Генерируется автоматически из названия',
      },
    },
    {
      name: 'topic',
      type: 'relationship',
      relationTo: 'trainer-topics',
      required: true,
      label: 'Тема',
    },
    {
      name: 'order',
      type: 'number',
      defaultValue: 0,
      label: 'Порядок в теме',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'difficulty',
      type: 'select',
      required: true,
      defaultValue: 'easy',
      label: 'Сложность',
      options: [...DIFFICULTY_OPTIONS],
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'checkMode',
      type: 'select',
      required: true,
      defaultValue: 'stdout',
      label: 'Режим проверки',
      options: [...CHECK_MODE_OPTIONS],
      admin: {
        position: 'sidebar',
        description:
          'stdout — сравнение вывода; unit — JS/TS; types — типы TS; program — Go/Python; dom — frontend',
      },
    },
    {
      name: 'languages',
      type: 'select',
      hasMany: true,
      required: true,
      defaultValue: ['js'],
      label: 'Языки решения',
      options: [...LANGUAGE_OPTIONS],
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'description',
      type: 'richText',
      label: 'Условие задачи (устаревшее поле)',
      admin: {
        description: 'Оставлено для старых задач. Для новых заполняйте «Условие (Markdown)».',
      },
    },
    {
      name: 'descriptionMd',
      type: 'textarea',
      label: 'Условие задачи (Markdown)',
      admin: {
        description: 'Поддерживаются списки, таблицы и блоки кода с подсветкой.',
      },
    },
    {
      name: 'entryName',
      type: 'text',
      label: 'Имя функции/класса решения',
      admin: {
        description:
          'Что должен объявить пользователь: debounce, LRUCache, twoSum. Обязательно для табличных тестов.',
        condition: showForModes('unit'),
      },
    },
    {
      name: 'starterCode',
      type: 'textarea',
      required: true,
      label: 'Стартовый код (JavaScript / резервный шаблон)',
      admin: {
        description: 'Шаблон кода, который увидит пользователь. Используйте комментарии для подсказок.',
      },
    },
    {
      name: 'starterCodeTs',
      type: 'textarea',
      label: 'Стартовый код (TypeScript)',
      admin: {
        description: 'Используется, когда пользователь выбрал TypeScript.',
      },
    },
    { name: 'starterCodePython', type: 'textarea', label: 'Стартовый код (Python)', admin: { description: 'Python 3: чтение stdin и вывод ответа в stdout. Только стандартная библиотека.' } },
    { name: 'solutionCodePython', type: 'textarea', label: 'Эталонное решение (Python)', access: { read: ({ req }) => req.user?.role === 'admin' } },
    {
      name: 'starterCodeGo', type: 'textarea', label: 'Стартовый код (Go)',
      admin: { description: 'Полная программа package main, которая читает stdin и пишет в stdout.' },
    },
    {
      name: 'starterFiles', type: 'json', label: 'Стартовые файлы frontend-проекта',
      admin: { description: 'Объект: относительный путь файла → код. HTML: index.html; React: App.tsx; Next.js: app/page.tsx и app/layout.tsx.' },
    },
    {
      name: 'solutionCodeGo', type: 'textarea', label: 'Эталонное решение (Go)',
      access: { read: ({ req }) => req.user?.role === 'admin' },
    },
    {
      name: 'solutionFiles', type: 'json', label: 'Эталонные файлы frontend-проекта',
      access: { read: ({ req }) => req.user?.role === 'admin' },
    },
    {
      name: 'runtimeCases', type: 'array', label: 'Проверки Go и frontend', maxRows: 50,
      admin: { condition: showForModes('program', 'dom'), description: 'Go: stdin и stdout. Frontend: последовательность действий и проверок DOM/CSS. Скрытые данные видны только администратору.' },
      fields: [
        { name: 'name', type: 'text', required: true, label: 'Название проверки' },
        { name: 'hidden', type: 'checkbox', defaultValue: false, label: 'Скрытая проверка' },
        { name: 'input', type: 'textarea', label: 'Ввод программы (stdin)', access: { read: readUnlessHiddenCase } },
        { name: 'expected', type: 'textarea', label: 'Ожидаемый вывод (stdout)', access: { read: readUnlessHiddenCase } },
        { name: 'checks', type: 'json', label: 'Проверки интерфейса', access: { read: readUnlessHiddenCase },
          admin: { description: 'Массив: {selector, action?: click/fill, value?, text?, count?, visible?, css?, attribute?: {name,value}}.' } },
        { name: 'viewport', type: 'json', label: 'Размер окна', access: { read: readUnlessHiddenCase },
          admin: { description: 'Объект {width,height} для проверки адаптивной вёрстки.' } },
        { name: 'path', type: 'text', label: 'Путь страницы Next.js', access: { read: readUnlessHiddenCase } },
      ],
    },
    {
      name: 'setupCode',
      type: 'textarea',
      label: 'Преамбула',
      admin: {
        description:
          'Код, который выполняется ПЕРЕД решением: фикстуры, моки, вспомогательные классы. Доступен и решению, и тестам. Только JavaScript — преамбула одна на оба языка и в песочницу попадает без транспиляции.',
      },
    },
    {
      name: 'setupTypes',
      type: 'textarea',
      label: 'Типы преамбулы',
      admin: {
        description:
          'Объявления для компилятора: declare const helper: (x: number) => number. Нужны, когда задача решается на TypeScript, а преамбула написана на JavaScript — иначе strict-режим ругается на неявный any. Если пусто, tsc получит саму преамбулу.',
      },
    },
    {
      name: 'expectedOutput',
      type: 'textarea',
      label: 'Ожидаемый вывод',
      // Это правильный ответ. Раньше он уезжал на клиент и показывался на
      // странице задачи открытым текстом — решать было нечего.
      access: {
        read: ({ req }) => req.user?.role === 'admin',
      },
      admin: {
        description: 'Только для режима stdout. Каждая строка — один вызов console.log.',
        condition: showForModes('stdout'),
      },
    },
    {
      name: 'testCases',
      type: 'array',
      label: 'Табличные тесты',
      admin: {
        description: 'Вызвать функцию решения с аргументами и сравнить результат.',
        condition: showForModes('unit'),
      },
      fields: [
        {
          name: 'name',
          type: 'text',
          required: true,
          label: 'Название кейса',
        },
        {
          name: 'argsCode',
          type: 'textarea',
          access: { read: readUnlessHiddenCase },
          // Не обязательное: функция может вызываться без аргументов,
          // а пустую строку Payload считает отсутствующим значением.
          label: 'Аргументы (код)',
          admin: {
            description:
              'Список аргументов как в вызове, без скобок: 1, "a", [2]. Допустимы NaN, undefined, new Map([...]). Пусто — вызов без аргументов.',
          },
        },
        {
          name: 'expectedCode',
          type: 'textarea',
          required: true,
          access: { read: readUnlessHiddenCase },
          label: 'Ожидаемое значение (код)',
        },
        {
          name: 'compare',
          type: 'select',
          required: true,
          defaultValue: 'deep',
          label: 'Способ сравнения',
          options: [...COMPARE_OPTIONS],
        },
        {
          name: 'hidden',
          type: 'checkbox',
          defaultValue: false,
          label: 'Скрытый кейс',
          admin: {
            description: 'Входные данные и ожидаемый результат не показываются пользователю.',
          },
        },
      ],
    },
    {
      name: 'testCode',
      type: 'textarea',
      label: 'Тесты (JavaScript)',
      admin: {
        description:
          'Доступны test(name, fn), expect(value), __clock.tick(ms). Выполняются после табличных кейсов.',
        condition: showForModes('unit'),
      },
    },
    {
      name: 'typeHarness',
      type: 'textarea',
      label: 'Проверка типов',
      admin: {
        description:
          'Код с Expect<Equal<...>> и @ts-expect-error. Решение считается верным, когда tsc не выдал ни одной диагностики.',
        condition: showForModes('types'),
      },
    },
    {
      name: 'timeLimitMs',
      type: 'number',
      defaultValue: TRAINER_LIMITS.defaultTimeLimitMs,
      min: 500,
      max: TRAINER_LIMITS.maxTimeLimitMs,
      label: 'Лимит времени, мс',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'hints',
      type: 'array',
      label: 'Подсказки',
      fields: [
        {
          name: 'hint',
          type: 'textarea',
          required: true,
          label: 'Подсказка',
        },
      ],
    },
    {
      name: 'solutionCode',
      type: 'textarea',
      label: 'Эталонное решение (JavaScript)',
      access: {
        read: ({ req }) => req.user?.role === 'admin',
      },
      admin: {
        description: 'Только для администратора. Пользователю отдаётся отдельным роутом после решения.',
      },
    },
    {
      name: 'solutionCodeTs',
      type: 'textarea',
      label: 'Эталонное решение (TypeScript)',
      access: {
        read: ({ req }) => req.user?.role === 'admin',
      },
    },
    {
      name: 'solutionNotes',
      type: 'textarea',
      label: 'Разбор решения (Markdown)',
      access: {
        read: ({ req }) => req.user?.role === 'admin',
      },
      admin: {
        description: 'Пояснение к эталонному решению: идея, сложность, подводные камни.',
      },
    },
    {
      name: 'tags',
      type: 'select',
      hasMany: true,
      label: 'Теги',
      options: [...TAG_OPTIONS],
    },
    {
      name: 'companies',
      type: 'select',
      hasMany: true,
      label: 'Компании и подготовка',
      options: [...COMPANY_OPTIONS],
    },
    { name: 'interviewFormat', type: 'select', label: 'Формат собеседования', options: [...INTERVIEW_FORMAT_OPTIONS] },
    { name: 'recommendedMinutes', type: 'number', label: 'Время на тренировку (минуты)', min: 5, max: 180, admin: { description: 'Рекомендация платформы, не фактическая длительность интервью компании.' } },
    { name: 'companyEvidence', type: 'json', label: 'Источники меток компаний', validate: validateCompanyEvidence, admin: { description: 'Компания, kind, url, note, checkedAt. official — опубликованный пример; candidate-report — рассказ кандидата; preparation — адаптация для подготовки; unverified — историческая метка без подтверждения.' } },
    {
      name: 'sourceUrl',
      type: 'text',
      label: 'Источник',
      admin: {
        description: 'Ссылка на первоисточник задачи.',
      },
    },
    {
      name: 'leetcodeNumber',
      type: 'number',
      label: 'Номер на LeetCode',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'pointsReward',
      type: 'number',
      defaultValue: 10,
      min: 0,
      label: 'Баллы за решение',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'isPublished',
      type: 'checkbox',
      defaultValue: false,
      label: 'Опубликована',
      admin: {
        position: 'sidebar',
      },
    },
  ],
}
