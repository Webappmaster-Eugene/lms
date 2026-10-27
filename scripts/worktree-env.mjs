/**
 * Настройки worktree из `.worktree.env` (его пишет `pnpm wt:setup`): своя база интеграции
 * и свои порты e2e и скриншотов. Файл загружается при импорте модуля. Переменные, заданные
 * явно, главнее файла; в основном checkout и в CI файла нет, и действуют прежние значения.
 */
import { existsSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'

export const WORKTREE_ENV_FILE = '.worktree.env'

/** Строки `KEY=value`; пустые строки и комментарии `#` пропускаются. */
export function parseEnv(text) {
  const values = {}
  for (const line of text.split(/\r?\n/)) {
    const match = /^\s*([A-Z][A-Z0-9_]*)\s*=\s*(.*?)\s*$/.exec(line)
    if (match) values[match[1]] = match[2]
  }
  return values
}

export function loadWorktreeEnv(file = fileURLToPath(new URL(`../${WORKTREE_ENV_FILE}`, import.meta.url))) {
  if (!existsSync(file)) return {}
  const values = parseEnv(readFileSync(file, 'utf8'))
  for (const [key, value] of Object.entries(values)) {
    if (process.env[key] === undefined) process.env[key] = value
  }
  return values
}

loadWorktreeEnv()
