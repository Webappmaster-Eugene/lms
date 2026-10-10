import { afterAll, describe, expect, it } from 'vitest'

import { TRAINER_CATALOG } from '@/data/trainer'
import { flattenCatalog, toCaseSpecs } from '@/data/trainer/types'
import { runSolution } from '@/server/trainer/sandbox'
import { getRunnerPool } from '@/server/trainer/pool'

const entries = flattenCatalog(TRAINER_CATALOG).filter(({ task }) => task.checkMode !== 'program' && task.checkMode !== 'dom')

afterAll(() => getRunnerPool().dispose())

describe('весь каталог в настоящем серверном процессе', () => {
  for (const { topic, task } of entries) {
    for (const language of task.languages) {
      it(`${topic.slug}/${task.slug}: ${language}, эталон и незавершённое решение`, async () => {
        const document = { ...task, testCases: toCaseSpecs(task.cases) }
        const solution = language === 'ts' ? (task.solutionCodeTs ?? task.solutionCode) : task.solutionCode
        const starter = task.wrongSolution ?? (language === 'ts' ? (task.starterCodeTs ?? task.starterCode) : task.starterCode)
        const good = await runSolution(document, language, solution)
        expect(good.status, JSON.stringify(good)).toBe('passed')
        expect(good.totalCount).toBeGreaterThan(0)
        const bad = await runSolution(document, language, starter)
        expect(bad.status, 'Незавершённое решение не должно получать зачёт').not.toBe('passed')
      }, 60000)
    }
  }
})
