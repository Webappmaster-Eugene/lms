import { afterAll, describe, expect, it } from 'vitest'

import { practical } from '@/data/trainer/18-practical'
import { toCaseSpecs } from '@/data/trainer/types'
import { runSolution } from '@/server/trainer/sandbox'
import { getRunnerPool } from '@/server/trainer/pool'

afterAll(() => getRunnerPool().dispose())

describe('прикладные задачи в серверном изоляте', () => {
  it.each(['collect-api-pages', 'latest-request-wins', 'ts-event-payload-map', 'ts-deep-patch'])(
    '%s: сервер проверяет эталон и отклоняет стартовый шаблон',
    async (slug) => {
      const task = practical.tasks.find(task => task.slug === slug)
      if (!task) throw new Error(`Задача ${slug} отсутствует`)
      const document = { ...task, testCases: toCaseSpecs(task.cases), timeLimitMs: 10000 }
      const language = task.languages[0]
      const solution = language === 'ts' ? task.solutionCodeTs : task.solutionCode
      const starter = language === 'ts' ? task.starterCodeTs : task.starterCode
      if (!solution || !starter) throw new Error('Отсутствует код для объявленного языка')
      const good = await runSolution(document, language, solution)
      expect(good.status, JSON.stringify(good)).toBe('passed')
      expect(good.totalCount).toBeGreaterThan(0)
      const bad = await runSolution(document, language, starter)
      expect(bad.status).not.toBe('passed')
    },
    60000,
  )
})
