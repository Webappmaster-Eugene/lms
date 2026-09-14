#!/usr/bin/env node
/**
 * Копирует ассеты Monaco в public/monaco/vs.
 *
 * @monaco-editor/react по умолчанию грузит редактор с jsdelivr, но CSP сайта
 * разрешает только `connect-src 'self'` — внешний CDN отвалится. Поэтому
 * редактор раздаётся со своего домена, а loader настраивается на /monaco/vs.
 *
 * Копируется только min/vs, и из неё выброшено то, что тренажёру не нужно:
 * воркеры css/html/json (мы открываем лишь javascript и typescript) и локали,
 * кроме русской и английской. Это снимает около 4 МБ с образа.
 *
 * Скрипт идемпотентен: рядом с ассетами кладётся отметка с версией пакета, и
 * при совпадении копирование пропускается. Иначе каждый `pnpm dev` заново
 * перекладывал бы 13 МБ.
 */
import { cp, mkdir, readFile, rm, stat, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require_ = createRequire(import.meta.url)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const target = path.join(root, 'public/monaco/vs')

/** Локали Monaco, которые оставляем: интерфейс тренажёра русский. */
const KEPT_LOCALES = new Set(['ru'])

/**
 * Нужен ли файл в образе.
 *
 * Воркеры css/html/json Monaco подгружает лениво и только под соответствующую
 * модель — у нас таких моделей не бывает, значит эти 2 МБ мертвы.
 */
function shouldCopy(sourcePath) {
  const name = path.basename(sourcePath)

  if (/^(css|html|json)\.worker-/.test(name)) return false

  const locale = /^nls\.messages\.([\w-]+)\.js\.js$/.exec(name)
  if (locale) return KEPT_LOCALES.has(locale[1])

  return true
}

async function readStamp(stampPath) {
  try {
    return (await readFile(stampPath, 'utf8')).trim()
  } catch {
    return null
  }
}

async function exists(filePath) {
  try {
    await stat(filePath)
    return true
  } catch {
    return false
  }
}

async function main() {
  let source
  let version = 'unknown'
  try {
    // Резолвим через сам пакет: при изолированной раскладке pnpm путь к нему
    // не выводится из node_modules корня проекта.
    const packagePath = require_.resolve('monaco-editor/package.json')
    source = path.join(path.dirname(packagePath), 'min/vs')
    version = JSON.parse(await readFile(packagePath, 'utf8')).version ?? 'unknown'
  } catch {
    process.stdout.write('monaco-editor не установлен — копирование пропущено\n')
    return
  }

  if (!(await exists(source))) {
    throw new Error(`Не найдена сборка Monaco: ${source}`)
  }

  const stamp = path.join(path.dirname(target), '.version')
  if ((await readStamp(stamp)) === version) {
    process.stdout.write(`Monaco ${version} уже на месте\n`)
    return
  }

  await rm(path.dirname(target), { recursive: true, force: true })
  await mkdir(path.dirname(target), { recursive: true })
  await cp(source, target, { recursive: true, filter: shouldCopy })
  await writeFile(stamp, version, 'utf8')

  process.stdout.write(`Monaco ${version} скопирован в public/monaco/vs\n`)
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
