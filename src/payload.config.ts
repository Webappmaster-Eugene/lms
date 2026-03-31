import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildConfig } from 'payload'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { nodemailerAdapter } from '@payloadcms/email-nodemailer'
import nodemailer from 'nodemailer'
import sharp from 'sharp'

import { Users } from '@/payload/collections/Users'
import { Roadmaps } from '@/payload/collections/Roadmaps'
import { Courses } from '@/payload/collections/Courses'
import { Lessons } from '@/payload/collections/Lessons'
import { Media } from '@/payload/collections/Media'
import { UserProgress } from '@/payload/collections/UserProgress'
import { Achievements } from '@/payload/collections/Achievements'
import { UserAchievements } from '@/payload/collections/UserAchievements'
import { PointsTransactions } from '@/payload/collections/PointsTransactions'
import { Notes } from '@/payload/collections/Notes'
import { Comments } from '@/payload/collections/Comments'
import { Notifications } from '@/payload/collections/Notifications'
import { Certificates } from '@/payload/collections/Certificates'
import { Streaks } from '@/payload/collections/Streaks'
import { SiteSettings } from '@/payload/globals/SiteSettings'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)

export default buildConfig({
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
    meta: {
      titleSuffix: ' — MentorCareer LMS',
      icons: [{ url: '/icon.svg', type: 'image/svg+xml' }],
    },
  },

  collections: [
    Users,
    Roadmaps,
    Courses,
    Lessons,
    Media,
    UserProgress,
    Achievements,
    UserAchievements,
    PointsTransactions,
    Notes,
    Comments,
    Notifications,
    Certificates,
    Streaks,
  ],

  globals: [SiteSettings],

  editor: lexicalEditor(),

  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL,
    },
  }),

  sharp,

  email: process.env.SMTP_HOST
    ? nodemailerAdapter({
        defaultFromAddress: process.env.EMAIL_FROM_ADDRESS ?? 'noreply@mentorcareer.ru',
        defaultFromName: process.env.EMAIL_FROM_NAME ?? 'MentorCareer LMS',
        transport: nodemailer.createTransport({
          host: process.env.SMTP_HOST,
          port: Number(process.env.SMTP_PORT ?? 587),
          auth: {
            user: process.env.SMTP_USER,
            pass: process.env.SMTP_PASS,
          },
        }),
      })
    : undefined,

  secret: process.env.PAYLOAD_SECRET ?? 'CHANGE_ME_IN_PRODUCTION',

  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },
})
