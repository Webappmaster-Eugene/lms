import { describe, expect, it } from 'vitest'

import { buildExecSpec } from '@/lib/trainer/spec'
import { runInNodeVm } from '../../helpers/trainer-sandbox'

/**
 * Легаси-режим сравнения вывода.
 *
 * В каталоге таких задач нет, но девять учебных задач из первого сида живут в
 * базе именно в этом режиме. Проверка гарантирует, что переход на новый движок
 * их не сломал.
 */

const task = {
  slug: 'legacy-stdout',
  checkMode: 'stdout',
  languages: ['js'],
  starterCode: '// Ваш код здесь\n',
  expectedOutput: 'Иван\n25\ntrue',
}

describe('режим сравнения вывода', () => {
  it('совпадающий вывод засчитывается', async () => {
    const result = await runInNodeVm(
      buildExecSpec(task, 'js', `console.log('Иван')\nconsole.log(25)\nconsole.log(true)`),
    )

    expect(result.status).toBe('passed')
    expect(result.consoleOutput).toEqual(['Иван', '25', 'true'])
  })

  it('лишние пробелы и пустые строки по краям не мешают', async () => {
    const result = await runInNodeVm(
      buildExecSpec(task, 'js', `console.log('')\nconsole.log('Иван  ')\nconsole.log(25)\nconsole.log(true)\nconsole.log('')`),
    )

    expect(result.status).toBe('passed')
  })

  it('несовпадающий вывод не засчитывается', async () => {
    const result = await runInNodeVm(
      buildExecSpec(task, 'js', `console.log('Пётр')\nconsole.log(25)\nconsole.log(true)`),
    )

    expect(result.status).toBe('failed')
    expect(result.tests[0].expected).toContain('Иван')
    expect(result.tests[0].actual).toContain('Пётр')
  })

  it('пустой вывод не засчитывается', async () => {
    const result = await runInNodeVm(buildExecSpec(task, 'js', '// ничего не вывели'))

    expect(result.status).toBe('failed')
  })

  it('исключение в решении не засчитывается', async () => {
    const result = await runInNodeVm(buildExecSpec(task, 'js', 'null.x'))

    expect(result.status).not.toBe('passed')
  })

  it('порядок строк важен', async () => {
    const result = await runInNodeVm(
      buildExecSpec(task, 'js', `console.log(25)\nconsole.log('Иван')\nconsole.log(true)`),
    )

    expect(result.status).toBe('failed')
  })
})
