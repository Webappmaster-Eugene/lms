import { afterEach, describe, expect, it, vi } from 'vitest'

import { DEFAULT_ENTRY_TASK_SET, ENTRY_TASK_SETS, entryTaskSetOf, findTaskInSet } from '@/data/bootcamp-entry/sets'
import { parseBootcampLead } from '@/lib/bootcamp-leads'
import { PROGRAM_KEY_PATTERN, toProgramConfig } from '@/lib/bootcamp-programs'
import { BootcampPrograms } from '@/payload/collections/BootcampPrograms'
import { bootcampEntryTaskEmail } from '@/payload/emails/templates'

const doc = {
  id: 1, key: 'nodejs', title: 'Node.js', shortTitle: 'Node.js', landingUrl: 'https://info.test/', priceKopecks: 4_500_000, paymentDueDays: 7,
  offerUrl: 'https://info.test/offer/', offerVersion: '2026-10-31', receiptItemName: 'Чек', gitlabCourseProject: 'bootcamp/course',
  gitlabStreamGroup: 'nodejs-bootcamp', gradingProject: 'bootcamp-staff/grading', entryTaskSet: 'rental-js',
}

afterEach(() => vi.restoreAllMocks())

describe('программа буткемпа', () => {
  it('курс методичек приходит id или документом, пустой флажок значит «принимает заявки»', () => {
    expect(toProgramConfig({ ...doc, manualsCourse: 5 }).manualsCourseId).toBe(5)
    expect(toProgramConfig({ ...doc, manualsCourse: { id: 6 } }).manualsCourseId).toBe(6)
    expect(toProgramConfig({ ...doc, manualsCourse: null }).manualsCourseId).toBeNull()
    expect(toProgramConfig({ ...doc, isActive: null }).isActive).toBe(true)
    expect(toProgramConfig({ ...doc, isActive: false }).isActive).toBe(false)
  })

  it('ключ программы: латиница с буквы, цифры и дефис, до 40 знаков', () => {
    for (const key of ['nodejs', 'python-2027', 'a']) expect(PROGRAM_KEY_PATTERN.test(key)).toBe(true)
    for (const key of ['NodeJS', '1abc', '-x', 'a_b', 'a'.repeat(41), '']) expect(PROGRAM_KEY_PATTERN.test(key)).toBe(false)
  })

  it('форма принимает любой ключ в формате, есть ли программа - решает сервер', () => {
    const base = { email: 'a@mail.ru', consent: true, consentVersion: '2026-10-31' }
    expect(parseBootcampLead({ ...base, program: 'python' }).program).toBe('python')
    expect(() => parseBootcampLead({ ...base, program: 'Python!' })).toThrow('Такой программы нет')
    expect(() => parseBootcampLead({ ...base })).toThrow('Такой программы нет')
  })

  it('набор задания по умолчанию существует, ключи уникальны, поле программы проверяет ключ', async () => {
    expect(new Set(ENTRY_TASK_SETS.map((set) => set.key)).size).toBe(ENTRY_TASK_SETS.length)
    expect(entryTaskSetOf(DEFAULT_ENTRY_TASK_SET).key).toBe(DEFAULT_ENTRY_TASK_SET)
    for (const set of ENTRY_TASK_SETS) expect(set.tasks.length).toBeGreaterThan(0)
    const field = BootcampPrograms.fields.find((item) => 'name' in item && item.name === 'entryTaskSet') as { validate: (value: unknown) => true | string, defaultValue: string }
    expect(field.defaultValue).toBe(DEFAULT_ENTRY_TASK_SET)
    expect(field.validate('rental-js')).toBe(true)
    expect(field.validate('nope')).toMatch(/Такого набора нет/)
  })

  it('неизвестный набор: задание по умолчанию и предупреждение в журнале', () => {
    const warn = vi.spyOn(console, 'warn').mockImplementation(() => {})
    expect(entryTaskSetOf('removed-set').key).toBe(DEFAULT_ENTRY_TASK_SET)
    expect(warn).toHaveBeenCalledOnce()
    expect(entryTaskSetOf(null).key).toBe(DEFAULT_ENTRY_TASK_SET)
    expect(warn).toHaveBeenCalledOnce()
    const set = entryTaskSetOf(DEFAULT_ENTRY_TASK_SET)
    expect(findTaskInSet(set, set.tasks[0]?.slug ?? '')).toBe(set.tasks[0])
    expect(findTaskInSet(set, 'other')).toBeUndefined()
  })

  it('письмо кандидату описывает задание набора программы', () => {
    const letter = bootcampEntryTaskEmail({ name: null, program: 'Python', url: 'https://lms.test/entry-task/x', dueDate: '8 ноября', reviewDays: 5, minutes: '45-90', summary: 'две задачи на Python', replyable: false })
    expect(letter.subject).toBe('Входное задание буткемпа Python')
    expect(letter.text).toContain('ничего устанавливать не нужно: две задачи на Python, обычно на них уходит 45-90 минут')
  })
})
