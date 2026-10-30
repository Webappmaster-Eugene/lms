import { describe, expect, it } from 'vitest'

import { EnrollmentInputError, initialSteps, mergeSteps, parseEnrollmentInput, readSteps, splitName, suggestUsername } from '@/lib/bootcamp-enrollment'

const NOW = new Date('2026-10-30T12:00:00Z')
const valid = { firstName: ' Иван ', lastName: 'Петров', username: 'ivan.petrov', group: 'nodejs-2027-1', accessUntil: '' }

describe('форма зачисления', () => {
  it('принимает обычные значения и обрезает пробелы', () => {
    expect(parseEnrollmentInput(valid, NOW)).toEqual({ firstName: 'Иван', lastName: 'Петров', username: 'ivan.petrov', group: 'nodejs-2027-1', accessUntil: null })
  })

  it('срок доступа - конец дня по Москве, прошедший не принимается', () => {
    expect(parseEnrollmentInput({ ...valid, accessUntil: '2027-03-01' }, NOW).accessUntil).toBe('2027-03-01T20:59:59.999Z')
    expect(() => parseEnrollmentInput({ ...valid, accessUntil: '2026-10-29' }, NOW)).toThrow('уже прошёл')
    expect(() => parseEnrollmentInput({ ...valid, accessUntil: '01.03.2027' }, NOW)).toThrow(EnrollmentInputError)
  })

  it('логин и группа - по правилам GitLab, имя не пустое', () => {
    for (const username of ['Ivan', 'a', 'ivan petrov', '-ivan', 'ivan.git', 'иван']) {
      expect(() => parseEnrollmentInput({ ...valid, username }, NOW), username).toThrow('Логин GitLab')
    }
    expect(() => parseEnrollmentInput({ ...valid, group: 'Nodejs' }, NOW)).toThrow('Группа потока')
    expect(() => parseEnrollmentInput({ ...valid, lastName: '  ' }, NOW)).toThrow('Фамилия')
    expect(() => parseEnrollmentInput(null, NOW)).toThrow('объект JSON')
  })

  it('подсказки из заявки: логин из почты, имя и фамилия из одной строки', () => {
    expect(suggestUsername('James.Numart+bootcamp@gmail.com')).toBe('james.numart-bootcamp')
    expect(suggestUsername('..@mail.ru')).toBe('')
    expect(splitName('  Иван   Петров Сидорович ')).toEqual({ firstName: 'Иван', lastName: 'Петров Сидорович' })
    expect(splitName(null)).toEqual({ firstName: '', lastName: '' })
  })

  it('отчёт исполнителя меняет только шаги GitLab, мусор в шагах отбрасывается', () => {
    const lmsDone = initialSteps().map((step) => step.key.startsWith('lms_') ? { ...step, state: 'done' as const } : step)
    const merged = mergeSteps(lmsDone, [{ key: 'lms_account', state: 'failed' }, { key: 'gitlab_user', state: 'done', detail: 'создана' }])
    expect(merged.find((step) => step.key === 'lms_account')?.state).toBe('done')
    expect(merged.find((step) => step.key === 'gitlab_user')).toEqual({ key: 'gitlab_user', state: 'done', detail: 'создана' })
    expect(readSteps([{ key: 'nope', state: 'done' }, { key: 'gitlab_member', state: 'weird' }, 'x']).every((step) => step.state === 'pending')).toBe(true)
    expect(readSteps(null)).toHaveLength(7)
  })
})
