import type { Payload } from 'payload'

/**
 * Демо-датасет ТОЛЬКО для съёмки скриншотов лендинга.
 * Запуск: pnpm payload run src/seed-demo.ts   (с DATABASE_URL на базу lms_shots)
 *
 * Скрипт не трогает продовую базу и рассчитан на изолированную копию.
 * Прогресс проставляется через Local API, поэтому срабатывают штатные хуки:
 * awardPoints, checkAchievements, createCertificate, updateStreak.
 */

const DEMO_EMAIL = 'demo.student@mentorcareer.ru'

interface LessonSpec {
  readonly title: string
  readonly minutes: number
}

interface SectionSpec {
  readonly title: string
  readonly lessons: readonly LessonSpec[]
}

interface CourseSpec {
  readonly title: string
  readonly slug: string
  readonly hours: number
  readonly sections: readonly SectionSpec[]
  /** Доля пройденных уроков, 0..1 — задаёт вид прогресс-баров на дашборде. */
  readonly completion: number
}

const COURSES: readonly CourseSpec[] = [
  {
    title: 'Глубокий React',
    slug: 'deep-react',
    hours: 42,
    completion: 1,
    sections: [
      {
        title: 'Webpack и введение',
        lessons: [
          { title: 'Как устроена сборка фронтенда', minutes: 14 },
          { title: 'Webpack: конфигурация с нуля', minutes: 22 },
          { title: 'Loaders и plugins', minutes: 18 },
          { title: 'Dev-server и hot reload', minutes: 11 },
        ],
      },
      {
        title: 'Router, App Layout, i18n',
        lessons: [
          { title: 'React Router: вложенные маршруты', minutes: 19 },
          { title: 'Каркас приложения и ленивые страницы', minutes: 16 },
          { title: 'Интернационализация через i18next', minutes: 13 },
        ],
      },
      {
        title: 'Тесты и Storybook',
        lessons: [
          { title: 'Jest и React Testing Library', minutes: 21 },
          { title: 'Storybook: изоляция компонентов', minutes: 17 },
          { title: 'Скриншотные тесты', minutes: 15 },
        ],
      },
      {
        title: 'Работа с данными',
        lessons: [
          { title: 'Json server. Имитация бэкенда', minutes: 8 },
          { title: 'Redux Toolkit: entity и слайсы', minutes: 24 },
          { title: 'Асинхронные редьюсеры', minutes: 20 },
        ],
      },
    ],
  },
  {
    title: 'TypeScript в production',
    slug: 'typescript-production',
    hours: 28,
    completion: 0.62,
    sections: [
      {
        title: 'Система типов',
        lessons: [
          { title: 'Структурная типизация и её ловушки', minutes: 17 },
          { title: 'Union, discriminated union, narrowing', minutes: 20 },
          { title: 'Generics: от простого к сложному', minutes: 26 },
          { title: 'Условные и mapped-типы', minutes: 23 },
        ],
      },
      {
        title: 'Строгий режим',
        lessons: [
          { title: 'strict: что включает каждый флаг', minutes: 15 },
          { title: 'Почему any ломает всю цепочку', minutes: 12 },
          { title: 'Типобезопасная работа с API', minutes: 19 },
        ],
      },
      {
        title: 'Инструменты',
        lessons: [
          { title: 'ESLint и typescript-eslint', minutes: 14 },
          { title: 'Настройка tsconfig под монорепо', minutes: 18 },
        ],
      },
    ],
  },
  {
    title: 'Next.js: App Router',
    slug: 'nextjs-app-router',
    hours: 34,
    completion: 0.4,
    sections: [
      {
        title: 'Серверные компоненты',
        lessons: [
          { title: 'RSC: что выполняется где', minutes: 21 },
          { title: 'Границы client и server', minutes: 18 },
          { title: 'Стриминг и Suspense', minutes: 16 },
        ],
      },
      {
        title: 'Данные и кэш',
        lessons: [
          { title: 'fetch, revalidate, теги кэша', minutes: 22 },
          { title: 'Server Actions вместо API-роутов', minutes: 19 },
          { title: 'Мутации и ревалидация', minutes: 15 },
        ],
      },
      {
        title: 'Production',
        lessons: [
          { title: 'Метаданные и SEO', minutes: 13 },
          { title: 'Деплой и переменные окружения', minutes: 17 },
        ],
      },
    ],
  },
  {
    title: 'Node.js и NestJS',
    slug: 'node-nestjs',
    hours: 38,
    completion: 0.25,
    sections: [
      {
        title: 'Основы платформы',
        lessons: [
          { title: 'Event loop: как на самом деле', minutes: 23 },
          { title: 'Потоки и backpressure', minutes: 19 },
          { title: 'Модули и разрешение зависимостей', minutes: 14 },
        ],
      },
      {
        title: 'NestJS',
        lessons: [
          { title: 'Модули, провайдеры, DI-контейнер', minutes: 25 },
          { title: 'Guards, pipes, interceptors', minutes: 21 },
          { title: 'Валидация DTO через class-validator', minutes: 16 },
        ],
      },
      {
        title: 'База данных',
        lessons: [
          { title: 'PostgreSQL: индексы и планы запросов', minutes: 27 },
          { title: 'Миграции по схеме expand-contract', minutes: 20 },
        ],
      },
    ],
  },
  {
    title: 'Docker и Kubernetes',
    slug: 'docker-kubernetes',
    hours: 30,
    completion: 0,
    sections: [
      {
        title: 'Контейнеры',
        lessons: [
          { title: 'Образы, слои, кэш сборки', minutes: 18 },
          { title: 'Multi-stage builds', minutes: 16 },
          { title: 'docker-compose для локальной разработки', minutes: 14 },
        ],
      },
      {
        title: 'Оркестрация',
        lessons: [
          { title: 'Pod, Deployment, Service', minutes: 24 },
          { title: 'ConfigMap, Secret, переменные', minutes: 17 },
          { title: 'Healthcheck и rolling update', minutes: 19 },
        ],
      },
    ],
  },
  {
    title: 'Подготовка к собеседованию',
    slug: 'interview-prep',
    hours: 22,
    completion: 0,
    sections: [
      {
        title: 'Техническая секция',
        lessons: [
          { title: 'Живое кодирование: как думать вслух', minutes: 20 },
          { title: 'Разбор типовых задач на алгоритмы', minutes: 28 },
          { title: 'Вопросы по архитектуре фронтенда', minutes: 22 },
        ],
      },
      {
        title: 'Софт-скиллы и оффер',
        lessons: [
          { title: 'Рассказ о себе за две минуты', minutes: 11 },
          { title: 'Переговоры о зарплате', minutes: 15 },
        ],
      },
    ],
  },
] as const

