import { randomUUID } from 'node:crypto'
import { beforeAll, describe, expect, it } from 'vitest'

import { TRAINER_CATALOG } from '@/data/trainer'
import { flattenCatalog } from '@/data/trainer/types'
import { runtimeCases, type FrontendLanguage } from '@/lib/trainer/runtime-spec'
import type { TrainerRunResult } from '@/lib/trainer/types'
import { runSolution } from '@/server/trainer/sandbox'
import { generatedCounter, projects } from './alternative-frontend-solutions/projects'

const entries = flattenCatalog(TRAINER_CATALOG).flatMap(({ task }) => {
  const language = task.languages.find((value): value is FrontendLanguage => value === 'react' || value === 'html' || value === 'next')
  return language ? [{ task, language }] : []
})

function entry(slug: string) {
  const found = entries.find(({ task }) => task.slug === slug)
  if (!found) throw new Error(`Frontend catalog task not found: ${slug}`)
  return found
}

function diagnostics(result: TrainerRunResult): string {
  return [result.error, ...result.tests.filter(test => !test.passed).map(test => `${test.name}: ${test.message}`)].filter(Boolean).join('\n')
}

beforeAll(() => {
  if (!process.env.TRAINER_RUNTIME_URL || !process.env.TRAINER_RUNTIME_TOKEN) {
    throw new Error('A real HTTP gateway and Docker browser jobs are required; run pnpm test:integration:runtime')
  }
})

describe('independent frontend submissions → server runSolution → real Docker Chromium', () => {
  it('covers all 12 frontend drafts with independently written projects', () => {
    expect(entries).toHaveLength(12)
    expect(Object.keys(projects).sort()).toEqual(entries.map(({ task }) => task.slug).sort())
  })

  it.each(entries.map(({ task, language }) => [task.slug, task, language] as const))(
    '%s accepts an alternative implementation against every public and hidden scenario',
    async (slug, task, language) => {
      const files = projects[slug]
      if (!files) throw new Error(`Independent solution missing: ${slug}`)
      const result = await runSolution(task, language, JSON.stringify(files))
      expect(result.status, diagnostics(result)).toBe('passed')
      expect(result.totalCount).toBe(runtimeCases(task).length)
      expect(result.passedCount).toBe(result.totalCount)
      expect(result.tests.some(test => test.hidden)).toBe(true)
    },
  )

  it.each([0, 1, 2, 3])('accepts freshly generated counter source, strategy %i', async variant => {
    const identifier = `Counter${randomUUID().replaceAll('-', '')}`
    const files = generatedCounter(identifier, variant)
    expect(files['App.jsx']).toContain(identifier)
    const { task, language } = entry('react-bounded-counter')
    const result = await runSolution(task, language, JSON.stringify(files))
    expect(result.status, diagnostics(result)).toBe('passed')
    expect(result.passedCount).toBe(runtimeCases(task).length)
  })

  it('accepts the HTML heading inside a semantic header as permitted by the description', async () => {
    const { task, language } = entry('html-responsive-profile')
    const files = { ...projects[task.slug] }
    const original = files['index.html']
    if (!original) throw new Error('HTML profile project is missing index.html')
    files['index.html'] = original.replace('<main><h1>Команда</h1>', '<main><header><h1>Команда</h1></header>')
    const result = await runSolution(task, language, JSON.stringify(files))
    expect(result.status, diagnostics(result)).toBe('passed')
    expect(result.passedCount).toBe(runtimeCases(task).length)
  })

  it('accepts a Next course title in strong rather than an unspecified span', async () => {
    const { task, language } = entry('next-server-catalog')
    const files = { ...projects[task.slug] }
    const original = files['app/page.jsx']
    if (!original) throw new Error('Next catalog project is missing app/page.jsx')
    files['app/page.jsx'] = original.replace('<span>{title}</span>', '<strong>{title}</strong>')
    const result = await runSolution(task, language, JSON.stringify(files))
    expect(result.status, diagnostics(result)).toBe('passed')
    expect(result.passedCount).toBe(runtimeCases(task).length)
  })

  it('accepts a Next heading wrapper and plain course title text without a child tag', async () => {
    const { task, language } = entry('next-server-catalog')
    const files = { ...projects[task.slug] }
    const original = files['app/page.jsx']
    if (!original) throw new Error('Next catalog project is missing app/page.jsx')
    files['app/page.jsx'] = original
      .replace('<h1>Каталог курсов</h1>', '<header><h1>Каталог курсов</h1></header>')
      .replace('<span>{title}</span>', '{title}')
    const result = await runSolution(task, language, JSON.stringify(files))
    expect(result.status, diagnostics(result)).toBe('passed')
    expect(result.passedCount).toBe(runtimeCases(task).length)
  })

  it('rejects an interactive counter that only implements the public examples', async () => {
    const { task, language } = entry('react-bounded-counter')
    const files = generatedCounter(`Counter${randomUUID().replaceAll('-', '')}`, 0)
    files['App.jsx'] = files['App.jsx'].replace('Math.min(5,previous+1)', 'Math.min(3,previous+1)')
    const result = await runSolution(task, language, JSON.stringify(files))
    expect(result.status, diagnostics(result)).toBe('failed')
    expect(result.tests.filter(test => !test.hidden).every(test => test.passed), diagnostics(result)).toBe(true)
    expect(result.tests.some(test => test.hidden && !test.passed), diagnostics(result)).toBe(true)
  })

  it('rejects a hardcoded UI screenshot even when its initial state is correct', async () => {
    const { task, language } = entry('react-bounded-counter')
    const files = {
      'App.jsx': 'export default function App(){return <main><output id="count" aria-live="polite">0</output><button id="decrement" type="button" disabled>Уменьшить</button><button id="increment" type="button">Увеличить</button><button id="reset" type="button">Сбросить</button></main>}',
    }
    const result = await runSolution(task, language, JSON.stringify(files))
    expect(result.status, diagnostics(result)).toBe('failed')
    expect(result.tests[0]?.passed).toBe(true)
    expect(result.tests.some(test => test.hidden && !test.passed), diagnostics(result)).toBe(true)
  })

  it('rejects lost selection despite correct directory public examples', async () => {
    const { task, language } = entry('react-interview-directory-selection')
    const files = { ...projects[task.slug] }
    const original = files['App.tsx']
    if (!original) throw new Error('Directory project is missing App.tsx')
    files['App.tsx'] = original.replace("return {...state,query:event.value}", "return {...state,query:event.value,chosen:{}}")
    const result = await runSolution(task, language, JSON.stringify(files))
    expect(result.status, diagnostics(result)).toBe('failed')
    expect(result.tests.filter(test => !test.hidden).every(test => test.passed), diagnostics(result)).toBe(true)
    expect(result.tests.some(test => test.hidden && !test.passed), diagnostics(result)).toBe(true)
  })
})
