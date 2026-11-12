import { describe, expect, it } from 'vitest'

import { addMoscowMonths, formatFreezeDate, freezeNoticeDue, freezeState, frozenLoginMessage, moscowDayInput, moscowDayStart, sessionSurvivesFreeze, type FreezePeriod } from '@/lib/account-freeze'

const now = Date.parse('2026-11-12T12:00:00.000Z')
let nextId = 1
const period = (startsAt: string, endsAt: string | null, extra: Partial<FreezePeriod> = {}): FreezePeriod => ({ id: nextId++, startsAt, endsAt, reason: 'vacation', automatic: false, note: null, ...extra })

describe('состояние заморозки', () => {
  it('без периодов ученик не заморожен и сессии не трогаются', () => {
    expect(freezeState([], now)).toEqual({ active: null, frozenUntil: null, planned: null, cutoff: null })
  })

  it('граница начала включительна, граница конца - нет', () => {
    const atStart = period('2026-11-12T12:00:00.000Z', '2026-12-12T12:00:00.000Z')
    expect(freezeState([atStart], now).active).toBe(atStart)
    const endsNow = period('2026-10-12T12:00:00.000Z', '2026-11-12T12:00:00.000Z')
    expect(freezeState([endsNow], now).active).toBeNull()
  })

  it('бессрочная заморозка держит без даты окончания', () => {
    const forever = period('2026-11-01T00:00:00.000Z', null, { reason: 'no-contact' })
    const state = freezeState([forever], now)
    expect(state.active).toBe(forever)
    expect(state.frozenUntil).toBeNull()
  })

  it('плановая в будущем не замораживает, но видна как ближайшая', () => {
    const planned = period('2027-05-12T09:00:00.000Z', null, { reason: 'term', automatic: true })
    const later = period('2028-01-01T00:00:00.000Z', null)
    const state = freezeState([later, planned], now)
    expect(state.active).toBeNull()
    expect(state.planned).toBe(planned)
    expect(state.cutoff).toBeNull()
  })

  it('идущие встык периоды ученик видит одной заморозкой до конца последнего', () => {
    const vacation = period('2026-11-01T00:00:00.000Z', '2026-12-01T00:00:00.000Z')
    const next = period('2026-12-01T00:00:00.000Z', '2027-01-15T00:00:00.000Z')
    expect(freezeState([vacation, next], now).frozenUntil).toBe('2027-01-15T00:00:00.000Z')
    const tail = period('2027-01-10T00:00:00.000Z', null)
    expect(freezeState([vacation, next, tail], now).frozenUntil).toBeNull()
  })

  it('пустые и битые периоды не действуют', () => {
    expect(freezeState([period('2026-11-01T00:00:00.000Z', '2026-11-01T00:00:00.000Z'), period('not-a-date', null)], now).active).toBeNull()
  })

  it('cutoff - самая поздняя прошедшая отметка: начало или уже наступивший конец', () => {
    const ended = period('2026-09-01T00:00:00.000Z', '2026-10-01T00:00:00.000Z')
    const planned = period('2027-01-01T00:00:00.000Z', null)
    expect(freezeState([ended, planned], now).cutoff).toBe(Date.parse('2026-10-01T00:00:00.000Z'))
    // Миграция ставит начало в прошлое: сессии между началом и разморозкой тоже не оживают.
    const unfrozen = period('2026-08-01T00:00:00.000Z', '2026-11-12T11:00:00.000Z')
    expect(freezeState([unfrozen], now).cutoff).toBe(Date.parse('2026-11-12T11:00:00.000Z'))
  })
})

describe('сессии после заморозки', () => {
  const cutoff = Date.parse('2026-11-01T00:00:00.000Z')
  it('сессия, открытая до или в момент отметки, не оживает', () => {
    expect(sessionSurvivesFreeze({ createdAt: '2026-10-31T23:59:59.000Z' }, cutoff)).toBe(false)
    expect(sessionSurvivesFreeze({ createdAt: '2026-11-01T00:00:00.000Z' }, cutoff)).toBe(false)
    expect(sessionSurvivesFreeze({ createdAt: null }, cutoff)).toBe(false)
  })

  it('новая сессия и любая сессия без заморозок действуют', () => {
    expect(sessionSurvivesFreeze({ createdAt: '2026-11-01T00:00:00.001Z' }, cutoff)).toBe(true)
    expect(sessionSurvivesFreeze({}, null)).toBe(true)
  })
})

describe('сроки по московскому календарю', () => {
  it('добавляет календарные месяцы и прижимает к концу короткого месяца', () => {
    expect(addMoscowMonths('2026-11-12T12:00:00.000Z', 6)).toBe('2027-05-12T12:00:00.000Z')
    expect(addMoscowMonths('2027-01-31T09:00:00.000Z', 1)).toBe('2027-02-28T09:00:00.000Z')
    expect(addMoscowMonths('2027-12-15T09:00:00.000Z', 12)).toBe('2028-12-15T09:00:00.000Z')
  })

  it('день считается по Москве, а не по UTC', () => {
    // 31 января 22:30 UTC - это уже 1 февраля в Москве: плюс месяц даёт 1 марта по Москве.
    expect(addMoscowMonths('2027-01-31T22:30:00.000Z', 1)).toBe('2027-02-28T22:30:00.000Z')
    expect(formatFreezeDate('2026-12-11T21:00:00.000Z')).toBe('12.12.2026')
    expect(moscowDayInput('2026-12-11T21:00:00.000Z')).toBe('2026-12-12')
  })

  it('дата из поля - полночь по Москве; несуществующая дата отклоняется', () => {
    expect(moscowDayStart('2026-12-12')).toBe('2026-12-11T21:00:00.000Z')
    expect(moscowDayStart('2026-02-30')).toBeNull()
    expect(moscowDayStart('12.12.2026')).toBeNull()
  })
})

describe('тексты для ученика', () => {
  it('сообщение при входе называет срок или его отсутствие и что делать', () => {
    expect(frozenLoginMessage('2026-12-11T21:00:00.000Z')).toBe('Доступ к платформе приостановлен до 12.12.2026. Чтобы продолжить обучение, напишите наставнику.')
    expect(frozenLoginMessage(null)).toBe('Доступ к платформе приостановлен. Чтобы продолжить обучение, напишите наставнику.')
  })

  it('плашка появляется за 14 дней до плановой заморозки и не раньше', () => {
    const in14 = period(new Date(now + 14 * 24 * 60 * 60 * 1000).toISOString(), null)
    const in15 = period(new Date(now + 15 * 24 * 60 * 60 * 1000).toISOString(), null)
    expect(freezeNoticeDue(freezeState([in14], now), now)).toBe(true)
    expect(freezeNoticeDue(freezeState([in15], now), now)).toBe(false)
    expect(freezeNoticeDue(freezeState([period('2026-11-01T00:00:00.000Z', null), in14], now), now)).toBe(false)
  })
})
