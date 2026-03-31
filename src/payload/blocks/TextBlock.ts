import type { Block } from 'payload'

export const TextBlock: Block = {
  slug: 'text',
  interfaceName: 'TextBlock',
  labels: {
    singular: 'Текст',
    plural: 'Тексты',
  },
  fields: [
    {
      name: 'content',
      type: 'richText',
      required: true,
      label: 'Содержимое',
    },
  ],
}
