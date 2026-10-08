/**
 * Детерминированный сид для e2e и скриншотных тестов.
 *
 * Запускается из global-setup Playwright командой
 *   PAYLOAD_MIGRATING=true payload run tests/e2e/fixtures/seed-e2e.ts
 * против одноразовой базы lms_e2e. PAYLOAD_MIGRATING не даёт `payload run`
 * сделать dev-push схемы и записать строку `dev` в payload_migrations — иначе
 * `next start` в production-режиме остановился бы на интерактивном вопросе.
 *
 * Узлы роадмапа создаются здесь же: onInit засидил бы на пустой таблице
 * `roadmap-nodes` два больших роадмапа с заглушками, и содержимое страниц
 * перестало бы быть фиксированным. Автосид отдельно проверяют интеграционные тесты.
 */
import { getPayload } from 'payload'
import config from '@payload-config'

import { CONTENT, SUM_SOLUTION, USERS } from './data'

function richText(...paragraphs: string[]) {
  return {
    root: {
      type: 'root',
      direction: 'ltr' as const,
      format: '' as const,
      indent: 0,
      version: 1,
      children: paragraphs.map((text) => ({
        type: 'paragraph',
        version: 1,
        direction: 'ltr' as const,
        format: '' as const,
        indent: 0,
        children: [{ type: 'text', version: 1, text, detail: 0, format: 0, mode: 'normal', style: '' }],
      })),
    },
  }
}

// onInit выключен: иначе на пустой roadmap-nodes он засидит свои роадмапы раньше наших узлов.
const payload = await getPayload({ config, disableOnInit: true })

const already = await payload.count({ collection: 'users', where: { email: { equals: USERS.admin.email } } })
if (already.totalDocs > 0) {
  process.stdout.write('e2e-сид уже применён — пропускаю\n')
  process.exit(0)
}

const created: Record<keyof typeof USERS, number> = { admin: 0, student: 0, leader: 0, doer: 0 }
for (const [key, u] of Object.entries(USERS) as [keyof typeof USERS, (typeof USERS)[keyof typeof USERS]][]) {
  const doc = await payload.create({
    collection: 'users',
    data: { ...u, role: key === 'admin' ? 'admin' : 'student', learningAccessMode: 'all', isActive: true },
    context: { skipHooks: true },
  })
  created[key] = doc.id
}

await payload.updateGlobal({
  slug: 'site-settings',
  data: {
    platformName: 'MentorCareer LMS',
    platformDescription: 'Платформа обучения MentorCareer',
    points: { lessonCompleted: 10, courseCompleted: 50, roadmapCompleted: 200, trainerTaskCompleted: 10 },
    contacts: {
      telegramChannel: 'https://t.me/e2e_channel',
      telegramGroup: 'https://t.me/e2e_group',
      website: 'https://promo.mentorcareer.ru',
      email: 'support@lms.test',
    },
  },
})

const roadmap = await payload.create({
  collection: 'roadmaps',
  data: {
    title: CONTENT.roadmap.title,
    slug: CONTENT.roadmap.slug,
    order: 1,
    isPublished: true,
    description: richText('Путь от первой HTML-страницы до уверенного фронтенда.'),
  },
})

const course = await payload.create({
  collection: 'courses',
  data: {
    title: CONTENT.course.title,
    slug: CONTENT.course.slug,
    roadmap: roadmap.id,
    order: 1,
    isPublished: true,
    estimatedHours: 3,
    description: richText('Базовый курс: разметка, стили и первый скрипт.'),
  },
})

const section = await payload.create({
  collection: 'sections',
  data: { title: CONTENT.section.title, slug: CONTENT.section.slug, course: course.id, order: 1, isPublished: true },
})

for (const [index, lesson] of CONTENT.lessons.entries()) {
  await payload.create({
    collection: 'lessons',
    data: {
      title: lesson.title,
      slug: lesson.slug,
      course: course.id,
      section: section.id,
      order: index + 1,
      isPublished: true,
      estimatedMinutes: 15 + index * 5,
      description: `Урок ${index + 1} курса «${CONTENT.course.title}».`,
      content: [
        {
          blockType: 'text',
          content: richText(
            `${lesson.title}: ключевые понятия урока.`,
            'Прочитайте материал и отметьте урок пройденным.',
          ),
        },
      ],
    },
  })
}

