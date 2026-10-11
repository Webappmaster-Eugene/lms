import { randomBytes, randomUUID } from 'node:crypto'
import { chmodSync, chownSync, existsSync, linkSync, lstatSync, mkdirSync, readFileSync, unlinkSync, writeFileSync } from 'node:fs'
import { dirname, join } from 'node:path'

export function readRuntimeToken(file) {
  const stat = lstatSync(file)
  if (!stat.isFile() || (stat.mode & 0o027) !== 0 || stat.size > 256) throw new Error('Недопустимый файл авторизации тренажёра')
  const token = readFileSync(file, 'utf8').trim()
  if (!/^[a-f0-9]{64}$/.test(token)) throw new Error('Некорректный токен тренажёра')
  return token
}

export function initializeRuntimeToken(file, { uid = 1001, gid = 1001 } = {}) {
  const directory = dirname(file)
  mkdirSync(directory, { recursive: true })
  const temporary = join(directory, `.token-${randomUUID()}`)
  try {
    writeFileSync(temporary, `${randomBytes(32).toString('hex')}\n`, { mode: 0o440, flag: 'wx' })
    chownSync(temporary, uid, gid)
    try { linkSync(temporary, file) } catch (error) { if (error.code !== 'EEXIST') throw error }
    // Повторный выкат сохраняет ключ; некорректный существующий файл не заменяем.
    const token = readRuntimeToken(file)
    chownSync(file, uid, gid)
    chmodSync(file, 0o440)
    return token
  } finally { if (existsSync(temporary)) unlinkSync(temporary) }
}

if (import.meta.url === `file://${process.argv[1]}`) {
  if (process.argv[2] !== 'init' || !process.env.TRAINER_RUNTIME_TOKEN_FILE) throw new Error('Не задан путь к файлу авторизации')
  initializeRuntimeToken(process.env.TRAINER_RUNTIME_TOKEN_FILE)
}
