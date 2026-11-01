#!/usr/bin/env node
/**
 * Копирует готовую сборку mermaid в public/mermaid.
 *
 * Схемы конспектов рисуются в браузере. Через webpack mermaid тянет сотни
 * модулей, и сборка Next с source maps упиралась в лимит памяти (выкат
 * 01.11.2026 упал с heap out of memory). Поэтому один готовый файл
 * раздаётся со своего домена (CSP: script-src 'self') и грузится только на
 * страницах со схемами.
 *
 * Скрипт идемпотентен: при совпадении версии копирование пропускается.
 */
import { copyFile, mkdir, readFile, writeFile } from 'node:fs/promises'
import { createRequire } from 'node:module'
import path from 'node:path'
import { fileURLToPath } from 'node:url'

const require_ = createRequire(import.meta.url)
const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..')
const targetDir = path.join(root, 'public/mermaid')

async function main() {
  // Через сам пакет: при изолированной раскладке pnpm путь не выводится из node_modules корня.
  const packagePath = require_.resolve('mermaid/package.json')
  const { version } = JSON.parse(await readFile(packagePath, 'utf8'))
  const source = path.join(path.dirname(packagePath), 'dist/mermaid.min.js')
  const stamp = path.join(targetDir, '.version')
  const current = await readFile(stamp, 'utf8').then((value) => value.trim(), () => null)
  if (current === version) {
    process.stdout.write(`mermaid ${version} уже на месте\n`)
    return
  }
  await mkdir(targetDir, { recursive: true })
  await copyFile(source, path.join(targetDir, 'mermaid.min.js'))
  await writeFile(stamp, version, 'utf8')
  process.stdout.write(`mermaid ${version} скопирован в public/mermaid\n`)
}

main().catch((error) => {
  process.stderr.write(`${error instanceof Error ? error.message : String(error)}\n`)
  process.exitCode = 1
})
