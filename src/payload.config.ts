import { mkdir } from 'node:fs/promises'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

import { buildConfig } from 'payload'
import { securePostgresAdapter } from '@/server/secure-postgres-adapter'
import { lexicalEditor } from '@payloadcms/richtext-lexical'
import sharp from 'sharp'

import { migrations } from './migrations'
import { buildEmailAdapter } from '@/payload/email/transport'
import { OG_IMAGE, SITE_DESCRIPTION, SITE_NAME } from '@/lib/site-metadata'
import { payloadLogger, reportMigrationFailures, reportPayloadError } from '@/payload/hooks/reportPayloadError'
import { Users } from '@/payload/collections/Users'
import { Roadmaps } from '@/payload/collections/Roadmaps'
import { RoadmapNodes } from '@/payload/collections/RoadmapNodes'
import { RoadmapEdges } from '@/payload/collections/RoadmapEdges'
import { Courses } from '@/payload/collections/Courses'
import { Sections } from '@/payload/collections/Sections'
import { Lessons } from '@/payload/collections/Lessons'
import { Media } from '@/payload/collections/Media'
import { LessonLearningStates } from '@/payload/collections/LessonLearningStates'
import { LearningAccessGrants } from '@/payload/collections/LearningAccessGrants'
import { LearningAccessAudit } from '@/payload/collections/LearningAccessAudit'
import { LearningAccessPolicies } from '@/payload/collections/LearningAccessPolicies'
import { AuthSessionRevocations } from '@/payload/collections/AuthSessionRevocations'
import { AccountFreezes } from '@/payload/collections/AccountFreezes'
import { UserProgress } from '@/payload/collections/UserProgress'
import { Achievements } from '@/payload/collections/Achievements'
import { UserAchievements } from '@/payload/collections/UserAchievements'
import { PointsTransactions } from '@/payload/collections/PointsTransactions'
import { Bookmarks } from '@/payload/collections/Bookmarks'
import { Notes } from '@/payload/collections/Notes'
import { Comments } from '@/payload/collections/Comments'
import { Notifications } from '@/payload/collections/Notifications'
import { NotificationPreferences, PushSubscriptions, NotificationDeliveries, NotificationJobState } from '@/payload/collections/NotificationInfrastructure'
import { EmailBroadcasts, EmailBroadcastDeliveries } from '@/payload/collections/EmailBroadcasts'
import { bootstrapInterviewDirections } from '@/server/interviews/bootstrap'
import { bootstrapDefaultAchievements } from '@/lib/default-achievements'
import { StudentSessionTelemetry, StudentLearningEvents, StudentActivityDays } from '@/payload/collections/StudentAnalytics'
import { AdminDigests } from '@/payload/collections/AdminDigests'
import { BootcampStreams, BootcampWeekSubmissions } from '@/payload/collections/BootcampProgress'
import { WebVitalsReports } from '@/payload/collections/WebVitalsReports'
import { Certificates } from '@/payload/collections/Certificates'
import { Streaks } from '@/payload/collections/Streaks'
import { TrainerTopics } from '@/payload/collections/TrainerTopics'
import { TrainerTasks } from '@/payload/collections/TrainerTasks'
import { UserTrainerProgress } from '@/payload/collections/UserTrainerProgress'
import { InterviewDirections, InterviewRecordings, InterviewAnalysisUsage } from '@/payload/collections/InterviewLibrary'
import { InterviewRooms } from '@/payload/collections/InterviewRooms'
import { FaqItems } from '@/payload/collections/FaqItems'
import { ReplyTemplates } from '@/payload/collections/ReplyTemplates'
import { Guides } from '@/payload/collections/Guides'
import { GuideCategories } from '@/payload/collections/GuideCategories'
import { GuideReads } from '@/payload/collections/GuideReads'
import { YandexDiskImports } from '@/payload/collections/YandexDiskImports'
import { BootcampEntryTasks } from '@/payload/collections/BootcampEntryTasks'
import { BootcampLeadResumes, LEAD_RESUMES_DIR } from '@/payload/collections/BootcampLeadResumes'
import { BootcampEnrollments } from '@/payload/collections/BootcampEnrollments'
import { BootcampLeads } from '@/payload/collections/BootcampLeads'
import { BootcampLeadEvents } from '@/payload/collections/BootcampLeadEvents'
import { BootcampPayments } from '@/payload/collections/BootcampPayments'
import { BootcampRefunds } from '@/payload/collections/BootcampRefunds'
import { BootcampPrograms } from '@/payload/collections/BootcampPrograms'
import { withLessonSourceGuard } from '@/payload/hooks/denyLessonSourceQueries'
import { SiteSettings } from '@/payload/globals/SiteSettings'

const filename = fileURLToPath(import.meta.url)
const dirname = path.dirname(filename)
const serverURL = new URL(process.env.NEXT_PUBLIC_SERVER_URL || 'http://localhost:3000').origin

