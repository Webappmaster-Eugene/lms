import type { ReplyTemplate } from '@/payload-types'

export type ReplyTemplateItem = Pick<ReplyTemplate, 'id' | 'title' | 'content' | 'usageCount'>

/** Что подставляется в заготовку в конкретной ветке. */
export type TemplateValues = { name?: string | null; lesson?: string | null }

export const TEMPLATE_TITLE_MAX = 80

const PLACEHOLDER = /\{(имя|урок)\}/giu

/**
 * {имя} и {урок} заменяются значениями ветки. Нет значения (урок снят, ученик
 * удалён) - метка остаётся в тексте: ментор увидит её в поле до отправки.
 */
export function fillTemplate(content: string, values: TemplateValues): string {
  return content.replace(PLACEHOLDER, (match, key: string) => {
    const value = (key.toLowerCase() === 'имя' ? values.name : values.lesson)?.trim()
    return value || match
  })
}

const escapeRegExp = (value: string) => value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&')

/**
 * Обратная подстановка для «Сохранить как заготовку»: имя ученика и название
 * урока становятся метками, иначе заготовка ушла бы другим ученикам с чужим
 * именем. Имя - только целым словом: «Ян» не должно съесть «Январь».
 */
export function templateFromText(text: string, values: TemplateValues): string {
  let result = text
  const lesson = values.lesson?.trim()
  if (lesson) result = result.replaceAll(lesson, '{урок}')
  const name = values.name?.trim()
  if (name) result = result.replace(new RegExp(`(?<![\\p{L}\\p{N}])${escapeRegExp(name)}(?![\\p{L}\\p{N}])`, 'gu'), '{имя}')
  return result
}

const normalize = (value: string) => value.toLowerCase().replaceAll('ё', 'е')

const byUsage = (a: ReplyTemplateItem, b: ReplyTemplateItem) =>
  (b.usageCount ?? 0) - (a.usageCount ?? 0) || a.title.localeCompare(b.title, 'ru')

/**
 * Поиск по словам в названии и тексте. Совпадение в названии выше совпадения
 * только в тексте, дальше частые заготовки выше редких.
 */
export function matchTemplates<T extends ReplyTemplateItem>(items: readonly T[], query: string): T[] {
  const words = normalize(query).split(/\s+/).filter(Boolean)
  const inTitle = (item: T) => words.every((word) => normalize(item.title).includes(word))
  return items
    .filter((item) => words.every((word) => normalize(`${item.title}\n${item.content}`).includes(word)))
    .sort((a, b) => Number(inTitle(b)) - Number(inTitle(a)) || byUsage(a, b))
}

/** Название по умолчанию для «Сохранить как заготовку»: первая непустая строка текста. */
export function suggestTemplateTitle(content: string, max = 60): string {
  const line = content.split('\n').map((part) => part.trim()).find(Boolean) ?? ''
  return line.length > max ? `${line.slice(0, max - 1).trimEnd()}…` : line
}

/** Примеры для пустого списка: владелец добавляет их кнопкой и правит под себя. */
export const STARTER_TEMPLATES: readonly { title: string; content: string }[] = [
  {
    title: 'Нужен код целиком',
    content: '{имя}, пришлите, пожалуйста, код целиком - блоком, кнопкой «Код». И текст ошибки полностью, как в консоли. По одному куску не видно, где ломается.',
  },
  {
    title: 'Что уже пробовали',
    content: '{имя}, напишите, что вы уже пробовали и что из этого вышло. Так я не стану советовать то, что вы уже проверили.',
  },
  {
    title: 'Это есть в уроке',
    content: 'Это разобрано в уроке «{урок}». Посмотрите этот момент ещё раз. Если после него что-то останется неясным - напишите, что именно.',
  },
  {
    title: 'Закройте вопрос, если помогло',
    content: 'Если ответ помог - нажмите «Вопрос решён» под вопросом. Если нет - напишите, что осталось неясным, разберёмся.',
  },
]
