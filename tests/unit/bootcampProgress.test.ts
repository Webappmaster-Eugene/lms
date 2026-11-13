import { readdirSync, readFileSync } from 'node:fs'
import { fileURLToPath } from 'node:url'
import { describe, expect, it } from 'vitest'

import { FIRST_STREAM, parseVerdict, scheduleLag, weekCell, weekFromBranch, type SubmissionFacts } from '@/lib/bootcamp-progress'
import { gitlabTime } from '@/server/bootcamp-submissions'

const DAY = 86_400_000
const now = Date.parse('2027-03-01T12:00:00.000Z')
const ago = (days: number) => new Date(now - days * DAY).toISOString()

// Тот же формат, что пишет бот проверки (reference/ops/grading/lib/summary.ts).
const report = (headline: string, extra = 'Коммит `5d1444952459`, попытка 2. Прошло проверок: 24 из 26.', marker = '<!-- grader:03:5d144495245925e03934d5445e6f059c9b19c79d -->') => [
  marker, `**Доверенная проверка: ${headline}**`, '', extra, '', '| Проверка | Итог | Прошло | Задание |', '|---|---|---|---|',
].join('\n')

const mr = (extra: Partial<SubmissionFacts> = {}): SubmissionFacts => ({
  mrIid: 1, mrUrl: 'https://git.test/mr/1', openedAt: ago(6), lastCommitAt: null, pipelineStatus: null, pipelineAt: null,
  verdict: null, checksPassed: null, checksTotal: null, verdictAt: null, mergedAt: null, closedAt: null, ...extra,
})

describe('неделя из ветки и вердикт бота', () => {
  it('сдача - только ветка week-NN в пределах 20 недель', () => {
    expect(weekFromBranch('week-03')).toBe(3)
    expect(weekFromBranch('week-20')).toBe(20)
    expect(weekFromBranch('materials-week-03')).toBeNull()
    expect(weekFromBranch('week-21')).toBeNull()
    expect(weekFromBranch('main')).toBeNull()
    expect(weekFromBranch(null)).toBeNull()
  })

  it('разбирает итог, счёт и попытку - с дефисом и с прежним длинным тире', () => {
    expect(parseVerdict(report('неделя 3 - пройдена'))).toEqual({ week: 3, verdict: 'passed', checksPassed: 24, checksTotal: 26, attempt: 2 })
    expect(parseVerdict(report('неделя 3 — не пройдена'))?.verdict).toBe('failed')
    expect(parseVerdict(report('неделя 3 - не выполнена целиком - не зачтено'))?.verdict).toBe('not-run')
    expect(parseVerdict(report('неделя 3 - не завершилась из-за сбоя инфраструктуры - будет повтор'))?.verdict).toBe('infra')
  })

  it('входное задание, текст без метки и чужой комментарий - не вердикт недели', () => {
    expect(parseVerdict(report('входное задание - пройдена', '', '<!-- grader:entry:5d144495245925e03934d5445e6f059c9b19c79d -->'))).toBeNull()
    expect(parseVerdict('Доверенная проверка: неделя 1 - пройдена')).toBeNull()
    expect(parseVerdict('Поправь тесты, пожалуйста')).toBeNull()
  })

  it('время события GitLab читается в обоих форматах', () => {
    expect(gitlabTime('2027-03-01 09:15:00 UTC')).toBe('2027-03-01T09:15:00.000Z')
    expect(gitlabTime('2027-03-01T09:15:00.000Z')).toBe('2027-03-01T09:15:00.000Z')
    expect(Math.abs(Date.parse(gitlabTime(undefined)) - Date.now())).toBeLessThan(5_000)
  })
})

