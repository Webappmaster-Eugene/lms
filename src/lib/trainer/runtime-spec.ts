import { TRAINER_LIMITS } from './constants'
import { TrainerSpecError } from './spec'
import type { TrainerLanguage } from './types'

export type FrontendLanguage = 'html' | 'react' | 'next'
export type RuntimeLanguage = 'go' | 'python' | FrontendLanguage
export type BrowserCheck = {
  selector: string
  action?: 'click' | 'fill' | 'press'
  value?: string
  text?: string
  count?: number
  visible?: boolean
  css?: Record<string, string>
  attribute?: { name: string; value: string }
}
export type RuntimeCase = {
  name: string
  hidden: boolean
  input?: string
  expected?: string
  checks?: BrowserCheck[]
  viewport?: { width: number; height: number }
  path?: string
}

export function isTrainerLanguage(value: unknown): value is TrainerLanguage {
  return value === 'js' || value === 'ts' || isRuntimeLanguage(value)
}

export function isFrontendLanguage(value: unknown): value is FrontendLanguage {
  return value === 'html' || value === 'react' || value === 'next'
}

export function isProgramLanguage(value: unknown): value is 'go' | 'python' {
  return value === 'go' || value === 'python'
}

export function isRuntimeLanguage(value: unknown): value is RuntimeLanguage {
  return isProgramLanguage(value) || isFrontendLanguage(value)
}

export function validFrontendPath(path: string): boolean {
  return path.length <= 120 && /\.(html|css|js|jsx|ts|tsx|json)$/.test(path)
    && path.split('/').every((segment) => /^[a-zA-Z0-9_@()[\]-][a-zA-Z0-9_@()[\].-]*$/.test(segment))
}

export function parseFrontendFiles(code: string): Record<string, string> {
  if (code.length > TRAINER_LIMITS.maxCodeLength) throw new TrainerSpecError('Проект превышает лимит размера')
  let value: unknown
  try { value = JSON.parse(code) } catch { throw new TrainerSpecError('Не удалось прочитать файлы проекта') }
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new TrainerSpecError('Ожидается список файлов проекта')
  const entries = Object.entries(value)
  if (!entries.length || entries.length > 32) throw new TrainerSpecError('В проекте должно быть от 1 до 32 файлов')
  for (const [path, source] of entries) {
    if (!validFrontendPath(path) || typeof source !== 'string') throw new TrainerSpecError(`Недопустимый файл проекта: ${path.slice(0, 120)}`)
  }
  return Object.fromEntries(entries) as Record<string, string>
}

function record(value: unknown): value is Record<string, unknown> {
  return !!value && typeof value === 'object' && !Array.isArray(value)
}

function parseCheck(value: unknown): BrowserCheck {
  if (!record(value) || typeof value.selector !== 'string' || !value.selector || value.selector.length > 500) {
    throw new TrainerSpecError('Для проверки интерфейса нужен CSS-селектор')
  }
  if (value.action !== undefined && value.action !== 'click' && value.action !== 'fill' && value.action !== 'press') throw new TrainerSpecError('Неизвестное действие проверки')
  for (const key of ['value', 'text']) {
    if (value[key] !== undefined && typeof value[key] !== 'string') throw new TrainerSpecError('Некорректное значение проверки интерфейса')
  }
  if (value.count !== undefined && (typeof value.count !== 'number' || !Number.isSafeInteger(value.count) || value.count < 0)) throw new TrainerSpecError('Некорректное число элементов')
  if (value.visible !== undefined && typeof value.visible !== 'boolean') throw new TrainerSpecError('Некорректная проверка видимости')
  if (value.css !== undefined && (!record(value.css) || Object.values(value.css).some((item) => typeof item !== 'string'))) throw new TrainerSpecError('Некорректная проверка CSS')
  if (value.attribute !== undefined && (!record(value.attribute) || typeof value.attribute.name !== 'string' || typeof value.attribute.value !== 'string')) throw new TrainerSpecError('Некорректная проверка атрибута')
  if (value.action === 'press' && !['Enter', 'Escape', 'Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Tab'].includes(String(value.value))) throw new TrainerSpecError('Неизвестная клавиша проверки интерфейса')
  if (value.action === 'fill' && typeof value.value !== 'string') throw new TrainerSpecError('Для ввода нужен текст')
  if (value.action === undefined && value.text === undefined && value.count === undefined && value.visible === undefined && value.css === undefined && value.attribute === undefined) {
    throw new TrainerSpecError('Проверка должна содержать действие или ожидаемое свойство элемента')
  }
  return value as BrowserCheck
}

/** Скрытые строки исключаем ДО чтения их закрытых полей в выдаче ученику. */
export function runtimeCases(task: { runtimeCases?: unknown }, publicOnly = false): RuntimeCase[] {
  if (task.runtimeCases == null) return []
  if (!Array.isArray(task.runtimeCases) || task.runtimeCases.length > 50) throw new TrainerSpecError('Некорректный набор проверок среды выполнения')
  return task.runtimeCases.filter((row) => !(publicOnly && record(row) && row.hidden === true)).map((row, index) => {
    if (!record(row)) throw new TrainerSpecError('Некорректная проверка среды выполнения')
    if (row.input != null && typeof row.input !== 'string') throw new TrainerSpecError('Входные данные должны быть текстом')
    if (row.expected != null && typeof row.expected !== 'string') throw new TrainerSpecError('Ожидаемый вывод должен быть текстом')
    const checks = row.checks == null ? undefined : Array.isArray(row.checks) && row.checks.length <= 50 ? row.checks.map(parseCheck) : null
    if (checks === null) throw new TrainerSpecError('Некорректные проверки интерфейса')
    let viewport: RuntimeCase['viewport']
    if (row.viewport != null) {
      if (!record(row.viewport) || !Number.isSafeInteger(row.viewport.width) || !Number.isSafeInteger(row.viewport.height)
        || typeof row.viewport.width !== 'number' || typeof row.viewport.height !== 'number'
        || row.viewport.width < 320 || row.viewport.width > 1920 || row.viewport.height < 240 || row.viewport.height > 1200) {
        throw new TrainerSpecError('Размер окна должен быть в пределах 320–1920 × 240–1200')
      }
      viewport = { width: row.viewport.width, height: row.viewport.height }
    }
    if (row.path != null && (typeof row.path !== 'string' || !row.path.startsWith('/') || row.path.startsWith('//') || row.path.includes('\\') || row.path.length > 500)) throw new TrainerSpecError('Некорректный путь страницы')
    return {
      name: typeof row.name === 'string' && row.name.trim() ? row.name : `Кейс ${index + 1}`,
      hidden: row.hidden === true,
      ...(typeof row.input === 'string' ? { input: row.input } : {}),
      ...(typeof row.expected === 'string' ? { expected: row.expected } : {}),
      ...(checks ? { checks } : {}),
      ...(viewport ? { viewport } : {}),
      ...(typeof row.path === 'string' ? { path: row.path } : {}),
    }
  })
}