await payload.create({
  collection: 'lessons',
  data: {
    title: CONTENT.draftLesson.title,
    slug: CONTENT.draftLesson.slug,
    course: course.id,
    section: section.id,
    order: 99,
    isPublished: false,
  },
})

const startNode = await payload.create({
  collection: 'roadmap-nodes',
  data: {
    nodeId: 'e2e-start', label: 'Старт', nodeType: 'category', roadmap: roadmap.id,
    positionX: 0, positionY: 0, order: 0, stage: 'start', color: 'pink', icon: 'rocket',
  },
})
const htmlNode = await payload.create({
  collection: 'roadmap-nodes',
  data: {
    nodeId: 'e2e-web', label: 'Веб-основы', nodeType: 'topic', roadmap: roadmap.id, course: course.id,
    positionX: 0, positionY: 200, order: 1, stage: 'base', color: 'yellow', icon: 'globe',
    description: 'HTML, CSS и JavaScript', bullets: [{ text: 'HTML' }, { text: 'CSS' }, { text: 'JavaScript' }],
  },
})
await payload.update({ collection: 'courses', id: course.id, data: { roadmapNode: htmlNode.id } })
await payload.create({
  collection: 'roadmap-edges',
  data: { edgeId: 'e2e-edge-1', roadmap: roadmap.id, source: startNode.id, target: htmlNode.id },
})

const topic = await payload.create({
  collection: 'trainer-topics',
  data: {
    title: CONTENT.topic.title, slug: CONTENT.topic.slug, category: 'javascript', order: 1,
    isPublished: true, description: 'Функции и возвращаемые значения', icon: 'braces',
  },
})

await payload.create({
  collection: 'trainer-tasks',
  data: {
    title: CONTENT.task.title,
    slug: CONTENT.task.slug,
    topic: topic.id,
    order: 1,
    difficulty: 'easy',
    checkMode: 'unit',
    languages: ['js', 'ts'],
    entryName: 'sum',
    descriptionMd: 'Напишите функцию `sum(a, b)`, которая возвращает сумму двух чисел.',
    starterCode: 'function sum(a, b) {\n  // ваш код\n}\n',
    starterCodeTs: 'function sum(a: number, b: number): number {\n  // ваш код\n  return 0\n}\n',
    solutionCode: SUM_SOLUTION,
    solutionCodeTs: 'function sum(a: number, b: number): number {\n  return a + b\n}\n',
    solutionNotes: 'Достаточно оператора `+`.',
    testCases: [
      { name: 'положительные числа', argsCode: '2, 3', expectedCode: '5', compare: 'deep', hidden: false },
      { name: 'ноль', argsCode: '0, 0', expectedCode: '0', compare: 'deep', hidden: false },
      { name: 'отрицательные', argsCode: '-4, 4', expectedCode: '0', compare: 'deep', hidden: true },
    ],
    hints: [{ hint: 'Верните a + b.' }],
    tags: ['hof'],
    timeLimitMs: 3000,
    pointsReward: 10,
    isPublished: true,
  },
})

for (const [index, item] of CONTENT.faq.entries()) {
  await payload.create({
    collection: 'faq-items',
    data: { question: item.question, answer: richText(item.answer), order: index + 1, isPublished: true },
  })
}

await payload.create({
  collection: 'achievements',
  data: {
    title: 'Первый шаг', description: 'Пройдите первый урок', criteriaType: 'lesson_count',
    criteriaValue: 1, pointsReward: 5, isActive: true,
  },
})

// Лидер рейтинга: баллы через штатную транзакцию, totalPoints — их сумма.
await payload.create({
  collection: 'points-transactions',
  data: { user: created.leader, amount: 120, reason: 'admin_adjustment', description: 'Стартовые баллы e2e' },
  context: { skipHooks: true },
})
await payload.update({ collection: 'users', id: created.leader, data: { totalPoints: 120 }, context: { skipHooks: true } })

process.stdout.write('e2e-сид применён\n')
process.exit(0)
