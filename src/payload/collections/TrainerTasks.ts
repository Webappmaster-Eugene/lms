import type { CollectionConfig } from 'payload'

import { isAdmin } from '@/payload/access/isAdmin'
import { isAuthenticated } from '@/payload/access/isAuthenticated'
import { generateSlug } from '@/payload/hooks/generateSlug'
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

export const TrainerTasks: CollectionConfig = {
  slug: 'trainer-tasks',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'topic', 'difficulty', 'checkMode', 'order', 'isPublished'],
    group: 'Тренажёр',
  },
  access: {
    create: isAdmin,
    read: isAuthenticated,
    update: isAdmin,
    delete: isAdmin,
  },
  hooks: {
    beforeValidate: [generateSlug],
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
          'stdout — сравнение вывода (legacy); unit — прогон тестов; types — проверка типов TypeScript',
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
      label: 'Стартовый код (JavaScript)',
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
      label: 'Где спрашивают',
      options: [...COMPANY_OPTIONS],
    },
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
