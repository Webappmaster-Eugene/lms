#!/usr/bin/env node
/**
 * Копирует ассеты Monaco в public/monaco/vs.
 *
 * @monaco-editor/react по умолчанию грузит редактор с jsdelivr, но CSP сайта
 * разрешает только `connect-src 'self'` — внешний CDN отвалится. Поэтому
 * редактор раздаётся со своего домена, а loader настраивается на /monaco/vs.
 *
 * Копируется min/vs со всеми языковыми воркерами: frontend-проекты открывают
 * CSS, HTML и JSON вместе с JavaScript и TypeScript. Локали, кроме русской
 * и английской, исключаются из образа.
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
// Версия фильтра важна даже при неизменном пакете Monaco: старый stamp
// мог подтверждать копию, в которой отсутствуют нужные языковые воркеры.
const COPY_REVISION = 'frontend-react-types-v2'

/**
 * Нужен ли файл в образе.
 *
 * Все воркеры загружаются лениво; в образе нужны и frontend-языки.
 */
function shouldCopy(sourcePath) {
  const name = path.basename(sourcePath)

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

  const reactPackagePath = require_.resolve('@types/react/package.json')
  const reactDirectory = path.dirname(reactPackagePath)
  const reactVersion = JSON.parse(await readFile(reactPackagePath, 'utf8')).version
  const cssTypePath = createRequire(reactPackagePath).resolve('csstype/index.d.ts')
  const stamp = path.join(path.dirname(target), '.version')
  const expectedStamp = `${version}:${COPY_REVISION}:${reactVersion}`
  if ((await readStamp(stamp)) === expectedStamp) {
    process.stdout.write(`Monaco ${version} уже на месте\n`)
    return
  }

  const wrapModule = (name, source) => `declare module '${name}' {\n${source}\n}`
  const reactSource = (name) => readFile(path.join(reactDirectory, name), 'utf8')
  const declarations = {
    'global.d.ts': await reactSource('global.d.ts'),
    'react.d.ts': wrapModule('react', (await reactSource('index.d.ts')).replace(/export as namespace React;/, '')),
    'csstype.d.ts': wrapModule('csstype', await readFile(cssTypePath, 'utf8')),
    'jsx-runtime.d.ts': wrapModule('react/jsx-runtime', (await reactSource('jsx-runtime.d.ts')).replace(/from "\.\/"/g, 'from "react"')),
    'jsx-dev-runtime.d.ts': wrapModule('react/jsx-dev-runtime', (await reactSource('jsx-dev-runtime.d.ts')).replace(/from "\.\/"/g, 'from "react"')),
  }

  await rm(path.dirname(target), { recursive: true, force: true })
  await mkdir(path.dirname(target), { recursive: true })
  await cp(source, target, { recursive: true, filter: shouldCopy })
  await writeFile(path.join(path.dirname(target), 'react-types.json'), JSON.stringify(declarations), 'utf8')
  await writeFile(stamp, expectedStamp, 'utf8')

  process.stdout.write(`Monaco ${version} скопирован в public/monaco/vs\n`)
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
