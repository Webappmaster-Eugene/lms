/**
 * Заливка каталога задач тренажёра в БД.
 *
 * Запуск: pnpm seed:trainer
 *
 * Идемпотентен: темы и задачи ищутся по slug и обновляются, а не дублируются.
 * Прогресс пользователей не трогается — задачи находятся по тому же slug, id
 * не меняются.
 *
 * Каталог — источник правды. Всё, что отредактировали в админке у задачи из
 * каталога, при следующем прогоне будет перезаписано.
 */

import { getPayload } from 'payload'
import config from '@payload-config'
import type { Payload } from 'payload'

import { TRAINER_CATALOG } from '@/data/trainer'
import { POINTS_BY_DIFFICULTY, toCaseSpecs } from '@/data/trainer/types'
import type { TrainerTaskSeed, TrainerTopicSeed } from '@/data/trainer/types'
import type { TrainerTask } from '@/payload-types'
import { relationId } from '@/lib/relation-id'

/**
 * Абзац-заглушка для устаревшего richText-поля.
 *
 * Собирается вручную, а не через stringToLexicalState: тот отдаёт замороженную
 * структуру с readonly-массивами, а сгенерированный тип Payload требует
 * изменяемые.
 */
function makeRichText(text: string): TrainerTask['description'] {
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

/** Данные задачи в форме, которую принимает payload.create/update. */
type TrainerTaskData = Omit<TrainerTask, 'id' | 'createdAt' | 'updatedAt'>

function buildTaskData(
  task: TrainerTaskSeed,
  topicId: number,
  order: number,
): TrainerTaskData {
  const cases = toCaseSpecs(task.cases)

  return {
    title: task.title,
    slug: task.slug,
    topic: topicId,
    order,
    difficulty: task.difficulty,
    checkMode: task.checkMode,
    languages: task.languages,
    // Lexical-поле оставлено для обратной совместимости: заполняем заголовком,
    // чтобы старая админка не показывала пустоту, а условие живёт в Markdown.
    description: makeRichText(task.title),
    descriptionMd: task.descriptionMd,
    entryName: task.entryName ?? null,
    setupCode: task.setupCode ?? null,
    setupTypes: task.setupTypes ?? null,
    starterCode: task.starterCode,
    starterCodeTs: task.starterCodeTs ?? null,
    solutionCode: task.solutionCode,
    solutionCodeTs: task.solutionCodeTs ?? null,
    solutionNotes: task.solutionNotes ?? null,
    testCode: task.testCode ?? null,
    testCases: cases.map((item) => ({
      name: item.name,
      argsCode: item.argsCode,
      expectedCode: item.expectedCode,
      compare: item.compare,
      hidden: item.hidden,
    })),
    typeHarness: task.typeHarness ?? null,
    expectedOutput: task.expectedOutput ?? null,
    timeLimitMs: task.timeLimitMs ?? 5000,
    hints: (task.hints ?? []).map((hint) => ({ hint })),
    tags: task.tags ?? [],
    companies: task.companies ?? [],
    sourceUrl: task.sourceUrl ?? null,
    leetcodeNumber: task.leetcodeNumber ?? null,
    pointsReward: task.pointsReward ?? POINTS_BY_DIFFICULTY[task.difficulty],
    isPublished: true,
  }
}

async function upsertTopic(payload: Payload, topic: TrainerTopicSeed): Promise<number> {
  const existing = await payload.find({
    collection: 'trainer-topics',
    where: { slug: { equals: topic.slug } },
    limit: 1,
    overrideAccess: true,
  })

  const data = {
    title: topic.title,
    slug: topic.slug,
    description: topic.description,
    category: topic.category,
    icon: topic.icon ?? null,
    order: topic.order,
    isPublished: true,
  }

  if (existing.docs.length > 0) {
    const updated = await payload.update({
      collection: 'trainer-topics',
      id: existing.docs[0].id,
      data,
      overrideAccess: true,
    })
    return relationId(updated.id)
  }

  const created = await payload.create({
    collection: 'trainer-topics',
    data,
    overrideAccess: true,
  })
  return relationId(created.id)
}

async function upsertTask(
  payload: Payload,
  task: TrainerTaskSeed,
  topicId: number,
  order: number,
): Promise<'created' | 'updated'> {
  const data = buildTaskData(task, topicId, order)

  const existing = await payload.find({
    collection: 'trainer-tasks',
    where: { slug: { equals: task.slug } },
    limit: 1,
    overrideAccess: true,
  })

  if (existing.docs.length > 0) {
    await payload.update({
      collection: 'trainer-tasks',
      id: existing.docs[0].id,
      data,
      overrideAccess: true,
    })
    return 'updated'
  }

  await payload.create({ collection: 'trainer-tasks', data, overrideAccess: true })
  return 'created'
}

export async function seedTrainer(payload: Payload): Promise<void> {
  let created = 0
  let updated = 0

  for (const topic of TRAINER_CATALOG) {
    const topicId = await upsertTopic(payload, topic)

    for (const [index, task] of topic.tasks.entries()) {
      const outcome = await upsertTask(payload, task, topicId, index + 1)
      if (outcome === 'created') created += 1
      else updated += 1
    }

    console.log(`  ${topic.title}: ${topic.tasks.length} задач`)
  }

  console.log(`\nГотово. Создано: ${created}, обновлено: ${updated}.`)

  // Задачи, которых больше нет в каталоге, не удаляем: на них может висеть
  // прогресс пользователей. Вместо этого сообщаем о расхождении.
  const catalogSlugs = new Set(TRAINER_CATALOG.flatMap((topic) => topic.tasks.map((t) => t.slug)))
  const all = await payload.find({
    collection: 'trainer-tasks',
    limit: 1000,
    overrideAccess: true,
    select: { slug: true, title: true },
  })
  const orphans = all.docs.filter((doc) => !catalogSlugs.has(doc.slug))
  if (orphans.length > 0) {
    console.log(`\nВ базе есть ${orphans.length} задач вне каталога (оставлены как есть):`)
    for (const orphan of orphans) console.log(`  - ${orphan.slug} (${orphan.title})`)
  }
}

const payload = await getPayload({ config })
console.log('Заливаем каталог тренажёра…\n')
await seedTrainer(payload)
process.exit(0)
