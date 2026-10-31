import { ENTRY_TASK_MINUTES, ENTRY_TASKS, type EntryTask } from '@/data/bootcamp-entry/tasks'

/**
 * Наборы входного задания. Задачи живут в коде, а не в CMS: эталонные решения рядом с
 * тестами, и каталог проверяется тем же тестом, что эталон проходит, а заготовка нет.
 * Программа буткемпа в CMS выбирает набор по ключу.
 */
export type EntryTaskSet = {
  key: string
  /** Название в списке выбора CMS. */
  label: string
  minutes: string
  /** Для письма кандидату: «…ничего устанавливать не нужно: {summary}, обычно…». */
  summary: string
  /** Для страницы задания: «Здесь {intro}: на них обычно уходит…». */
  intro: string
  tasks: readonly EntryTask[]
}

export const ENTRY_TASK_SETS: readonly EntryTaskSet[] = [
  {
    key: 'rental-js',
    label: 'Три функции JavaScript про прокат',
    minutes: ENTRY_TASK_MINUTES,
    summary: 'три небольшие функции на JavaScript',
    intro: 'три небольшие задачи на JavaScript из жизни проката инструментов',
    tasks: ENTRY_TASKS,
  },
]

export const DEFAULT_ENTRY_TASK_SET = 'rental-js'

export function findEntryTaskSet(key: string | null | undefined): EntryTaskSet | undefined {
  return ENTRY_TASK_SETS.find((set) => set.key === key)
}

/**
 * Набор программы. Неизвестный ключ (набор убрали из кода, а программа на него ещё
 * ссылается) - набор по умолчанию с предупреждением в журнале: кандидат не должен
 * остаться без задания.
 */
export function entryTaskSetOf(key: string | null | undefined): EntryTaskSet {
  const found = findEntryTaskSet(key)
  if (found) return found
  if (key) console.warn(`[bootcamp] набора входного задания «${key}» нет в коде, взят ${DEFAULT_ENTRY_TASK_SET}`)
  return findEntryTaskSet(DEFAULT_ENTRY_TASK_SET) as EntryTaskSet
}

export function findTaskInSet(set: EntryTaskSet, slug: string): EntryTask | undefined {
  return set.tasks.find((task) => task.slug === slug)
}
