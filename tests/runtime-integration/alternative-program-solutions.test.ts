import { randomInt, randomUUID } from 'node:crypto'
import { readFile } from 'node:fs/promises'
import { fileURLToPath } from 'node:url'
import { beforeAll, describe, expect, it } from 'vitest'

import { TRAINER_CATALOG } from '@/data/trainer'
import { flattenCatalog, type TrainerTaskSeed } from '@/data/trainer/types'
import { runtimeCases, type RuntimeCase } from '@/lib/trainer/runtime-spec'
import { runSolution } from '@/server/trainer/sandbox'

const tasks = flattenCatalog(TRAINER_CATALOG)
  .map(({ task }) => task)
  .filter(task => task.checkMode === 'program')

function taskBySlug(slug: string): TrainerTaskSeed {
  const task = tasks.find(candidate => candidate.slug === slug)
  if (!task) throw new Error(`Отсутствует задача ${slug}`)
  return task
}

function fixturePath(slug: string, language: 'go' | 'python'): string {
  return fileURLToPath(new URL(`./alternative-program-solutions/${slug}.${language === 'go' ? 'go' : 'py'}`, import.meta.url))
}

function extraCase(name: string, input: unknown, expected: unknown): RuntimeCase {
  return { name, input: JSON.stringify(input), expected: JSON.stringify(expected), hidden: true }
}

beforeAll(() => {
  if (!process.env.TRAINER_RUNTIME_URL || !process.env.TRAINER_RUNTIME_TOKEN) {
    throw new Error('Нужен настоящий gateway: pnpm test:integration:runtime tests/runtime-integration/alternative-program-solutions.test.ts')
  }
})

