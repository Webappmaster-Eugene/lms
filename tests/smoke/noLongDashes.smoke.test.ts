import { execFileSync } from 'node:child_process'
import { readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { TRAINER_CATALOG } from '@/data/trainer'
import { flattenCatalog } from '@/data/trainer/types'

/**
 * Правило владельца от 27.10.2026: в текстах для людей только короткий дефис, длинных
 * тире «—» и «–» нет. Комментарии кода не проверяются, как и классы символов регулярных
 * выражений: разбор названий с Яндекс Диска обязан понимать тире в чужих именах файлов.
 */

const ROOT = fileURLToPath(new URL('../..', import.meta.url))
const DASH = /[—–]/
const REGEX_CLASS = /\[[^\]\n]*[—–][^\]\n]*\]/g
// Ключи программ курсов совпадают с именами папок на Диске и меняются вместе с ними.
const CURRICULUM_KEY = /^\s*'[^']*[—–][^']*': \{/

function sourceFiles(): string[] {
  return execFileSync('git', ['ls-files', 'src', 'landing/src'], { cwd: ROOT, encoding: 'utf8' })
    .split('\n')
    .filter((file) => /\.(tsx?|astro|mjs|js)$/.test(file))
    .filter((file) => !file.startsWith('src/migrations/') && !file.startsWith('src/data/trainer/') && file !== 'src/payload-types.ts' && !file.endsWith('.generated.ts'))
}

function dashedLines(file: string): string[] {
  const found: string[] = []
  let comment = false
  readFileSync(`${ROOT}/${file}`, 'utf8').split('\n').forEach((line, index) => {
    const trimmed = line.trim()
    if (comment) {
      if (trimmed.includes('*/')) comment = false
      return
    }
    if (trimmed.startsWith('/*') && !trimmed.includes('*/')) {
      comment = true
      return
    }
    if (/^\s*(\/\/|\*|\/\*|\{\/\*)/.test(line) || CURRICULUM_KEY.test(line)) return
    if (DASH.test(line.replace(REGEX_CLASS, ''))) found.push(`${file}:${index + 1}: ${trimmed.slice(0, 100)}`)
  })
  return found
}

/** Текст Markdown без блоков кода и кода в строке: примеры кода могут содержать что угодно. */
function prose(markdown: string | undefined): string {
  return (markdown ?? '').replace(/^[ \t]*(```|~~~)[^\n]*\n[\s\S]*?^[ \t]*\1[ \t]*$/gm, '').replace(/`[^`]+`/g, '')
}

describe('короткий дефис вместо длинного тире', () => {
  it('в строках интерфейса, писем и лендинга нет длинных тире', () => {
    expect(sourceFiles().flatMap(dashedLines)).toEqual([])
  })

  it('в названиях, условиях, разборах и подсказках задач тренажёра нет длинных тире', () => {
    const found = flattenCatalog(TRAINER_CATALOG).flatMap(({ topic, task }) => {
      const texts = [topic.title, topic.description, task.title, prose(task.descriptionMd), prose(task.solutionNotes), ...(task.hints ?? []), ...(task.cases ?? []).map((item) => item.name ?? '')]
      return texts.some((text) => DASH.test(text)) ? [task.slug] : []
    })
    expect([...new Set(found)]).toEqual([])
  })
})
