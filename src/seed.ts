import type { Payload } from 'payload'

/**
 * Seed-скрипт: создаёт начальные данные для LMS.
 * Запуск: pnpm seed
 */
export const seed = async (payload: Payload) => {
  console.log('Seeding LMS database...')

  // 1. Создаём admin-пользователя
  const admin = await payload.create({
    collection: 'users',
    data: {
      email: 'admin@mentorcareer.ru',
      password: 'admin123',
      firstName: 'Admin',
      lastName: 'MentorCareer',
      role: 'admin',
      isActive: true,
    },
    context: { skipHooks: true },
  })
  console.log('Admin user created:', admin.email)

  // 2. Создаём тестовых студентов
  const student1 = await payload.create({
    collection: 'users',
    data: {
      email: 'student1@test.com',
      password: 'student123',
      firstName: 'Иван',
      lastName: 'Петров',
      role: 'student',
      isActive: true,
    },
    context: { skipHooks: true },
  })

  const student2 = await payload.create({
    collection: 'users',
    data: {
      email: 'student2@test.com',
      password: 'student123',
      firstName: 'Анна',
      lastName: 'Сидорова',
      role: 'student',
      isActive: true,
    },
    context: { skipHooks: true },
  })
  console.log('Students created:', student1.email, student2.email)

  // 3. Настройки сайта
  await payload.updateGlobal({
    slug: 'site-settings',
    data: {
      platformName: 'MentorCareer LMS',
      platformDescription: 'Платформа обучения для менторской деятельности',
      points: {
        lessonCompleted: 10,
        courseCompleted: 50,
        roadmapCompleted: 200,
      },
    },
  })
  console.log('Site settings configured')

  // 4. Роадмап: Frontend React
  const reactRoadmap = await payload.create({
    collection: 'roadmaps',
    data: {
      title: 'Frontend React',
      slug: 'frontend-react',
      order: 1,
      isPublished: true,
    },
  })

  // Курсы React
  const jsBasics = await createCourse(payload, {
    title: 'Основы JavaScript',
    slug: 'js-basics',
    roadmapId: reactRoadmap.id,
    order: 1,
    estimatedHours: 20,
  })

  const reactFundamentals = await createCourse(payload, {
    title: 'React Fundamentals',
    slug: 'react-fundamentals',
    roadmapId: reactRoadmap.id,
    order: 2,
    estimatedHours: 25,
    prerequisites: [jsBasics.id],
  })

  const reactAdvanced = await createCourse(payload, {
    title: 'React Advanced',
    slug: 'react-advanced',
    roadmapId: reactRoadmap.id,
    order: 3,
    estimatedHours: 20,
    prerequisites: [reactFundamentals.id],
  })

  const reactProject = await createCourse(payload, {
    title: 'Финальный проект',
    slug: 'react-final-project',
    roadmapId: reactRoadmap.id,
    order: 4,
    estimatedHours: 15,
    prerequisites: [reactAdvanced.id],
  })

  // Уроки React
  const jsLessons = [
    { title: 'Переменные и типы данных', estimatedMinutes: 30 },
    { title: 'Функции и замыкания', estimatedMinutes: 45 },
    { title: 'Массивы и объекты', estimatedMinutes: 40 },
    { title: 'Асинхронность: Promise и async/await', estimatedMinutes: 60 },
    { title: 'ES6+ возможности', estimatedMinutes: 35 },
  ]

  const reactFundLessons = [
    { title: 'Введение в React и JSX', estimatedMinutes: 30 },
    { title: 'Компоненты и пропсы', estimatedMinutes: 45 },
    { title: 'useState и управление состоянием', estimatedMinutes: 50 },
    { title: 'useEffect и жизненный цикл', estimatedMinutes: 55 },
    { title: 'Формы и события', estimatedMinutes: 40 },
  ]

  const reactAdvLessons = [
    { title: 'Context API и useReducer', estimatedMinutes: 60 },
    { title: 'Кастомные хуки', estimatedMinutes: 45 },
    { title: 'React Router и навигация', estimatedMinutes: 50 },
  ]

  const projectLessons = [
    { title: 'Проектирование приложения', estimatedMinutes: 30 },
    { title: 'Реализация и код-ревью', estimatedMinutes: 120 },
  ]

  await createLessonsForCourse(payload, jsBasics.id, jsLessons)
  await createLessonsForCourse(payload, reactFundamentals.id, reactFundLessons)
  await createLessonsForCourse(payload, reactAdvanced.id, reactAdvLessons)
  await createLessonsForCourse(payload, reactProject.id, projectLessons)
  console.log('React roadmap created with courses and lessons')

  // 5. Роадмап: Backend Node.js
  const nodeRoadmap = await payload.create({
    collection: 'roadmaps',
    data: {
      title: 'Backend Node.js',
      slug: 'backend-nodejs',
      order: 2,
      isPublished: true,
    },
  })

  const nodeBasics = await createCourse(payload, {
    title: 'Основы Node.js',
    slug: 'node-basics',
    roadmapId: nodeRoadmap.id,
    order: 1,
    estimatedHours: 20,
  })

  const expressApi = await createCourse(payload, {
    title: 'Express / Fastify',
    slug: 'express-fastify',
    roadmapId: nodeRoadmap.id,
    order: 2,
    estimatedHours: 25,
    prerequisites: [nodeBasics.id],
  })

  const databases = await createCourse(payload, {
    title: 'Базы данных',
    slug: 'databases',
    roadmapId: nodeRoadmap.id,
    order: 3,
    estimatedHours: 20,
    prerequisites: [expressApi.id],
  })

  const deploy = await createCourse(payload, {
    title: 'Деплой и DevOps',
    slug: 'deploy-devops',
    roadmapId: nodeRoadmap.id,
    order: 4,
    estimatedHours: 10,
    prerequisites: [databases.id],
  })

  const nodeLessons = [
    { title: 'Введение в Node.js и npm', estimatedMinutes: 30 },
    { title: 'Модули и файловая система', estimatedMinutes: 40 },
    { title: 'Streams и буферы', estimatedMinutes: 50 },
    { title: 'Event Loop и асинхронность', estimatedMinutes: 60 },
    { title: 'Работа с HTTP', estimatedMinutes: 45 },
  ]

  const expressLessons = [
    { title: 'Express.js: роутинг и middleware', estimatedMinutes: 45 },
    { title: 'REST API и валидация', estimatedMinutes: 50 },
    { title: 'Fastify: основы и плагины', estimatedMinutes: 45 },
    { title: 'Аутентификация и JWT', estimatedMinutes: 60 },
  ]

  const dbLessons = [
    { title: 'PostgreSQL: основы SQL', estimatedMinutes: 60 },
    { title: 'ORM: Drizzle / Prisma', estimatedMinutes: 50 },
    { title: 'Redis и кеширование', estimatedMinutes: 40 },
  ]

  const deployLessons = [
    { title: 'Docker и контейнеризация', estimatedMinutes: 60 },
    { title: 'CI/CD и мониторинг', estimatedMinutes: 45 },
  ]

  await createLessonsForCourse(payload, nodeBasics.id, nodeLessons)
  await createLessonsForCourse(payload, expressApi.id, expressLessons)
  await createLessonsForCourse(payload, databases.id, dbLessons)
  await createLessonsForCourse(payload, deploy.id, deployLessons)
  console.log('Node.js roadmap created with courses and lessons')

  // 6. Достижения
  const achievementData = [
    {
      title: 'Первый шаг',
      description: 'Пройдите первый урок',
      criteriaType: 'lesson_count' as const,
      criteriaValue: 1,
      pointsReward: 5,
    },
    {
      title: 'Десятка',
      description: 'Пройдите 10 уроков',
      criteriaType: 'lesson_count' as const,
      criteriaValue: 10,
      pointsReward: 20,
    },
    {
      title: 'Марафонец',
      description: 'Пройдите 25 уроков',
      criteriaType: 'lesson_count' as const,
      criteriaValue: 25,
      pointsReward: 50,
    },
    {
      title: 'Курс пройден',
      description: 'Завершите любой курс',
      criteriaType: 'course_completion' as const,
      criteriaValue: 1,
      pointsReward: 30,
    },
    {
      title: 'Полный стек',
      description: 'Завершите 5 курсов',
      criteriaType: 'course_completion' as const,
      criteriaValue: 5,
      pointsReward: 100,
    },
    {
      title: 'Мастер пути',
      description: 'Завершите любой роадмап',
      criteriaType: 'roadmap_completion' as const,
      criteriaValue: 1,
      pointsReward: 150,
    },
    {
      title: 'Коллекционер баллов',
      description: 'Наберите 500 баллов',
      criteriaType: 'total_points' as const,
      criteriaValue: 500,
      pointsReward: 50,
    },
  ]

  for (const ach of achievementData) {
    await payload.create({
      collection: 'achievements',
      data: {
        ...ach,
        isActive: true,
      },
    })
  }
  console.log('Achievements created:', achievementData.length)

  console.log('Seeding complete!')
}