describe('независимые решения программ через серверный runSolution → HTTP → Docker', () => {
  it('покрывает все 9 Go и 9 Python задач, включая прежние Go-задачи', () => {
    expect(tasks.filter(task => task.languages.includes('go'))).toHaveLength(9)
    expect(tasks.filter(task => task.languages.includes('python'))).toHaveLength(9)
    expect(tasks).toHaveLength(18)
  })

  for (const task of tasks) {
    const language = task.languages.includes('go') ? 'go' : 'python'
    it(`${task.slug}: другой алгоритм проходит все открытые и скрытые кейсы`, async () => {
      const code = await readFile(fixturePath(task.slug, language), 'utf8')
      expect(code).not.toBe(language === 'go' ? task.solutionCodeGo : task.solutionCodePython)
      const result = await runSolution(task, language, code)
      expect(result.status, JSON.stringify(result)).toBe('passed')
      expect(result.totalCount).toBe(runtimeCases(task).length)
      expect(result.passedCount).toBe(result.totalCount)
      expect(result.tests.some(test => test.hidden)).toBe(true)
    })
  }

  for (let variant = 0; variant < 3; variant++) {
    it(`Go: свежий исходник ${variant + 1} с новыми именами и арифметикой принимается`, async () => {
      const identity = randomUUID().replaceAll('-', '')
      const offset = randomInt(1, 100000)
      const code = `package main
import ("encoding/json"; "os"; "fmt")
// Generated during this run: ${identity}
func main() {
  var values_${identity} []int64
  if err := json.NewDecoder(os.Stdin).Decode(&values_${identity}); err != nil { panic(err) }
  var result_${identity} int64
  for _, value_${identity} := range values_${identity} {
    result_${identity} += value_${identity} + ${offset}
    result_${identity} -= ${offset}
  }
  fmt.Println(result_${identity})
}`
      const freshCases = Array.from({ length: 5 }, (_, index) => {
        const values = Array.from({ length: randomInt(2, 30) }, () => randomInt(-1000000, 1000000))
        return extraCase(`Новый ввод ${identity}/${index}`, values, values.reduce((sum, value) => sum + value, 0))
      })
      const task = taskBySlug('go-sum-json')
      const cases = [...runtimeCases(task), ...freshCases]
      const result = await runSolution({ ...task, runtimeCases: cases }, 'go', code)
      expect(result.status, `${identity}: ${JSON.stringify(result)}`).toBe('passed')
      expect(result.passedCount).toBe(cases.length)
    })

    it(`Python: свежий исходник ${variant + 1} и новый Unicode ввод принимаются`, async () => {
      const identity = randomUUID().replaceAll('-', '')
      const offset = randomInt(1, 100000)
      const code = `import json, sys
from itertools import groupby
# Generated during this run: ${identity}
text_${identity} = json.load(sys.stdin)
result_${identity} = []
for symbol_${identity}, run_${identity} in groupby(text_${identity}):
    count_${identity} = ${offset}
    for unused_${identity} in run_${identity}:
        count_${identity} += 1
    result_${identity}.append([symbol_${identity}, count_${identity} - ${offset}])
print(json.dumps(result_${identity}, ensure_ascii=False, separators=(',', ':')))
`
      const alphabet = ['🐍', 'я', 'é', '\u0301', ' ', 'A', '0']
      const freshCases = Array.from({ length: 5 }, (_, index) => {
        const symbols = Array.from({ length: randomInt(20, 100) }, () => alphabet[randomInt(alphabet.length)] ?? 'я')
        const runs: Array<[string, number]> = []
        for (const symbol of symbols) {
          const previous = runs.at(-1)
          if (previous?.[0] === symbol) previous[1] += 1
          else runs.push([symbol, 1])
        }
        return extraCase(`Новый Unicode ${identity}/${index}`, symbols.join(''), runs)
      })
      const task = taskBySlug('python-run-length-encoding')
      const cases = [...runtimeCases(task), ...freshCases]
      const result = await runSolution({ ...task, runtimeCases: cases }, 'python', code)
      expect(result.status, `${identity}: ${JSON.stringify(result)}`).toBe('passed')
      expect(result.passedCount).toBe(cases.length)
    })
  }

  for (const [slug, language] of [
    ['interview-go-stable-string-dedupe', 'go'],
    ['python-two-sum-json', 'python'],
  ] as const) {
    it(`${language}: таблица только открытых ответов не получает серверный зачёт`, async () => {
      const task = taskBySlug(slug)
      const publicCases = runtimeCases(task, true)
      const entries = publicCases.map(test => {
        if (test.input === undefined || test.expected === undefined) throw new Error('Нужны stdin/stdout кейсы')
        return [test.input, test.expected] as const
      })
      const pythonExamples = JSON.stringify(entries.map(([input, expected]) => [JSON.parse(input) as unknown, JSON.parse(expected) as unknown]))
      const code = language === 'go'
        ? `package main
import ("fmt"; "io"; "os"; "strings")
func main(){ data, err := io.ReadAll(os.Stdin); if err != nil {panic(err)}
answers := map[string]string{${entries.map(([input, expected]) => `${JSON.stringify(input)}:${JSON.stringify(expected)}`).join(',')}}
if answer, found := answers[strings.TrimSpace(string(data))]; found { fmt.Println(answer) } else { fmt.Println("[]") }
}`
        : `import json, sys
data = json.load(sys.stdin)
examples = json.loads(${JSON.stringify(pythonExamples)})
answer = []
for known, result in examples:
    if data == known:
        answer = result
        break
print(json.dumps(answer, ensure_ascii=False, separators=(',', ':')))
`
      const publicResult = await runSolution({ ...task, runtimeCases: publicCases }, language, code)
      expect(publicResult.status, JSON.stringify(publicResult)).toBe('passed')
      const canonical = await runSolution(task, language, code)
      expect(canonical.status, JSON.stringify(canonical)).toBe('failed')
      expect(canonical.tests.filter(test => !test.hidden).every(test => test.passed)).toBe(true)
      expect(canonical.tests.some(test => test.hidden && !test.passed)).toBe(true)
    })
  }
})
