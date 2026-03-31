import type { Block } from 'payload'

export const ImageBlock: Block = {
  slug: 'image',
  interfaceName: 'ImageBlock',
  labels: {
    singular: 'Изображение',
    plural: 'Изображения',
  },
  fields: [
    {
      name: 'image',
      type: 'upload',
      relationTo: 'media',
      required: true,
      label: 'Изображение',
    },
    {
      name: 'caption',
      type: 'text',
      label: 'Подпись',
    },
    {
      name: 'altText',
      type: 'text',
      label: 'Alt-текст (для доступности)',
    },
  ],
}
