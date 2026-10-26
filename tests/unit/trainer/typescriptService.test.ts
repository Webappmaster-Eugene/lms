import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'

import type { TrainerDiagnostic } from '@/lib/trainer/types'

/**
 * Компилятор TypeScript получает текст решения ученика. Его хост обязан
 * отдавать только сам файл решения и lib.*.d.ts: ссылки и импорты не должны
 * подтягивать в программу реальные файлы сервера.
 */

type Compile = (input: { code: string; checkTypes: boolean; setupCode?: string }) => { js: string; diagnostics: (TrainerDiagnostic & { inHarness: boolean })[] }
let compile: Compile

const SERVER_FILE = fileURLToPath(new URL('../../../src/lib/trainer/constants.ts', import.meta.url))

beforeAll(async () => {
  compile = ((await import('@/server/trainer/typescript-service.mjs')) as { compile: Compile }).compile
  // Первый разбор lib.*.d.ts занимает секунды — он не должен съедать бюджет теста.
  compile({ code: 'const warmUp: number = 1\n', checkTypes: true })
}, 60_000)

describe('typescript-service: граница файловой системы', { timeout: 20_000 }, () => {
  it('/// <reference path> на файл сервера не подключает его объявления', () => {
    const { diagnostics } = compile({ code: `/// <reference path="${SERVER_FILE}" />\nconst limit: number = TRAINER_LIMITS.maxCodeLength\n`, checkTypes: true })
    expect(diagnostics).toEqual([expect.objectContaining({ code: 2304, line: 2, category: 'error', message: "Cannot find name 'TRAINER_LIMITS'." })])
  })

  it('импорт реального модуля сервера или пакета Node не разрешается', () => {
    const modulePath = SERVER_FILE.replace(/\.ts$/, '')
    const { diagnostics } = compile({ code: `import { TRAINER_LIMITS } from '${modulePath}'\nimport fs from 'node:fs'\nexport const n: number = TRAINER_LIMITS.maxCodeLength + fs.constants.F_OK\n`, checkTypes: true })
    expect(diagnostics.map((item) => [item.code, item.line])).toEqual([[2307, 1], [2307, 2]])
  })

  it('глобальные объекты Node решению не видны даже через reference types', () => {
    const { diagnostics } = compile({ code: '/// <reference types="node" />\nconst secret = process.env.PAYLOAD_SECRET\n', checkTypes: true })
    expect(diagnostics).toEqual([expect.objectContaining({ code: 2580, line: 2 })])
  })

  it('без проверки типов только транспилирует, диагностик нет', () => {
    const result = compile({ code: 'const value: number = "строка"\n', checkTypes: false })
    expect(result).toEqual({ js: '"use strict";\nconst value = "строка";\n', diagnostics: [] })
  })
})
