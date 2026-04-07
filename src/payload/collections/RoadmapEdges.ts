import type { CollectionConfig } from 'payload'

import { isAdmin } from '@/payload/access/isAdmin'
import { isAuthenticated } from '@/payload/access/isAuthenticated'

export const RoadmapEdges: CollectionConfig = {
  slug: 'roadmap-edges',
  admin: {
    useAsTitle: 'edgeId',
    defaultColumns: ['edgeId', 'roadmap', 'source', 'target', 'edgeType', 'updatedAt'],
    group: 'Контент',
    hidden: true,
  },
  access: {
    create: isAdmin,
    read: isAuthenticated,
    update: isAdmin,
    delete: isAdmin,
  },
  fields: [
    {
      name: 'edgeId',
      type: 'text',
      required: true,
      unique: true,
      label: 'ID связи',
      admin: {
        description: 'Уникальный идентификатор связи (например: "edge-1", "e-cat-topic")',
      },
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
      name: 'source',
      type: 'relationship',
      relationTo: 'roadmap-nodes',
      required: true,
      label: 'Исходный узел',
    },
    {
      name: 'target',
      type: 'relationship',
      relationTo: 'roadmap-nodes',
      required: true,
      label: 'Целевой узел',
    },
    {
      name: 'edgeType',
      type: 'select',
      defaultValue: 'smoothstep',
      label: 'Тип линии',
      options: [
        { label: 'Плавная ступенька', value: 'smoothstep' },
        { label: 'Кривая Безье', value: 'default' },
        { label: 'Прямая', value: 'straight' },
      ],
    },
    {
      name: 'animated',
      type: 'checkbox',
      defaultValue: false,
      label: 'Анимированная',
      admin: {
        description: 'Анимированная пунктирная линия',
      },
    },
  ],
}
