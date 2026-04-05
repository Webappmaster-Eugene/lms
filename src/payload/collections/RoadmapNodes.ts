import type { CollectionConfig } from 'payload'

import { isAdmin } from '@/payload/access/isAdmin'
import { isAuthenticated } from '@/payload/access/isAuthenticated'

export const RoadmapNodes: CollectionConfig = {
  slug: 'roadmap-nodes',
  admin: {
    useAsTitle: 'label',
    defaultColumns: ['label', 'nodeType', 'roadmap', 'course', 'order', 'updatedAt'],
    group: 'Контент',
  },
  access: {
    create: isAdmin,
    read: isAuthenticated,
    update: isAdmin,
    delete: isAdmin,
  },
  fields: [
    {
      name: 'nodeId',
      type: 'text',
      required: true,
      unique: true,
      label: 'ID узла',
      admin: {
        description:
          'Уникальный идентификатор узла для графа (например: "cat-backend", "topic-nodejs")',
      },
    },
    {
      name: 'label',
      type: 'text',
      required: true,
      label: 'Название',
    },
    {
      name: 'nodeType',
      type: 'select',
      required: true,
      defaultValue: 'topic',
      label: 'Тип узла',
      options: [
        { label: 'Категория', value: 'category' },
        { label: 'Тема', value: 'topic' },
        { label: 'Подтема', value: 'subtopic' },
      ],
    },
    {
      name: 'roadmap',
      type: 'relationship',
      relationTo: 'roadmaps',
      required: true,
      label: 'Роадмап',
      index: true,
    },
    {
      name: 'course',
      type: 'relationship',
      relationTo: 'courses',
      label: 'Связанный курс',
      admin: {
        description: 'Если указан — узел кликабелен и отображает прогресс курса',
      },
    },
    {
      name: 'positionX',
      type: 'number',
      required: true,
      defaultValue: 0,
      label: 'Позиция X',
    },
    {
      name: 'positionY',
      type: 'number',
      required: true,
      defaultValue: 0,
      label: 'Позиция Y',
    },
    {
      name: 'description',
      type: 'textarea',
      label: 'Описание (tooltip)',
      maxLength: 300,
    },
    {
      name: 'icon',
      type: 'text',
      label: 'Иконка (lucide)',
      admin: {
        description: 'Имя иконки из lucide-react (например: "server", "database", "globe")',
      },
    },
    {
      name: 'stage',
      type: 'select',
      label: 'Стадия обучения',
      admin: {
        description: 'Используется для группировки узлов по уровню (Стажёр → Junior → Middle → Senior).',
      },
      options: [
        { label: 'Старт', value: 'start' },
        { label: 'База (1 неделя)', value: 'base' },
        { label: 'Стажёр (2–4 недели)', value: 'stage1' },
        { label: 'Junior (1 неделя)', value: 'stage2' },
        { label: 'Middle (1–2 месяца)', value: 'practice' },
        { label: 'Senior (продвинутое)', value: 'advanced' },
        { label: 'Рост (дополнительно)', value: 'growth' },
      ],
    },
    {
      name: 'color',
      type: 'select',
      label: 'Цвет карточки',
      admin: {
        description: 'Палитра Miro-доски. Если не указан — берётся цвет по умолчанию для стадии.',
      },
      options: [
        { label: 'Жёлтый (база)', value: 'yellow' },
        { label: 'Салатовый (ключевой)', value: 'lime' },
        { label: 'Белый (нейтральный)', value: 'white' },
        { label: 'Серый (дополнительный)', value: 'gray' },
        { label: 'Розовый (старт/финиш)', value: 'pink' },
        { label: 'Голубой (информационный)', value: 'blue' },
        { label: 'Красный (критичный)', value: 'red' },
      ],
    },
    {
      name: 'bullets',
      type: 'array',
      label: 'Список под-тем (отображается внутри карточки)',
      maxRows: 20,
      admin: {
        description: 'Маркированный список под-тем — отображается внутри карточки узла на графе, в стиле Miro.',
      },
      fields: [
        {
          name: 'text',
          type: 'text',
          required: true,
          label: 'Текст',
        },
      ],
    },
    {
      name: 'order',
      type: 'number',
      defaultValue: 0,
      label: 'Порядок сортировки',
      admin: {
        position: 'sidebar',
      },
    },
  ],
}
