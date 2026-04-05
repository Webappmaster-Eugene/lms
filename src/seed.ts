import type { Payload } from 'payload'
import {
  findOrCreateRoadmap,
  findOrCreateCourse,
  createSection,
  createLessonsForSection,
} from '@/lib/seed-helpers'

/**
 * Seed-скрипт: создаёт начальные данные для LMS.
 * Запуск: pnpm seed
 */
export const seed = async (payload: Payload) => {
  console.log('Seeding LMS database...')

  const adminEmail = process.env.ADMIN_EMAIL ?? 'admin@mentorcareer.ru'
  const adminPassword = process.env.ADMIN_PASSWORD ?? 'admin123'

  // 1. Создаём admin-пользователя (если ещё не существует)
  const { totalDocs: existingAdmins } = await payload.count({
    collection: 'users',
    where: { email: { equals: adminEmail } },
  })

  if (existingAdmins === 0) {
    await payload.create({
      collection: 'users',
      data: {
        email: adminEmail,
        password: adminPassword,
        firstName: 'Admin',
        lastName: 'MentorCareer',
        role: 'admin',
        isActive: true,
      },
      context: { skipHooks: true },
    })
    console.log('Admin user created:', adminEmail)
  } else {
    console.log('Admin user already exists:', adminEmail)
  }

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

  // 3. Настройки сайта (включая контакты и баллы тренажёра)
  await payload.updateGlobal({
    slug: 'site-settings',
    data: {
      platformName: 'MentorCareer LMS',
      platformDescription: 'Платформа обучения для менторской деятельности',
      points: {
        lessonCompleted: 10,
        courseCompleted: 50,
        roadmapCompleted: 200,
        trainerTaskCompleted: 10,
      },
      contacts: {
        telegramChannel: 'https://t.me/eugene_nadtocheev',
        telegramGroup: 'https://t.me/mentorcareer_chat',
        website: 'https://nadtocheev.ru',
        email: 'johnn.hotmail@mail.ru',
      },
    },
  })
  console.log('Site settings configured')

  // 4. Роадмап: Frontend React (idempotent — не упадёт при повторном запуске)
  const reactRoadmap = await findOrCreateRoadmap(payload, {
    title: 'Frontend React',
    slug: 'frontend-react',
    order: 1,
    miroEmbedUrl: 'https://miro.com/app/live-embed/uXjVJaQFRcw=/?embedMode=view_only_without_ui',
  })

  // Курсы React с секциями (idempotent)
  const jsBasics = await findOrCreateCourse(payload, {
    title: 'Основы JavaScript',
    slug: 'js-basics',
    roadmapId: reactRoadmap.id,
    order: 1,
    estimatedHours: 20,
  })

  // Создаём секции для курса JS
  const jsSection1 = await createSection(payload, { title: '1. Основы языка', courseId: jsBasics.id, order: 1 })
  const jsSection2 = await createSection(payload, { title: '2. Продвинутые концепции', courseId: jsBasics.id, order: 2 })

  const jsLessons1 = [
    { title: 'Переменные и типы данных', estimatedMinutes: 30 },
    { title: 'Функции и замыкания', estimatedMinutes: 45 },
    { title: 'Массивы и объекты', estimatedMinutes: 40 },
  ]
  const jsLessons2 = [
    { title: 'Асинхронность: Promise и async/await', estimatedMinutes: 60 },
    { title: 'ES6+ возможности', estimatedMinutes: 35 },
  ]
  await createLessonsForSection(payload, jsBasics.id, jsSection1.id, jsLessons1)
  await createLessonsForSection(payload, jsBasics.id, jsSection2.id, jsLessons2)

  const reactFundamentals = await findOrCreateCourse(payload, {
    title: 'React Fundamentals',
    slug: 'react-fundamentals',
    roadmapId: reactRoadmap.id,
    order: 2,
    estimatedHours: 25,
    prerequisites: [jsBasics.id],
  })

  const reactSection1 = await createSection(payload, { title: '1. Введение в React', courseId: reactFundamentals.id, order: 1 })
  const reactSection2 = await createSection(payload, { title: '2. Хуки и состояние', courseId: reactFundamentals.id, order: 2 })

  await createLessonsForSection(payload, reactFundamentals.id, reactSection1.id, [
    { title: 'Введение в React и JSX', estimatedMinutes: 30 },
    { title: 'Компоненты и пропсы', estimatedMinutes: 45 },
  ])
  await createLessonsForSection(payload, reactFundamentals.id, reactSection2.id, [
    { title: 'useState и управление состоянием', estimatedMinutes: 50 },
    { title: 'useEffect и жизненный цикл', estimatedMinutes: 55 },
    { title: 'Формы и события', estimatedMinutes: 40 },
  ])

  console.log('React roadmap created with courses, sections and lessons')

  // 5. Роадмап: Backend Node.js (idempotent)
  const nodeRoadmap = await findOrCreateRoadmap(payload, {
    title: 'Backend Node.js',
    slug: 'backend-nodejs',
    order: 2,
    miroEmbedUrl: 'https://miro.com/app/live-embed/uXjVJaQFRcw=/?embedMode=view_only_without_ui',
  })

  const nodeBasics = await findOrCreateCourse(payload, {
    title: 'Основы Node.js',
    slug: 'node-basics',
    roadmapId: nodeRoadmap.id,
    order: 1,
    estimatedHours: 20,
  })

  const nodeSection1 = await createSection(payload, { title: '1. Базовые концепции', courseId: nodeBasics.id, order: 1 })
  const nodeSection2 = await createSection(payload, { title: '2. Работа с сетью', courseId: nodeBasics.id, order: 2 })

  await createLessonsForSection(payload, nodeBasics.id, nodeSection1.id, [
    { title: 'Введение в Node.js и npm', estimatedMinutes: 30 },
    { title: 'Модули и файловая система', estimatedMinutes: 40 },
    { title: 'Event Loop и асинхронность', estimatedMinutes: 60 },
  ])
  await createLessonsForSection(payload, nodeBasics.id, nodeSection2.id, [
    { title: 'Streams и буферы', estimatedMinutes: 50 },
    { title: 'Работа с HTTP', estimatedMinutes: 45 },
  ])

  console.log('Node.js roadmap created with courses, sections and lessons')

  // 6. Достижения
  const achievementData = [
    { title: 'Первый шаг', description: 'Пройдите первый урок', criteriaType: 'lesson_count' as const, criteriaValue: 1, pointsReward: 5 },
    { title: 'Десятка', description: 'Пройдите 10 уроков', criteriaType: 'lesson_count' as const, criteriaValue: 10, pointsReward: 20 },
    { title: 'Марафонец', description: 'Пройдите 25 уроков', criteriaType: 'lesson_count' as const, criteriaValue: 25, pointsReward: 50 },
    { title: 'Курс пройден', description: 'Завершите любой курс', criteriaType: 'course_completion' as const, criteriaValue: 1, pointsReward: 30 },
    { title: 'Мастер пути', description: 'Завершите любой роадмап', criteriaType: 'roadmap_completion' as const, criteriaValue: 1, pointsReward: 150 },
    { title: 'Коллекционер баллов', description: 'Наберите 500 баллов', criteriaType: 'total_points' as const, criteriaValue: 500, pointsReward: 50 },
    { title: 'Первая задача', description: 'Решите первую задачу тренажёра', criteriaType: 'trainer_task_count' as const, criteriaValue: 1, pointsReward: 10 },
    { title: 'Практик', description: 'Решите 10 задач тренажёра', criteriaType: 'trainer_task_count' as const, criteriaValue: 10, pointsReward: 30 },
  ]

  for (const ach of achievementData) {
    await payload.create({ collection: 'achievements', data: { ...ach, isActive: true } })
  }
  console.log('Achievements created:', achievementData.length)

  // 7. Тренажёр: темы и задачи
  const topicVariables = await payload.create({
    collection: 'trainer-topics',
    data: { title: 'Переменные и типы данных', slug: 'variables', order: 1, isPublished: true, description: 'Основы работы с переменными в JavaScript' },
  })

  const topicFunctions = await payload.create({
    collection: 'trainer-topics',
    data: { title: 'Функции', slug: 'functions', order: 2, isPublished: true, description: 'Функции, замыкания и области видимости' },
  })

  const topicArrays = await payload.create({
    collection: 'trainer-topics',
    data: { title: 'Массивы и объекты', slug: 'arrays-objects', order: 3, isPublished: true, description: 'Работа с массивами, объектами и их методами' },
  })

  // Задачи: Переменные
  const variableTasks = [
    {
      title: 'Объявление переменных',
      slug: 'declare-variables',
      difficulty: 'easy' as const,
      starterCode: '// Объявите три переменные: name (строка), age (число), isStudent (булево)\n// Выведите их в консоль\n\n',
      expectedOutput: 'Иван\n25\ntrue',
      hints: [{ hint: 'Используйте let, const для объявления переменных' }, { hint: 'console.log() для вывода' }],
    },
    {
      title: 'Конкатенация строк',
      slug: 'string-concat',
      difficulty: 'easy' as const,
      starterCode: '// Создайте переменные firstName и lastName\n// Выведите полное имя через шаблонную строку\n\nconst firstName = "Иван"\nconst lastName = "Петров"\n\n// Ваш код здесь\n',
      expectedOutput: 'Иван Петров',
      hints: [{ hint: 'Используйте template literals: `${firstName} ${lastName}`' }],
    },
    {
      title: 'Тип данных',
      slug: 'typeof-check',
      difficulty: 'easy' as const,
      starterCode: '// Выведите тип каждого значения:\nconst a = 42\nconst b = "hello"\nconst c = true\nconst d = null\nconst e = undefined\n\n// Ваш код здесь\n',
      expectedOutput: 'number\nstring\nboolean\nobject\nundefined',
      hints: [{ hint: 'Используйте typeof для каждой переменной' }],
    },
  ]

  for (const task of variableTasks) {
    await payload.create({
      collection: 'trainer-tasks',
      data: {
        ...task,
        topic: topicVariables.id,
        order: variableTasks.indexOf(task) + 1,
        isPublished: true,
        pointsReward: 10,
        description: makeRichText(task.title),
      },
    })
  }

  // Задачи: Функции
  const functionTasks = [
    {
      title: 'Функция суммы',
      slug: 'sum-function',
      difficulty: 'easy' as const,
      starterCode: '// Напишите функцию sum, которая принимает два числа и возвращает их сумму\n\n// Ваш код здесь\n\nconsole.log(sum(2, 3))\nconsole.log(sum(-1, 1))\nconsole.log(sum(0, 0))\n',
      expectedOutput: '5\n0\n0',
      hints: [{ hint: 'function sum(a, b) { return a + b }' }],
    },
    {
      title: 'Стрелочная функция',
      slug: 'arrow-function',
      difficulty: 'easy' as const,
      starterCode: '// Перепишите функцию greet как стрелочную\n// Она должна принимать имя и возвращать приветствие\n\n// Ваш код здесь\n\nconsole.log(greet("Мир"))\nconsole.log(greet("JavaScript"))\n',
      expectedOutput: 'Привет, Мир!\nПривет, JavaScript!',
      hints: [{ hint: 'const greet = (name) => `Привет, ${name}!`' }],
    },
    {
      title: 'Замыкание - счётчик',
      slug: 'closure-counter',
      difficulty: 'medium' as const,
      starterCode: '// Напишите функцию createCounter, которая возвращает объект\n// с методами increment() и getCount()\n\n// Ваш код здесь\n\nconst counter = createCounter()\ncounter.increment()\ncounter.increment()\ncounter.increment()\nconsole.log(counter.getCount())\n',
      expectedOutput: '3',
      hints: [{ hint: 'Используйте замыкание: внутренняя переменная count' }],
    },
  ]

  for (const task of functionTasks) {
    await payload.create({
      collection: 'trainer-tasks',
      data: {
        ...task,
        topic: topicFunctions.id,
        order: functionTasks.indexOf(task) + 1,
        isPublished: true,
        pointsReward: 10,
        description: makeRichText(task.title),
      },
    })
  }

  // Задачи: Массивы
  const arrayTasks = [
    {
      title: 'Сумма массива',
      slug: 'array-sum',
      difficulty: 'easy' as const,
      starterCode: '// Напишите функцию sumArray, которая возвращает сумму всех элементов массива\n\n// Ваш код здесь\n\nconsole.log(sumArray([1, 2, 3, 4, 5]))\nconsole.log(sumArray([10, -5, 3]))\nconsole.log(sumArray([]))\n',
      expectedOutput: '15\n8\n0',
      hints: [{ hint: 'Используйте метод reduce()' }],
    },
    {
      title: 'Фильтрация чётных',
      slug: 'filter-even',
      difficulty: 'easy' as const,
      starterCode: '// Напишите функцию filterEven, которая возвращает только чётные числа\n\n// Ваш код здесь\n\nconsole.log(JSON.stringify(filterEven([1, 2, 3, 4, 5, 6])))\nconsole.log(JSON.stringify(filterEven([7, 8, 9])))\n',
      expectedOutput: '[2,4,6]\n[8]',
      hints: [{ hint: 'Используйте filter() и оператор % (остаток от деления)' }],
    },
    {
      title: 'Развернуть строку',
      slug: 'reverse-string',
      difficulty: 'medium' as const,
      starterCode: '// Напишите функцию reverseString без использования метода reverse()\n\n// Ваш код здесь\n\nconsole.log(reverseString("hello"))\nconsole.log(reverseString("JavaScript"))\nconsole.log(reverseString(""))\n',
      expectedOutput: 'olleh\ntpircSavaJ\n',
      hints: [{ hint: 'Можно использовать цикл for с конца строки или split + reduce' }],
    },
  ]

  for (const task of arrayTasks) {
    await payload.create({
      collection: 'trainer-tasks',
      data: {
        ...task,
        topic: topicArrays.id,
        order: arrayTasks.indexOf(task) + 1,
        isPublished: true,
        pointsReward: 10,
        description: makeRichText(task.title),
      },
    })
  }

  console.log('Trainer topics and tasks created')

  // 8. FAQ
  const faqData = [
    { question: 'Как начать обучение?', answer: 'Выберите роадмап или курс в меню и начните с первого урока. Прогресс сохраняется автоматически.' },
    { question: 'Как отмечать уроки пройденными?', answer: 'На странице урока нажмите кнопку "Отметить как пройденный". Это начислит вам 10 баллов опыта.' },
    { question: 'Что такое тренажёр кода?', answer: 'Тренажёр — это раздел с практическими задачами по JavaScript. Вы пишете код и проверяете его прямо на платформе.' },
    { question: 'Как работает лидерборд?', answer: 'За каждый пройденный урок начисляется 10 XP, за курс — бонус 50 XP, за роадмап — 200 XP. Чем больше баллов, тем выше вы в рейтинге.' },
    { question: 'Можно ли скачать видео?', answer: 'Видео можно смотреть только на платформе. Под каждым видео есть ссылка на Яндекс.Диск, откуда можно скачать оригинал.' },
    { question: 'Как связаться с администратором?', answer: 'Используйте форму обратной связи на странице "Помощь" или напишите на контактный email.' },
  ]

  for (let i = 0; i < faqData.length; i++) {
    await payload.create({
      collection: 'faq-items',
      data: {
        question: faqData[i].question,
        answer: {
          root: {
            type: 'root',
            direction: 'ltr' as const,
            format: '' as const,
            indent: 0,
            version: 1,
            children: [
              { type: 'paragraph', version: 1, children: [{ type: 'text', version: 1, text: faqData[i].answer }] },
            ],
          },
        },
        order: i + 1,
        isPublished: true,
      },
    })
  }
  console.log('FAQ items created:', faqData.length)

  console.log('Seeding complete!')
}

// --- Helpers ---

function makeRichText(text: string) {
  return {
    root: {
      type: 'root',
      direction: 'ltr' as const,
      format: '' as const,
      indent: 0,
      version: 1,
      children: [
        { type: 'paragraph', version: 1, children: [{ type: 'text', version: 1, text }] },
      ],
    },
  }
}

export default seed