export default buildConfig({
  serverURL,
  // Payload's empty default accepts cookie authentication from every Origin.
  csrf: [serverURL],
  admin: {
    user: Users.slug,
    importMap: {
      baseDir: path.resolve(dirname),
    },
    meta: {
      // Своя подпись и жёлтая иконка: вкладку админки не спутать с вкладкой платформы.
      // Корневой шаблон заголовка допишет « - MentorCareer LMS» сам: «Ученики - Админка - MentorCareer LMS».
      titleSuffix: '- Админка',
      icons: [
        { rel: 'icon', url: '/images/admin/favicon.ico', sizes: '16x16 32x32 48x48', type: 'image/x-icon' },
        { rel: 'icon', url: '/images/admin/icon-32.png', sizes: '32x32', type: 'image/png' },
        { rel: 'apple-touch-icon', url: '/images/admin/apple-touch-icon.png', sizes: '180x180', type: 'image/png' },
      ],
      // Без своих значений ссылка на админку в мессенджере показывает карточку «Payload App».
      openGraph: { siteName: SITE_NAME, description: SITE_DESCRIPTION, images: [OG_IMAGE] },
    },
    components: {
      graphics: {
        Logo: '/components/brand/AdminBrand#AdminLogo',
        Icon: '/components/brand/AdminBrand#AdminIcon',
      },
      beforeLogin: ['/components/brand/AdminLoginNotice#AdminLoginNotice'],
      afterLogin: ['/components/brand/AdminLoginNotice#AdminLoginStudentLink'],
      providers: ['/components/analytics/AdminActivityProvider#AdminActivityProvider'],
      beforeNavLinks: ['/components/roadmap-editor/NavLink#RoadmapEditorNavLink'],
      views: {
        studentAnalytics: {
          Component: '/components/student-analytics/StudentAnalyticsView#StudentAnalyticsView',
          path: '/student-analytics',
        },
        learningAnalytics: {
          Component: '/components/learning-analytics/LearningAnalyticsView#LearningAnalyticsView',
          path: '/learning-analytics',
        },
        learningAccess: {
          Component: '/components/learning-access/LearningAccessView#LearningAccessView',
          path: '/learning-access',
        },
        bootcampFunnel: {
          Component: '/components/bootcamp/BootcampFunnelView#BootcampFunnelView',
          path: '/bootcamp-funnel',
        },
        bootcampProgress: {
          Component: '/components/bootcamp/BootcampProgressView#BootcampProgressView',
          path: '/bootcamp-progress',
        },
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
    Guides,
    GuideCategories,
    Media,
    UserProgress,
    LessonLearningStates,
    LearningAccessGrants,
    LearningAccessAudit,
    LearningAccessPolicies,
    AuthSessionRevocations,
    AccountFreezes,
    Achievements,
    UserAchievements,
    PointsTransactions,
    Notes,
    Bookmarks,
    GuideReads,
    Comments,
    ReplyTemplates,
    Notifications,
    NotificationPreferences,
    PushSubscriptions,
    NotificationDeliveries,
    NotificationJobState,
    EmailBroadcasts,
    EmailBroadcastDeliveries,
    StudentSessionTelemetry,
    StudentLearningEvents,
    StudentActivityDays,
    AdminDigests,
    WebVitalsReports,
    Certificates,
    Streaks,
    TrainerTopics,
    TrainerTasks,
    UserTrainerProgress,
    InterviewRooms,
    InterviewDirections,
    InterviewRecordings,
    InterviewAnalysisUsage,
    FaqItems,
    YandexDiskImports,
    BootcampPrograms,
    BootcampLeads,
    BootcampEntryTasks,
    BootcampLeadResumes,
    BootcampEnrollments,
    BootcampStreams,
    BootcampWeekSubmissions,
    BootcampPayments,
    BootcampRefunds,
    BootcampLeadEvents,
  ].map(withLessonSourceGuard),

  globals: [SiteSettings],

  editor: lexicalEditor(),

  db: securePostgresAdapter({
    pool: {
      connectionString: process.env.DATABASE_URL,
    },
    prodMigrations: reportMigrationFailures(migrations),
  }),

  sharp,

  email: buildEmailAdapter(),

  logger: payloadLogger,

  hooks: {
    afterError: [reportPayloadError],
  },

  secret: process.env.PAYLOAD_SECRET ?? 'CHANGE_ME_IN_PRODUCTION',

  typescript: {
    outputFile: path.resolve(dirname, 'payload-types.ts'),
  },

  onInit: async (payload) => {
    // Заранее: каталог появляется с первым файлом, а до этого его путь мог бы занять файл ученика из медиатеки.
    await mkdir(LEAD_RESUMES_DIR, { recursive: true }).catch((error: unknown) => {
      payload.logger.error({ err: error, msg: 'Каталог резюме кандидатов не создан' })
    })
    await bootstrapDefaultAchievements(payload)
    await bootstrapInterviewDirections(payload)
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
          // Пароль уже задан через ADMIN_PASSWORD — приглашение не нужно.
          context: { skipHooks: true },
        })
        payload.logger.info(`Initial admin user created: ${email}`)
      }
    }

    // --- Auto-seed roadmap nodes if empty ---
    const { totalDocs: nodesCount } = await payload.count({ collection: 'roadmap-nodes' })

    if (nodesCount === 0) {
      payload.logger.info('roadmap-nodes is empty - running auto-seed…')
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
