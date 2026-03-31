import type { Block } from 'payload'

export const MiroBlock: Block = {
  slug: 'miro',
  interfaceName: 'MiroBlock',
  labels: {
    singular: 'Miro-доска',
    plural: 'Miro-доски',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      label: 'Название доски',
    },
    {
      name: 'embedUrl',
      type: 'text',
      required: true,
      label: 'Ссылка для встраивания (Miro Embed URL)',
      admin: {
        description: 'Формат: https://miro.com/app/embed/...',
      },
    },
    {
      name: 'height',
      type: 'number',
      label: 'Высота (px)',
      defaultValue: 600,
      min: 300,
      max: 1200,
    },
  ],
}
