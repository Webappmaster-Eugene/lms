#!/usr/bin/env node
/**
 * Рабочие деревья (git worktree) для параллельных задач. У каждого дерева свои зависимости,
 * база интеграционных тестов и порты e2e, поэтому сессии в соседних деревьях не мешают
 * друг другу. Подробности — docs/worktrees.md.
 *
 *   pnpm wt:new <ветка>    # ../wt-<имя> от свежего origin/main и его подготовка
 *   pnpm wt:setup          # подготовить текущее дерево; повторный запуск ничего не ломает
 *   pnpm wt:list           # деревья, их порты, влита ли ветка, есть ли правки
 *   pnpm wt:remove <имя>   # удалить дерево, его тестовые базы и влитую ветку
 */
import { execFileSync, spawnSync } from 'node:child_process'
import { randomBytes } from 'node:crypto'
import { appendFileSync, existsSync, mkdirSync, readFileSync, writeFileSync } from 'node:fs'
import { createServer } from 'node:net'
import { basename, dirname, join, resolve } from 'node:path'
import { fileURLToPath } from 'node:url'

import { parseEnv, WORKTREE_ENV_FILE } from './worktree-env.mjs'

const HERE = resolve(fileURLToPath(new URL('..', import.meta.url)))
export const MAX_SLOT = 99
// Основной checkout держит 3100-3103 и 3150/3151; деревья живут выше, по десятку портов на слот.
const PORT_BASE = 4000

export function slotSettings(slot, name) {
  const base = PORT_BASE + slot * 10
  const slug = name.toLowerCase().replace(/^wt-/, '').replace(/[^a-z0-9]+/g, '_').slice(0, 36).replace(/^_+|_+$/g, '')
  return {
    WORKTREE_SLOT: String(slot),
    // Интеграция добавит к имени _seed и _migrations; с этим запасом имя не длиннее 63 символов.
    LMS_INTEGRATION_DB: slug ? `lms_wt${slot}_${slug}` : `lms_wt${slot}`,
    E2E_APP_PORT: String(base),
    E2E_LANDING_PORT: String(base + 1),
    VISUAL_APP_PORT: String(base + 2),
    VISUAL_LANDING_PORT: String(base + 3),
  }
}

/** Все базы, которые тесты дерева создают в lms-test-pg (e2e-база названа по порту приложения). */
export function treeDatabases(settings) {
  const db = settings.LMS_INTEGRATION_DB
  return [db, `${db}_seed`, `${db}_migrations`, `lms_e2e_${settings.E2E_APP_PORT}`, `lms_e2e_${settings.VISUAL_APP_PORT}`]
}

export function freeSlots(used) {
  return Array.from({ length: MAX_SLOT }, (_, index) => index + 1).filter((slot) => !used.has(slot))
}

