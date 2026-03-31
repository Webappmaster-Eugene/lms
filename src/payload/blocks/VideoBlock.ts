import type { Block } from 'payload'

export const VideoBlock: Block = {
  slug: 'video',
  interfaceName: 'VideoBlock',
  labels: {
    singular: 'Видео',
    plural: 'Видео',
  },
  fields: [
    {
      name: 'title',
      type: 'text',
      required: true,
      label: 'Название',
    },
    {
      name: 'videoUrl',
      type: 'text',
      required: true,
      label: 'Ссылка на видео (Яндекс.Диск или YouTube)',
    },
    {
      name: 'displayMode',
      type: 'select',
      required: true,
      defaultValue: 'embed',
      label: 'Режим отображения',
      options: [
        { label: 'Встроенный плеер (iframe)', value: 'embed' },
        { label: 'Ссылка (открывается в новой вкладке)', value: 'link' },
      ],
    },
    {
      name: 'description',
      type: 'textarea',
      label: 'Описание',
    },
    {
      name: 'durationMinutes',
      type: 'number',
      label: 'Длительность (минуты)',
      min: 0,
    },
  ],
}