describe('состояние недели', () => {
  const due = ago(-3)

  it('без сдачи: не начата, после срока - просрочена', () => {
    expect(weekCell(1, [], due, now)).toMatchObject({ state: 'none', late: false })
    expect(weekCell(1, [], ago(1), now)).toMatchObject({ state: 'none', late: true })
  })

  it('MR проходит путь: открыт, CI упал, новые коммиты на проверке, проверка не пройдена, ждёт ревью', () => {
    expect(weekCell(1, [mr()], due, now).state).toBe('open')
    expect(weekCell(1, [mr({ pipelineStatus: 'failed', pipelineAt: ago(5) })], due, now).state).toBe('ci-failed')
    expect(weekCell(1, [mr({ pipelineStatus: 'failed', pipelineAt: ago(5), lastCommitAt: ago(4) })], due, now).state).toBe('checking')
    expect(weekCell(1, [mr({ verdict: 'failed', verdictAt: ago(3), lastCommitAt: ago(4) })], due, now).state).toBe('failed-check')
    expect(weekCell(1, [mr({ verdict: 'passed', verdictAt: ago(1), checksPassed: 26, checksTotal: 26 })], due, now)).toMatchObject({ state: 'review', overdue: false, checks: '26 из 26' })
  })

  it('ревью дольше 3 дней помечается, новые коммиты после вердикта снова ждут проверки', () => {
    expect(weekCell(1, [mr({ verdict: 'passed', verdictAt: ago(3.5) })], due, now)).toMatchObject({ state: 'review', overdue: true })
    expect(weekCell(1, [mr({ verdict: 'passed', verdictAt: ago(3.5), lastCommitAt: ago(1) })], due, now)).toMatchObject({ state: 'checking', overdue: false })
  })

  it('слитый MR принимает неделю, даже если рядом открыт другой; слитая после срока - с отметкой', () => {
    const merged = mr({ mrIid: 1, mergedAt: ago(2) })
    const fresh = mr({ mrIid: 2, openedAt: ago(1) })
    expect(weekCell(1, [fresh, merged], due, now)).toMatchObject({ state: 'accepted', since: ago(2), late: false })
    expect(weekCell(1, [merged], ago(4), now)).toMatchObject({ state: 'accepted', late: true })
  })

  it('закрытый без слияния MR не мешает новому открытому', () => {
    const closed = mr({ mrIid: 1, closedAt: ago(3) })
    expect(weekCell(1, [closed], due, now).state).toBe('closed')
    expect(weekCell(1, [closed, mr({ mrIid: 2, openedAt: ago(2) })], due, now)).toMatchObject({ state: 'open', mrUrl: 'https://git.test/mr/1' })
  })

  it('отставание - недели со сроком в прошлом, которые не приняты', () => {
    const cells = [
      weekCell(1, [mr({ mergedAt: ago(5) })], ago(4), now),
      weekCell(2, [mr({ verdict: 'passed', verdictAt: ago(1) })], ago(2), now),
      weekCell(3, [], ago(-5), now),
    ]
    expect(scheduleLag(cells, now)).toEqual({ planned: 2, accepted: 1, lag: 1 })
  })
})

describe('календарь первого потока', () => {
  it('20 недель, сроки - начало следующей пары встреч по Москве, праздничная пара +1 день', () => {
    expect(FIRST_STREAM.weeks).toHaveLength(20)
    expect(FIRST_STREAM.startsAt).toBe('2027-02-12T21:00:00.000Z')
    expect(FIRST_STREAM.weeks.find((item) => item.week === 1)?.dueAt).toBe('2027-02-20T21:00:00.000Z')
    expect(FIRST_STREAM.weeks.find((item) => item.week === 8)?.dueAt).toBe('2027-03-13T21:00:00.000Z')
    expect(FIRST_STREAM.weeks.find((item) => item.week === 20)?.dueAt).toBe('2027-05-14T21:00:00.000Z')
  })

  it('миграция создаёт первый поток с теми же сроками, что календарь в коде', () => {
    const folder = fileURLToPath(new URL('../../src/migrations/', import.meta.url))
    const name = readdirSync(folder).find((file) => file.endsWith('_bootcamp_week_progress.ts'))
    expect(name).toBeDefined()
    const source = readFileSync(`${folder}/${name}`, 'utf8')
    expect(source).toContain(FIRST_STREAM.startsAt)
    for (const { week, dueAt } of FIRST_STREAM.weeks) expect(source).toContain(`(${week}, '${dueAt}')`)
  })
})
