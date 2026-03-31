import type { CollectionConfig } from 'payload'

import { isAdmin } from '@/payload/access/isAdmin'
import { isAuthenticated } from '@/payload/access/isAuthenticated'
import { generateSlug } from '@/payload/hooks/generateSlug'
import { TextBlock } from '@/payload/blocks/TextBlock'
import { VideoBlock } from '@/payload/blocks/VideoBlock'
import { ImageBlock } from '@/payload/blocks/ImageBlock'
import { LinkBlock } from '@/payload/blocks/LinkBlock'
import { MiroBlock } from '@/payload/blocks/MiroBlock'
import { FileBlock } from '@/payload/blocks/FileBlock'

export const Lessons: CollectionConfig = {
  slug: 'lessons',
  admin: {
    useAsTitle: 'title',
    defaultColumns: ['title', 'course', 'order', 'isPublished', 'updatedAt'],
    group: 'Контент',
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
      label: 'Название урока',
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
      name: 'description',
      type: 'textarea',
      label: 'Краткое описание',
      maxLength: 300,
    },
    {
      name: 'course',
      type: 'relationship',
      relationTo: 'courses',
      required: true,
      label: 'Курс',
    },
    {
      name: 'order',
      type: 'number',
      defaultValue: 0,
      label: 'Порядок в курсе',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'isPublished',
      type: 'checkbox',
      defaultValue: false,
      label: 'Опубликован',
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'estimatedMinutes',
      type: 'number',
      label: 'Ожидаемое время (минут)',
      min: 0,
      admin: {
        position: 'sidebar',
      },
    },
    {
      name: 'content',
      type: 'blocks',
      label: 'Контент урока',
      blocks: [TextBlock, VideoBlock, ImageBlock, LinkBlock, MiroBlock, FileBlock],
    },
  ],
}
