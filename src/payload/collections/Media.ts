import type { Access, CollectionConfig } from 'payload'

import { isAdmin } from '@/payload/access/isAdmin'

/** Форматы аватара. SVG нельзя: файлы отдаются с нашего домена, и скрипт в SVG дал бы XSS */
const AVATAR_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp', 'image/gif']
const AVATAR_MAX_BYTES = 2 * 1024 * 1024

/** Публичные обложки/аватары сохраняются; видео требуют сессию, в том числе Range. */
const canReadMedia: Access = ({ req }) => {
  if (req.user) return true
  return { mimeType: { not_like: 'video/%' } }
}

/**
 * Админ загружает любые материалы курса; студент - только картинку для аватара в профиле
 * (/profile/edit). Раньше загрузка была только у админа, и смена аватара всегда падала.
 */
const canUploadMedia: Access = ({ req }) => {
  if (!req.user) return false
  if (req.user.role === 'admin') return true
  const file = req.file
  if (!file || !AVATAR_MIME_TYPES.includes(file.mimetype) || file.size > AVATAR_MAX_BYTES) return false
  // mimetype присылает браузер - сверяем с сигнатурой самого файла
  return isRasterImage(file.data)
}

function isRasterImage(data: Buffer | undefined): boolean {
  if (!data || data.length < 12) return false
  const png = data.subarray(0, 4).equals(Buffer.from([0x89, 0x50, 0x4e, 0x47]))
  const jpeg = data[0] === 0xff && data[1] === 0xd8 && data[2] === 0xff
  const gif = data.subarray(0, 4).toString('latin1') === 'GIF8'
  const webp = data.subarray(0, 4).toString('latin1') === 'RIFF' && data.subarray(8, 12).toString('latin1') === 'WEBP'
  return png || jpeg || gif || webp
}

export const Media: CollectionConfig = {
  slug: 'media',
  admin: {
    group: 'Контент',
  },
  upload: {
    staticDir: 'media',
    mimeTypes: ['image/*', 'application/pdf', 'video/*', 'application/zip'],
    modifyResponseHeaders: ({ headers }) => {
      if (headers.get('Content-Type')?.startsWith('video/')) {
        headers.set('Cache-Control', 'private, no-store')
        headers.set('Content-Disposition', 'inline')
        headers.set('X-Content-Type-Options', 'nosniff')
      }
      return headers
    },
    imageSizes: [
      {
        name: 'thumbnail',
        width: 400,
        height: 300,
        position: 'centre',
      },
      {
        name: 'card',
        width: 768,
        height: 512,
        position: 'centre',
      },
    ],
  },
  access: {
    create: canUploadMedia,
    read: canReadMedia,
    update: isAdmin,
    delete: isAdmin,
  },
  fields: [
    {
      name: 'alt',
      type: 'text',
      label: 'Alt-текст',
    },
  ],
}
