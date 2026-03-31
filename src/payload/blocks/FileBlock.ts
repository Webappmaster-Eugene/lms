import type { Block } from 'payload'

export const FileBlock: Block = {
  slug: 'file',
  interfaceName: 'FileBlock',
  labels: {
    singular: 'Файл',
    plural: 'Файлы',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      label: 'Название файла',
    },
    {
      name: 'file',
      type: 'upload',
      relationTo: 'media',
      required: true,
      label: 'Файл',
    },
    {
      name: 'description',
      type: 'textarea',
      label: 'Описание',
    },
  ],
}