const ACHIEVEMENTS = [
  { title: 'Первый шаг', description: 'Пройден первый урок на платформе', criteriaType: 'lesson_count', criteriaValue: 1, pointsReward: 10 },
  { title: 'Набираем темп', description: 'Пройдено 10 уроков', criteriaType: 'lesson_count', criteriaValue: 10, pointsReward: 25 },
  { title: 'Половина пути', description: 'Пройдено 25 уроков', criteriaType: 'lesson_count', criteriaValue: 25, pointsReward: 50 },
  { title: 'Марафонец', description: 'Пройдено 50 уроков', criteriaType: 'lesson_count', criteriaValue: 50, pointsReward: 100 },
  { title: 'Курс закрыт', description: 'Полностью завершён первый курс', criteriaType: 'course_completion', criteriaValue: 1, pointsReward: 50 },
  { title: 'Практик', description: 'Решено 10 задач тренажёра', criteriaType: 'trainer_task_count', criteriaValue: 10, pointsReward: 30 },
  { title: 'Кодер', description: 'Решено 25 задач тренажёра', criteriaType: 'trainer_task_count', criteriaValue: 25, pointsReward: 60 },
  { title: 'Тысячник', description: 'Набрано 1000 баллов', criteriaType: 'total_points', criteriaValue: 1000, pointsReward: 100 },
] as const

/** Соперники для лидерборда — без них рейтинг выглядит пустым. */
const RIVALS = [
  { firstName: 'Марина', lastName: 'Ковалёва', lessons: 31 },
  { firstName: 'Артём', lastName: 'Волков', lessons: 27 },
  { firstName: 'Ольга', lastName: 'Лебедева', lessons: 19 },
  { firstName: 'Денис', lastName: 'Ершов', lessons: 14 },
  { firstName: 'Полина', lastName: 'Зайцева', lessons: 9 },
  { firstName: 'Кирилл', lastName: 'Новиков', lessons: 6 },
] as const

const slugify = (value: string, index: number): string =>
  `${value
    .toLowerCase()
    .replace(/[^a-zа-я0-9]+/gi, '-')
    .replace(/^-|-$/g, '')
    .slice(0, 40)}-${index}`

/** Дата N дней назад — прогресс должен выглядеть накопленным, а не одномоментным. */
const daysAgo = (n: number): string => {
  const d = new Date()
  d.setDate(d.getDate() - n)
  return d.toISOString()
}

