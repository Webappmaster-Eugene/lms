import type { Block } from 'payload'

export const LinkBlock: Block = {
  slug: 'link',
  interfaceName: 'LinkBlock',
  labels: {
    singular: 'Ссылка',
    plural: 'Ссылки',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      label: 'Название',
    },
    {
      name: 'url',
      type: 'text',
      required: true,
      label: 'URL',
    },
    {
      name: 'platform',
      type: 'select',
      label: 'Платформа',
      defaultValue: 'other',
      options: [
        { label: 'Boosty', value: 'boosty' },
        { label: 'Telegram', value: 'telegram' },
        { label: 'YouTube', value: 'youtube' },
        { label: 'GitHub', value: 'github' },
        { label: 'Другое', value: 'other' },
      ],
    },
    {
      name: 'description',
      type: 'textarea',
      label: 'Описание',
    },
  ],
}
