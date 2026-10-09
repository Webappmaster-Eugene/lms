import { describe, expect, it } from 'vitest'
import { AssignmentInputError, storedAssignmentTarget, validateAssignmentInput } from '@/components/learning-access/contracts'

const rule = { target: { relationTo: 'roadmaps', value: 1 }, effect: 'allow', startsAt: null, expiresAt: null, note: '' }
const input = { userId: 34, revision: 'a'.repeat(64), mode: 'assigned', rules: [rule] }

describe('проверка назначения обучения', () => {
  it('оставляет опущенные настройки неопределёнными для совместимого сохранения', () => {
    expect(validateAssignmentInput(input)).not.toHaveProperty('catalogVisibility')
    expect(validateAssignmentInput(input)).not.toHaveProperty('trainerMode')
  })
  it.each(['catalog', 'assigned'])('принимает видимость %s', (catalogVisibility) => {
    expect(validateAssignmentInput({ ...input, catalogVisibility })).toMatchObject({ catalogVisibility })
  })
  it.each(['all', 'assigned', 'disabled'])('принимает режим тренажёра %s', (trainerMode) => {
    expect(validateAssignmentInput({ ...input, trainerMode })).toMatchObject({ trainerMode })
  })
  it.each([null, '', 'hidden', true, {}, ['assigned']])('отвергает невалидные настройки %s', (value) => {
    expect(() => validateAssignmentInput({ ...input, catalogVisibility: value })).toThrow('видимость')
    expect(() => validateAssignmentInput({ ...input, trainerMode: value })).toThrow('тренажёру')
  })
  it.each(['trainer-topics', 'trainer-tasks'])('принимает назначение %s', (relationTo) => {
    expect(validateAssignmentInput({ ...input, rules: [{ ...rule, target: { relationTo, value: 9 } }] }).rules[0].target).toEqual({ relationTo, value: 9 })
  })

  it('принимает исключения, нормализует даты и комментарии', () => {
    expect(validateAssignmentInput({ ...input, rules: [{ ...rule, id: 7, effect: 'deny', startsAt: '2030-01-01T12:00:00+03:00', note: '  Частный урок  ' }] })).toMatchObject({ rules: [{ id: 7, effect: 'deny', startsAt: '2030-01-01T09:00:00.000Z', note: 'Частный урок' }] })
  })
  it.each([0, -1, 1.5, '34', true, null, 2147483648])('отвергает неоднозначный userId %s', (userId) => {
    expect(() => validateAssignmentInput({ ...input, userId })).toThrow()
  })
  it('не разрешает несколько противоречивых правил на один материал', () => {
    expect(() => validateAssignmentInput({ ...input, rules: [rule, { ...rule, effect: 'deny' }] })).toThrow('уже есть назначение')
  })
  it('не разрешает повторять ID между разными целями', () => {
    expect(() => validateAssignmentInput({ ...input, rules: [{ ...rule, id: 1 }, { ...rule, id: 1, target: { relationTo: 'courses', value: 2 } }] })).toThrow('дважды')
  })
  it.each(['media', 'users', '__proto__'])('не разрешает назначать коллекцию %s', (relationTo) => {
    expect(() => validateAssignmentInput({ ...input, rules: [{ ...rule, target: { relationTo, value: 1 } }] })).toThrow()
  })
  it('проверяет срок, формат версии и ограничение количества правил', () => {
    expect(() => validateAssignmentInput({ ...input, revision: '' })).toThrow('Обновите')
    expect(() => validateAssignmentInput({ ...input, rules: [{ ...rule, startsAt: '2030-02-01', expiresAt: '2030-01-01' }] })).toThrow('позже')
    expect(() => validateAssignmentInput({ ...input, rules: Array(301).fill(rule) })).toThrow('300')
    expect(() => validateAssignmentInput({ ...input, rules: [{ ...rule, note: 'a'.repeat(1001) }] })).toThrow('1000')
  })
})


describe('историческая пустая цель назначения', () => {
  it.each([null, undefined, {}, { relationTo: 'trainer-tasks', value: null }, { relationTo: 'trainer-topics', value: { id: null } }, { relationTo: 'users', value: 1 }])('отказывает безопасно и предлагает ручное восстановление для %j', (target) => {
    expect(() => storedAssignmentTarget(target)).toThrow(AssignmentInputError)
    try { storedAssignmentTarget(target) } catch (error) { expect(error).toMatchObject({ status: 409, code: 'orphaned-assignment' }) }
  })
  it('сохраняет действительную цель, включая populated relation, без пропуска правила', () => {
    expect(storedAssignmentTarget({ relationTo: 'trainer-tasks', value: { id: 42, title: 'Задача' } })).toEqual({ relationTo: 'trainer-tasks', value: 42 })
  })
})
