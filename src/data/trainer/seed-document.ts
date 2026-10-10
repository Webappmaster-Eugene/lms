import type { TrainerTask } from '@/payload-types'
import { POINTS_BY_DIFFICULTY, toCaseSpecs, type TrainerTaskSeed } from './types'

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

export function buildTaskData(
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
    starterCodePython: task.starterCodePython ?? null,
    starterCodeGo: task.starterCodeGo ?? null,
    starterFiles: task.starterFiles ?? null,
    solutionFiles: task.solutionFiles ?? null,
    solutionCodePython: task.solutionCodePython ?? null,
    solutionCodeGo: task.solutionCodeGo ?? null,
    runtimeCases: task.runtimeCases ?? [],
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
    interviewFormat: task.interviewFormat ?? null,
    recommendedMinutes: task.recommendedMinutes ?? null,
    companyEvidence: task.companyEvidence ?? [],
    sourceUrl: task.sourceUrl ?? null,
    leetcodeNumber: task.leetcodeNumber ?? null,
    pointsReward: task.pointsReward ?? POINTS_BY_DIFFICULTY[task.difficulty],
    isPublished: true,
  }
}
