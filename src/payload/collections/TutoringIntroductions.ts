import type { CollectionConfig } from 'payload'

import { tutoringPrograms } from '@/lib/tutoring'
import { isAdminField } from '@/payload/access/isAdmin'
import { tutoringIntroductionAccess } from '@/server/tutoring-access'

export const TutoringIntroductions: CollectionConfig = {
  slug: 'tutoring-introductions',
  labels: { singular: 'Вводная встреча', plural: 'Вводные встречи' },
  admin: { group: 'Менторство', useAsTitle: 'program' },
  access: { read: tutoringIntroductionAccess, create: () => false, update: () => false, delete: () => false },
  fields: [
    { name: 'program', type: 'select', label: 'Программа', required: true, unique: true,
      options: Object.entries(tutoringPrograms).map(([value, { label }]) => ({ value, label })) },
    { name: 'deckPdf', type: 'upload', relationTo: 'tutoring-deck-files', required: true, label: 'PDF для ученика' },
    { name: 'deckPptx', type: 'upload', relationTo: 'tutoring-deck-files', required: true, label: 'Исходник PPTX', access: { read: isAdminField } },
    { name: 'instructorNotes', type: 'textarea', required: true, maxLength: 80_000, label: 'Сценарий ведущего', access: { read: isAdminField } },
    { name: 'deckOrigin', type: 'select', required: true, options: ['import', 'manual'], access: { read: isAdminField } },
    { name: 'sourceDigest', type: 'text', required: true, maxLength: 64, access: { read: isAdminField } },
  ],
}
