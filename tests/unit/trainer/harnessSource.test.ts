import { readFileSync } from 'node:fs'
import path from 'node:path'
import { describe, expect, it } from 'vitest'

import { HARNESS_LINE_COUNT, HARNESS_SOURCE } from '@/lib/trainer/harness-source.generated'

/**
 * Сгенерированный модуль харнесса обязан совпадать с исходником.
 *
 * Если кто-то поправит harness.js и забудет запустить сборку, в песочницу
 * поедет старая версия — а расхождение проявится странным поведением тестов,
 * а не внятной ошибкой. Этот тест ловит расхождение сразу.
 */

const root = path.resolve(__dirname, '../../..')

describe('сгенерированный харнесс', () => {
  const source = readFileSync(path.join(root, 'src/lib/trainer/harness.js'), 'utf8')

  it('совпадает с исходником harness.js', () => {
    expect(
      HARNESS_SOURCE,
      'Запустите: node scripts/build-harness.mjs',
    ).toBe(source)
  })

  it('число строк посчитано верно', () => {
    expect(HARNESS_LINE_COUNT).toBe(source.split('\n').length)
  })

  it('не содержит импортов и обращений к Node API', () => {
    expect(HARNESS_SOURCE).not.toMatch(/^\s*import\s/m)
    expect(HARNESS_SOURCE).not.toMatch(/\brequire\s*\(/)
    expect(HARNESS_SOURCE).not.toMatch(/\bprocess\./)
  })

  it('не содержит артефактов транспиляции', () => {
    // Харнесс вшивается строкой и не должен ссылаться на хелперы сборщика.
    for (const helper of ['__awaiter', '_asyncToGenerator', '_regeneratorRuntime', 'tslib']) {
      expect(HARNESS_SOURCE).not.toContain(helper)
    }
  })
})
