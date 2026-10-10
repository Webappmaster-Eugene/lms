export const LANGUAGES = ['go', 'python', 'html', 'react', 'next']
export const MAX_CODE_LENGTH = 20_000
const PRESS_KEYS = ['Enter', 'Escape', 'Space', 'ArrowLeft', 'ArrowRight', 'ArrowUp', 'ArrowDown', 'Home', 'End', 'Tab']

export class InputError extends Error {}

export function parseFiles(code) {
  let files
  try { files = JSON.parse(code) } catch { throw new InputError('Код frontend должен содержать JSON с именами и содержимым файлов') }
  if (!files || Array.isArray(files) || typeof files !== 'object') throw new InputError('Ожидается объект файлов')
  const entries = Object.entries(files)
  if (entries.length === 0 || entries.length > 32) throw new InputError('Допускается от 1 до 32 файлов')
  let size = 0
  for (const [name, content] of entries) {
    if (!/^[a-zA-Z0-9_@()[\].-]+(?:\/[a-zA-Z0-9_@()[\].-]+)*\.(?:html|css|js|jsx|ts|tsx|json)$/.test(name) || name.length > 120 || name.split('/').some((segment) => segment === '.' || segment === '..' || segment.startsWith('.'))) throw new InputError(`Недопустимое имя файла: ${name.slice(0, 120)}`)
    if (typeof content !== 'string') throw new InputError('Содержимое файла должно быть строкой')
    size += content.length
  }
  if (size > MAX_CODE_LENGTH) throw new InputError('Общий размер файлов превышает 20 000 символов')
  return files
}

function validateCheck(check) {
  if (!check || typeof check !== 'object' || typeof check.selector !== 'string' || check.selector.length === 0 || check.selector.length > 500) throw new InputError('У проверки должен быть CSS-селектор')
  if (check.action !== undefined && !['click', 'fill', 'press'].includes(check.action)) throw new InputError('Неизвестное действие проверки')
  if (check.action === 'press' && !PRESS_KEYS.includes(check.value)) throw new InputError('Недопустимая клавиша проверки')
  for (const key of ['value', 'text']) {
    if (check[key] !== undefined && (typeof check[key] !== 'string' || check[key].length > 4000)) throw new InputError('Недопустимое значение проверки')
  }
  if (check.count !== undefined && (!Number.isInteger(check.count) || check.count < 0 || check.count > 10000)) throw new InputError('Недопустимое количество элементов')
  if (check.visible !== undefined && typeof check.visible !== 'boolean') throw new InputError('Недопустимая видимость элемента')
  if (check.attribute !== undefined && (!check.attribute || typeof check.attribute.name !== 'string' || typeof check.attribute.value !== 'string' || check.attribute.name.length > 100 || check.attribute.value.length > 4000)) throw new InputError('Недопустимый атрибут')
  if (check.css !== undefined && (!check.css || typeof check.css !== 'object' || Array.isArray(check.css) || Object.entries(check.css).length > 20 || Object.entries(check.css).some(([key, value]) => key.length > 100 || typeof value !== 'string' || value.length > 500))) throw new InputError('Недопустимые CSS-свойства')
  if (!check.action && check.text === undefined && check.count === undefined && check.visible === undefined && !check.attribute && !check.css) throw new InputError('Проверка не содержит условия')
}

export function validateRequest(raw, preview = false) {
  if (!raw || typeof raw !== 'object' || !LANGUAGES.includes(raw.language)) throw new InputError('Неизвестный язык')
  if (typeof raw.code !== 'string' || raw.code.length > MAX_CODE_LENGTH) throw new InputError('Код превышает 20 000 символов')
  const timeLimitMs = raw.timeLimitMs ?? 2000
  const isProgram = raw.language === 'go' || raw.language === 'python'
  if (!Number.isInteger(timeLimitMs) || timeLimitMs < 100 || timeLimitMs > 10000) throw new InputError('Лимит времени должен быть от 100 до 10000 мс')
  if (preview && isProgram) throw new InputError('Предпросмотр доступен для frontend')
  if (!isProgram) parseFiles(raw.code)
  if (!preview) {
    if (!Array.isArray(raw.cases) || raw.cases.length > 50 || (raw.cases.length === 0 && !(raw.allowNoTests === true && isProgram))) throw new InputError('Нужен хотя бы один тест, максимум 50')
    for (const item of raw.cases) {
      if (!item || typeof item !== 'object' || typeof item.name !== 'string' || item.name.length > 200 || typeof item.hidden !== 'boolean') throw new InputError('Недопустимый тест')
      if (item.viewport !== undefined && (!item.viewport || !Number.isInteger(item.viewport.width) || !Number.isInteger(item.viewport.height) || item.viewport.width < 320 || item.viewport.width > 1920 || item.viewport.height < 240 || item.viewport.height > 1200)) throw new InputError('Недопустимый размер viewport')
      if (isProgram) {
        if (typeof item.expected !== 'string' || item.expected.length > 20000 || (item.input !== undefined && (typeof item.input !== 'string' || item.input.length > 20000))) throw new InputError('Тест программы содержит stdin и ожидаемый stdout')
      } else {
        if (!Array.isArray(item.checks) || item.checks.length === 0 || item.checks.length > 50) throw new InputError('Frontend-тест должен содержать от 1 до 50 проверок')
        item.checks.forEach(validateCheck)
      }
    }
  }
  return { language: raw.language, code: raw.code, timeLimitMs, cases: preview ? [] : raw.cases, allowNoTests: raw.allowNoTests === true, includePreview: raw.includePreview === true }
}
