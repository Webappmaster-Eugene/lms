import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildConfig } from 'payload'
import { postgresAdapter } from '@payloadcms/db-postgres'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import { nodemailerAdapter } from '@payloadcms/email-nodemailer'
import nodemailer from 'nodemailer'
import sharp from 'sharp'

import { migrations } from './migrations'
import { Users } from '@/payload/collections/Users'
import { Roadmaps } from '@/payload/collections/Roadmaps'
import { RoadmapNodes } from '@/payload/collections/RoadmapNodes'
import { RoadmapEdges } from '@/payload/collections/RoadmapEdges'
import { Courses } from '@/payload/collections/Courses'
import { Sections } from '@/payload/collections/Sections'
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
import { TrainerTopics } from '@/payload/collections/TrainerTopics'
import { TrainerTasks } from '@/payload/collections/TrainerTasks'
import { UserTrainerProgress } from '@/payload/collections/UserTrainerProgress'
import { FaqItems } from '@/payload/collections/FaqItems'
import { YandexDiskImports } from '@/payload/collections/YandexDiskImports'
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
    components: {
      views: {
        roadmapEditor: {
          Component: '/components/roadmap-editor/RoadmapEditorView',
          path: '/roadmap-editor/:segments*',
        },
      },
    },
  },

  collections: [
    Users,
    Roadmaps,
    RoadmapNodes,
    RoadmapEdges,
    Courses,
    Sections,
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
    TrainerTopics,
    TrainerTasks,
    UserTrainerProgress,
    FaqItems,
    YandexDiskImports,
  ],

  globals: [SiteSettings],

  editor: lexicalEditor(),

  db: postgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL,
    },
    prodMigrations: migrations,
  }),

  sharp,

  email: process.env.SMTP_HOST
    ? nodemailerAdapter({
        defaultFromAddress: process.env.EMAIL_FROM_ADDRESS ?? 'noreply@nadtocheev.ru',
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

  onInit: async (payload) => {
    // --- Auto-create admin user on first launch ---
    const { totalDocs: usersCount } = await payload.count({ collection: 'users' })

    if (usersCount === 0) {
      const email = process.env.ADMIN_EMAIL
      const password = process.env.ADMIN_PASSWORD

      if (!email || !password) {
        payload.logger.error(
          'No users in DB and ADMIN_EMAIL / ADMIN_PASSWORD env vars not set. Cannot create initial admin.',
        )
      } else {
        await payload.create({
          collection: 'users',
          data: {
            email,
            password,
            firstName: 'Admin',
            lastName: 'System',
            role: 'admin',
            isActive: true,
          },
        })
        payload.logger.info(`Initial admin user created: ${email}`)
      }
    }

    // --- Auto-seed roadmap nodes if empty ---
    const { totalDocs: nodesCount } = await payload.count({ collection: 'roadmap-nodes' })

    if (nodesCount === 0) {
      payload.logger.info('roadmap-nodes is empty — running auto-seed…')
      try {
        const { seedRoadmapNodes } = await import('./lib/seed-roadmap-runner')
        await seedRoadmapNodes(payload)
        payload.logger.info('Roadmap auto-seed complete')
      } catch (err) {
        payload.logger.error({ err }, 'Roadmap auto-seed failed')
      }
    }
  },
})