export const seed = async (payload: Payload) => {
  const log = (msg: string) => console.log(`[demo] ${msg}`)

  // ── Роадмап-контейнер ───────────────────────────────────────────
  const { docs: roadmaps } = await payload.find({ collection: 'roadmaps', limit: 1 })
  const roadmap = roadmaps[0]
  if (!roadmap) throw new Error('Нет ни одного роадмапа — демо-курсы некуда привязать')

  // ── Достижения ──────────────────────────────────────────────────
  const { totalDocs: achCount } = await payload.count({ collection: 'achievements' })
  if (achCount === 0) {
    for (const a of ACHIEVEMENTS) {
      await payload.create({
        collection: 'achievements',
        data: { ...a, isActive: true },
        context: { skipHooks: true },
      })
    }
    log(`создано достижений: ${ACHIEVEMENTS.length}`)
  }

  // ── Курсы, разделы, уроки ───────────────────────────────────────
  const lessonsByCourse = new Map<string, number[]>()

  for (const [ci, spec] of COURSES.entries()) {
    const { docs: existing } = await payload.find({
      collection: 'courses',
      where: { slug: { equals: spec.slug } },
      limit: 1,
    })

    const course =
      existing[0] ??
      (await payload.create({
        collection: 'courses',
        data: {
          title: spec.title,
          slug: spec.slug,
          roadmap: roadmap.id,
          order: ci,
          isPublished: true,
          estimatedHours: spec.hours,
        },
        context: { skipHooks: true },
      }))

    const lessonIds: number[] = []

    for (const [si, section] of spec.sections.entries()) {
      const sectionSlug = `${spec.slug}-s${si + 1}`
      const { docs: foundSection } = await payload.find({
        collection: 'sections',
        where: { slug: { equals: sectionSlug } },
        limit: 1,
      })

      const sec =
        foundSection[0] ??
        (await payload.create({
          collection: 'sections',
          data: {
            title: section.title,
            slug: sectionSlug,
            course: course.id,
            order: si,
            isPublished: true,
          },
          context: { skipHooks: true },
        }))

      for (const [li, lesson] of section.lessons.entries()) {
        const lessonSlug = slugify(`${spec.slug}-${si + 1}-${li + 1}`, li)
        const { docs: foundLesson } = await payload.find({
          collection: 'lessons',
          where: { slug: { equals: lessonSlug } },
          limit: 1,
        })

        const doc =
          foundLesson[0] ??
          (await payload.create({
            collection: 'lessons',
            data: {
              title: lesson.title,
              slug: lessonSlug,
              course: course.id,
              section: sec.id,
              order: li,
              isPublished: true,
              estimatedMinutes: lesson.minutes,
            },
            context: { skipHooks: true },
          }))

        lessonIds.push(doc.id as number)
      }
    }

    lessonsByCourse.set(spec.slug, lessonIds)
    log(`курс «${spec.title}»: уроков ${lessonIds.length}`)
  }

  // ── Демо-студент ────────────────────────────────────────────────
  const { docs: found } = await payload.find({
    collection: 'users',
    where: { email: { equals: DEMO_EMAIL } },
    limit: 1,
  })

  const student =
    found[0] ??
    (await payload.create({
      collection: 'users',
      data: {
        email: DEMO_EMAIL,
        password: 'demo-screenshots-2026',
        firstName: 'Алексей',
        lastName: 'Морозов',
        role: 'student',
        isActive: true,
      },
      context: { skipHooks: true },
    }))

  log(`студент: ${student.email} (id=${student.id})`)

  // ── Прогресс по урокам: хуки начислят баллы, достижения, сертификаты ──
  let completed = 0
  let dayOffset = 46

  for (const spec of COURSES) {
    const ids = lessonsByCourse.get(spec.slug) ?? []
    const take = Math.round(ids.length * spec.completion)

    for (const lessonId of ids.slice(0, take)) {
      const { totalDocs } = await payload.count({
        collection: 'user-progress',
        where: { user: { equals: student.id }, lesson: { equals: lessonId } },
      })
      if (totalDocs > 0) continue

      await payload.create({
        collection: 'user-progress',
        data: {
          user: student.id,
          lesson: lessonId,
          isCompleted: true,
          completedAt: daysAgo(dayOffset),
          lastAccessedAt: daysAgo(dayOffset),
        },
      })

      completed += 1
      if (dayOffset > 1) dayOffset -= 1
    }
  }

  log(`отмечено пройденных уроков: ${completed}`)

  // ── Прогресс по узлам роадмапа ──────────────────────────────────
  // Курсы роадмапа (rm-fe-*) отдельные от демо-курсов: без них граф
  // «Карта навыков» рисуется полностью серым и на 0%.
  const { docs: roadmapCourses } = await payload.find({
    collection: 'courses',
    where: { slug: { like: 'rm-fe-' } },
    limit: 100,
    sort: 'order',
  })

  let roadmapDone = 0
  for (const course of roadmapCourses.slice(0, 9)) {
    const { docs: courseLessons } = await payload.find({
      collection: 'lessons',
      where: { course: { equals: course.id } },
      limit: 50,
    })

    for (const lesson of courseLessons) {
      const { totalDocs } = await payload.count({
        collection: 'user-progress',
        where: { user: { equals: student.id }, lesson: { equals: lesson.id } },
      })
      if (totalDocs > 0) continue

      await payload.create({
        collection: 'user-progress',
        data: {
          user: student.id,
          lesson: lesson.id,
          isCompleted: true,
          completedAt: daysAgo(30 - roadmapDone),
        },
      })
      roadmapDone += 1
    }
  }
  log(`пройдено узлов роадмапа: ${roadmapDone}`)

  // ── Тренажёр ────────────────────────────────────────────────────
  const { docs: tasks } = await payload.find({ collection: 'trainer-tasks', limit: 27, sort: 'id' })
  let solved = 0

  for (const task of tasks) {
    const { totalDocs } = await payload.count({
      collection: 'user-trainer-progress',
      where: { user: { equals: student.id }, task: { equals: task.id } },
    })
    if (totalDocs > 0) continue

    await payload.create({
      collection: 'user-trainer-progress',
      data: {
        user: student.id,
        task: task.id,
        isCompleted: true,
        language: 'js',
        failedAttempts: solved % 4,
      },
    })
    solved += 1
  }

  log(`решено задач тренажёра: ${solved}`)

  // ── Стрик ───────────────────────────────────────────────────────
  const today = new Date().toISOString().slice(0, 10)
  const { docs: streaks } = await payload.find({
    collection: 'streaks',
    where: { user: { equals: student.id } },
    limit: 1,
  })

  const streakData = {
    user: student.id,
    currentStreak: 12,
    longestStreak: 21,
    lastActivityDate: today,
    totalActiveDays: 48,
  }

  if (streaks[0]) {
    await payload.update({
      collection: 'streaks',
      id: streaks[0].id,
      data: streakData,
      context: { skipHooks: true },
    })
  } else {
    await payload.create({ collection: 'streaks', data: streakData, context: { skipHooks: true } })
  }
  log('стрик: 12 дней подряд, рекорд 21')

  // ── Соперники для лидерборда ────────────────────────────────────
  const allLessons = [...lessonsByCourse.values()].flat()

  for (const [ri, rival] of RIVALS.entries()) {
    const email = `rival${ri + 1}@mentorcareer.ru`
    const { docs: existingRival } = await payload.find({
      collection: 'users',
      where: { email: { equals: email } },
      limit: 1,
    })

    const user =
      existingRival[0] ??
      (await payload.create({
        collection: 'users',
        data: {
          email,
          password: `demo-rival-${ri + 1}-2026`,
          firstName: rival.firstName,
          lastName: rival.lastName,
          role: 'student',
          isActive: true,
        },
        context: { skipHooks: true },
      }))

    for (const lessonId of allLessons.slice(0, rival.lessons)) {
      const { totalDocs } = await payload.count({
        collection: 'user-progress',
        where: { user: { equals: user.id }, lesson: { equals: lessonId } },
      })
      if (totalDocs > 0) continue

      await payload.create({
        collection: 'user-progress',
        data: { user: user.id, lesson: lessonId, isCompleted: true, completedAt: daysAgo(20) },
      })
    }
  }

  log(`соперников в лидерборде: ${RIVALS.length}`)

  // ── Сертификаты ─────────────────────────────────────────────────
  // Штатный хук вешается на points-transactions и в демо-прогоне
  // отрабатывает не всегда, поэтому добираем явно по завершённым курсам.
  const { docs: completionTx } = await payload.find({
    collection: 'points-transactions',
    where: { user: { equals: student.id }, reason: { equals: 'course_completed' } },
    limit: 50,
  })

  for (const tx of completionTx) {
    const courseId = String(tx.relatedEntity ?? '')
    if (!courseId) continue

    const { totalDocs } = await payload.count({
      collection: 'certificates',
      where: { user: { equals: student.id }, relatedEntity: { equals: courseId } },
    })
    if (totalDocs > 0) continue

    const course = await payload.findByID({ collection: 'courses', id: courseId })
    await payload.create({
      collection: 'certificates',
      data: {
        user: student.id,
        type: 'course',
        title: course.title,
        relatedEntity: courseId,
        issuedAt: daysAgo(3),
        certificateNumber: `MC-2026-${String(courseId).padStart(4, '0')}`,
      },
      context: { skipHooks: true },
    })
    log(`сертификат выдан: ${course.title}`)
  }

  const fresh = await payload.findByID({ collection: 'users', id: student.id })
  log(`итоговые баллы студента: ${fresh.totalPoints}`)
  log('готово')
}

export default seed

// payload run импортирует модуль, но default-экспорт сам не вызывает —
// поэтому запускаем явно.
const { getPayload } = await import('payload')
const { default: config } = await import('@payload-config')
const payload = await getPayload({ config })
await seed(payload)
process.exit(0)