// --- Helpers ---

type CourseInput = {
  title: string
  slug: string
  roadmapId: string | number
  order: number
  estimatedHours: number
  prerequisites?: (string | number)[]
}

async function createCourse(payload: Payload, input: CourseInput) {
  return payload.create({
    collection: 'courses',
    data: {
      title: input.title,
      slug: input.slug,
      roadmap: input.roadmapId as unknown as number,
      order: input.order,
      estimatedHours: input.estimatedHours,
      isPublished: true,
      prerequisites: input.prerequisites as unknown as number[],
    },
  })
}

type LessonInput = {
  title: string
  estimatedMinutes: number
}

async function createLessonsForCourse(
  payload: Payload,
  courseId: string | number,
  lessons: LessonInput[],
) {
  for (let i = 0; i < lessons.length; i++) {
    const lesson = lessons[i]
    const slug = lesson.title
      .toLowerCase()
      .replace(/[^a-zA-Zа-яА-ЯёЁ0-9\s]/g, '')
      .replace(/\s+/g, '-')
      .replace(/^-+|-+$/g, '')

    await payload.create({
      collection: 'lessons',
      data: {
        title: lesson.title,
        slug: `${slug}-${Date.now()}-${i}`,
        course: courseId as unknown as number,
        order: i + 1,
        isPublished: true,
        estimatedMinutes: lesson.estimatedMinutes,
        content: [
          {
            blockType: 'text',
            // eslint-disable-next-line @typescript-eslint/no-explicit-any
            content: {
              root: {
                type: 'root',
                direction: 'ltr' as const,
                format: '' as const,
                indent: 0,
                version: 1,
                children: [
                  {
                    type: 'heading',
                    tag: 'h2',
                    version: 1,
                    children: [{ type: 'text', text: lesson.title, version: 1 }],
                  },
                  {
                    type: 'paragraph',
                    version: 1,
                    children: [
                      {
                        type: 'text',
                        version: 1,
                        text: `Содержимое урока "${lesson.title}". Здесь будет учебный материал, примеры кода и задания.`,
                      },
                    ],
                  },
                ],
              },
            },
          },
        ],
      },
    })
  }
}

export default seed