export function parseWorktreeList(text) {
  return text.split(/\n\s*\n/).filter((block) => block.trim()).map((block) => {
    const tree = {}
    for (const line of block.split('\n')) {
      const [key, ...rest] = line.split(' ')
      if (key === 'worktree') tree.path = rest.join(' ')
      else if (key === 'HEAD') tree.head = rest[0]
      else if (key === 'branch') tree.branch = rest.join(' ').replace(/^refs\/heads\//, '')
      else if (key === 'prunable') tree.prunable = true
    }
    return tree
  })
}

function fail(message) {
  console.error(`[wt] ${message}`)
  process.exit(1)
}

function git(args, cwd) {
  return execFileSync('git', args, { cwd, encoding: 'utf8', stdio: ['ignore', 'pipe', 'pipe'] }).trim()
}

function run(command, args, cwd) {
  const result = spawnSync(command, args, { cwd, stdio: 'inherit' })
  if (result.status !== 0) fail(`команда упала: ${command} ${args.join(' ')}`)
}

/** Первым git перечисляет основной checkout. */
function worktrees() {
  return parseWorktreeList(git(['worktree', 'list', '--porcelain'], HERE))
}

function readSettings(path) {
  const file = join(path, WORKTREE_ENV_FILE)
  return existsSync(file) ? parseEnv(readFileSync(file, 'utf8')) : null
}

function fetchMain(cwd) {
  const result = spawnSync('git', ['fetch', '--quiet', 'origin', 'main'], { cwd, stdio: 'inherit' })
  if (result.status !== 0) console.warn('[wt] origin/main не обновился, дальше работаю с локальной копией')
}

function isMerged(branch, cwd) {
  return spawnSync('git', ['merge-base', '--is-ancestor', `refs/heads/${branch}`, 'origin/main'], { cwd }).status === 0
}

function portFree(port, host) {
  return new Promise((done) => {
    const server = createServer()
    server.once('error', () => done(false))
    server.listen(port, host, () => server.close(() => done(true)))
  })
}

async function portsFree(settings) {
  const ports = [settings.E2E_APP_PORT, settings.E2E_LANDING_PORT, settings.VISUAL_APP_PORT, settings.VISUAL_LANDING_PORT].map(Number)
  for (const port of ports) {
    if (!(await portFree(port, '127.0.0.1')) || !(await portFree(port))) return false
  }
  return true
}

/**
 * В .gitignore старых веток записи про .worktree.env нет: файл считался бы неотслеживаемым,
 * и git worktree remove отказался бы удалять дерево. info/exclude общий для всех деревьев.
 */
function ignoreEverywhere(target) {
  const exclude = join(git(['rev-parse', '--path-format=absolute', '--git-common-dir'], target), 'info', 'exclude')
  const text = existsSync(exclude) ? readFileSync(exclude, 'utf8') : ''
  if (text.split('\n').includes(WORKTREE_ENV_FILE)) return
  mkdirSync(dirname(exclude), { recursive: true })
  appendFileSync(exclude, `${text && !text.endsWith('\n') ? '\n' : ''}${WORKTREE_ENV_FILE}\n`)
}

function heavyInstalled() {
  return spawnSync('sh', ['-c', 'command -v heavy'], { stdio: 'ignore' }).status === 0
}

async function setup(target) {
  const trees = worktrees()
  if (resolve(trees[0].path) === target) fail('это основной checkout: он работает на стандартных портах, wt:setup нужен только отдельному дереву')

  let settings = readSettings(target)
  if (!settings?.WORKTREE_SLOT) {
    const used = new Set(trees.filter((tree) => resolve(tree.path) !== target).map((tree) => Number(readSettings(tree.path)?.WORKTREE_SLOT)).filter(Boolean))
    for (const slot of freeSlots(used)) {
      const candidate = slotSettings(slot, basename(target))
      if (await portsFree(candidate)) {
        settings = candidate
        break
      }
    }
    if (!settings?.WORKTREE_SLOT) fail('свободных слотов нет: удалите лишние деревья (pnpm wt:list, pnpm wt:remove)')
    const lines = Object.entries(settings).map(([key, value]) => `${key}=${value}`)
    writeFileSync(join(target, WORKTREE_ENV_FILE), `# pnpm wt:setup: база и порты этого дерева, см. docs/worktrees.md\n${lines.join('\n')}\n`)
  }
  ignoreEverywhere(target)

  // Пакеты берутся из общего стора pnpm: новое дерево почти не занимает места под зависимости.
  run('pnpm', ['install', '--frozen-lockfile', '--prefer-offline'], target)

  // pnpm build требует DATABASE_URL и PAYLOAD_SECRET; тесты задают свои значения сами.
  // test-db.mjs тянет pg, поэтому импорт только после установки зависимостей.
  const envFile = join(target, '.env')
  if (!existsSync(envFile)) {
    const { databaseUrl } = await import('./test-db.mjs')
    const env = `# pnpm wt:setup: для pnpm build и pnpm smoke в этом дереве\nDATABASE_URL=${databaseUrl(settings.LMS_INTEGRATION_DB)}\nPAYLOAD_SECRET=${randomBytes(32).toString('hex')}\n`
    writeFileSync(envFile, env, { mode: 0o600 })
  }

  console.log(`[wt] ${basename(target)} готово, слот ${settings.WORKTREE_SLOT}`)
  console.log(`  интеграция: база ${settings.LMS_INTEGRATION_DB}`)
  console.log(`  e2e: приложение ${settings.E2E_APP_PORT}, лендинг ${settings.E2E_LANDING_PORT}; скриншоты: ${settings.VISUAL_APP_PORT}/${settings.VISUAL_LANDING_PORT}`)
  if (!heavyInstalled()) console.log('  heavy не установлен, проверки пойдут без общей очереди: brew install mokevnin/tap/heavy')
}

async function create(branch) {
  if (!branch || spawnSync('git', ['check-ref-format', '--branch', branch], { stdio: 'ignore' }).status !== 0) {
    fail('укажите имя новой ветки: pnpm wt:new feat/<задача>')
  }
  const main = worktrees()[0].path
  const target = join(dirname(main), `wt-${branch.split('/').pop()}`)
  if (existsSync(target)) fail(`папка ${target} уже есть: продолжайте работу в ней или удалите её через pnpm wt:remove ${basename(target)}`)

  fetchMain(main)
  const branchExists = spawnSync('git', ['rev-parse', '--verify', '--quiet', `refs/heads/${branch}`], { cwd: main, stdio: 'ignore' }).status === 0
  run('git', branchExists ? ['worktree', 'add', target, branch] : ['worktree', 'add', '-b', branch, target, 'origin/main'], main)
  await setup(target)
  console.log(`[wt] дальше работайте в ${target}`)
}

function list() {
  const trees = worktrees()
  const main = trees[0].path
  for (const [index, tree] of trees.entries()) {
    const name = basename(tree.path).padEnd(28)
    if (tree.prunable) {
      console.log(`${name} папки нет, запись убирает git worktree prune`)
      continue
    }
    const date = git(['log', '-1', '--format=%cs', tree.head], main)
    const changes = git(['status', '--porcelain'], tree.path).split('\n').filter(Boolean).length
    const settings = readSettings(tree.path)
    const ports = index === 0 ? 'основной checkout' : settings ? `порты ${settings.E2E_APP_PORT}-${settings.VISUAL_LANDING_PORT}` : 'без wt:setup'
    const merged = index === 0 || !tree.branch ? '' : isMerged(tree.branch, main) ? 'влита в origin/main' : 'не влита'
    console.log([name, (tree.branch ?? 'без ветки').padEnd(40), date, ports.padEnd(18), merged.padEnd(18), changes ? `правок: ${changes}` : 'без правок'].join('  '))
  }
}

async function remove(query) {
  if (!query) fail('укажите дерево: pnpm wt:remove wt-<имя> (список: pnpm wt:list)')
  const trees = worktrees()
  const main = trees[0].path
  const asPath = resolve(process.env.INIT_CWD ?? HERE, query)
  const tree = trees.slice(1).find((item) => [basename(item.path), item.branch].includes(query) || basename(item.path) === `wt-${query}` || resolve(item.path) === asPath)
  if (!tree) fail(`дерево «${query}» не найдено (список: pnpm wt:list)`)

  if (!tree.prunable && git(['status', '--porcelain'], tree.path)) {
    fail(`в ${tree.path} есть незакоммиченные или неотслеживаемые файлы. Закоммитьте или перенесите их; ничего не удалено`)
  }

  // Базы одноразовые: тесты пересоздают их при каждом прогоне, поэтому удаляем до самого дерева.
  const settings = tree.prunable ? null : readSettings(tree.path)
  if (settings) {
    const { drop } = await import('./test-db.mjs')
    const databases = treeDatabases(settings)
    try {
      await drop(databases)
      console.log(`[wt] тестовые базы удалены: ${databases.join(', ')}`)
    } catch (error) {
      if (error?.code === 'ECONNREFUSED') console.log('[wt] lms-test-pg не запущен: базы дерева жили в tmpfs и уже исчезли')
      else console.error(`[wt] базы не удалены, дерево удаляю дальше: ${error?.message ?? error}`)
    }
  }

  run('git', tree.prunable ? ['worktree', 'prune'] : ['worktree', 'remove', tree.path], main)
  console.log(`[wt] дерево ${tree.path} удалено`)

  if (tree.branch) {
    fetchMain(main)
    if (isMerged(tree.branch, main)) {
      run('git', ['branch', '-D', tree.branch], main)
    } else {
      console.log(`[wt] ветка ${tree.branch} не влита в origin/main и оставлена; удалить вручную: git branch -D ${tree.branch}`)
    }
  }
  if (resolve(tree.path) === HERE) console.log(`[wt] команда шла из удалённого дерева: перейдите в ${main}`)
}

if (process.argv[1] === fileURLToPath(import.meta.url)) {
  const [command, argument] = process.argv.slice(2)
  const commands = { new: () => create(argument), setup: () => setup(HERE), list, remove: () => remove(argument) }
  if (!commands[command]) {
    console.error('Использование: pnpm wt:new <ветка> | wt:setup | wt:list | wt:remove <имя>')
    process.exit(2)
  }
  await commands[command]()
}
