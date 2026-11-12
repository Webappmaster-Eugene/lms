import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { describe, expect, it } from 'vitest'
import { assertModeValues, freezeBody, freezeLine, mergeRules, parseArgs, parseTarget, readAdminCredentials, resolveBaseUrl, StudentsCliError } from '../../scripts/lms-students.mjs'

type MergedRule = { effect: string; target: { relationTo: string; value: number } }
const rule = (relationTo: string, value: number, effect = 'allow', extra = {}) => ({ id: value, target: { relationTo, value }, effect, startsAt: null, expiresAt: null, note: '', ...extra })

describe('разбор целей и аргументов', () => {
  it('понимает все виды целей по стабильным ключам', () => {
    expect(parseTarget('roadmap:frontend-react')).toMatchObject({ collection: 'roadmaps', field: 'slug', value: 'frontend-react' })
    expect(parseTarget('course:sql-postgresql')).toMatchObject({ collection: 'courses', field: 'slug' })
    expect(parseTarget('section:15')).toMatchObject({ collection: 'sections', field: 'id', value: '15' })
    expect(parseTarget('lesson:urok-1')).toMatchObject({ collection: 'lessons', field: 'slug' })
    expect(parseTarget('topic:be-sql')).toMatchObject({ collection: 'roadmap-nodes', field: 'nodeId' })
    expect(parseTarget('trainer-topic:sql-1')).toMatchObject({ collection: 'trainer-topics' })
    expect(parseTarget('trainer-task:task')).toMatchObject({ collection: 'trainer-tasks' })
    expect(parseTarget('guide:linkedin')).toMatchObject({ collection: 'guides' })
  })

  it.each(['frontend', ':x', 'roadmap:', 'unknown:x', 'section:abc', '__proto__:x', 'constructor:x'])('отклоняет цель «%s»', (raw) => {
    expect(() => parseTarget(raw)).toThrow(StudentsCliError)
  })

  it('собирает повторяющиеся параметры и флаги, отклоняет неизвестные', () => {
    expect(parseArgs(['a@b.c', 'Имя', '--allow', 'roadmap:x', '--allow', 'course:y', '--dry-run'])).toEqual({ positional: ['a@b.c', 'Имя'], options: { allow: ['roadmap:x', 'course:y'], deny: [], 'dry-run': true } })
    expect(() => parseArgs(['--password', 'secret'])).toThrow(StudentsCliError)
    expect(() => parseArgs(['--allow'])).toThrow(StudentsCliError)
    expect(() => parseArgs(['--allow', '--dry-run'])).toThrow(StudentsCliError)
  })
})

describe('значения режимов', () => {
  it('принимает допустимые и отклоняет неверные до обращения к серверу', () => {
    expect(() => assertModeValues({ access: 'all', catalog: 'assigned', trainer: 'disabled', guides: 'all' })).not.toThrow()
    expect(() => assertModeValues({ allow: [], deny: [] })).not.toThrow()
    expect(() => assertModeValues({ access: 'foo' })).toThrow(StudentsCliError)
    expect(() => assertModeValues({ trainer: 'all ' })).toThrow(StudentsCliError)
  })
})

describe('слияние правил', () => {
  it('добавляет новое правило и не дублирует цель', () => {
    const next = mergeRules([rule('roadmaps', 1)], [{ effect: 'allow', relationTo: 'roadmaps', value: 1, title: 'Карта' }, { effect: 'allow', relationTo: 'courses', value: 2, title: 'Курс' }])
    expect(next.map((item: MergedRule) => `${item.effect} ${item.target.relationTo}:${item.target.value}`)).toEqual(['allow roadmaps:1', 'allow courses:2'])
  })

  it('меняет действие, сохраняя id, срок и комментарий, и не мутирует исходное', () => {
    const original = [rule('courses', 2, 'allow', { note: 'важно', expiresAt: '2030-01-01T00:00:00Z' })]
    const next = mergeRules(original, [{ effect: 'deny', relationTo: 'courses', value: 2, title: 'Курс' }])
    expect(next[0]).toMatchObject({ id: 2, effect: 'deny', note: 'важно', expiresAt: '2030-01-01T00:00:00Z' })
    expect(original[0].effect).toBe('allow')
  })

  it('удаляет только указанную цель, отсутствующую пропускает', () => {
    const next = mergeRules([rule('courses', 2), rule('lessons', 2)], [{ effect: 'remove', relationTo: 'courses', value: 2 }, { effect: 'remove', relationTo: 'courses', value: 9 }])
    expect(next.map((item: MergedRule) => item.target.relationTo)).toEqual(['lessons'])
  })
})

describe('адрес платформы', () => {
  it('по умолчанию прод, локальный http разрешён', () => {
    expect(resolveBaseUrl(undefined)).toBe('https://learn.mentorcareer.ru')
    expect(resolveBaseUrl('http://localhost:4030/')).toBe('http://localhost:4030')
    expect(resolveBaseUrl('https://stand.example/')).toBe('https://stand.example')
  })

  it.each(['http://learn.mentorcareer.ru', 'http://localhost.evil.example', 'ftp://localhost', 'не адрес'])('не отправит пароль на «%s»', (raw) => {
    expect(() => resolveBaseUrl(raw)).toThrow(StudentsCliError)
  })
})

describe('учётка администратора', () => {
  it('окружение важнее файла', () => {
    expect(readAdminCredentials({ LMS_ADMIN_EMAIL: 'a@b.c', LMS_ADMIN_PASSWORD: 'p' }, '/nonexistent')).toEqual({ email: 'a@b.c', password: 'p' })
  })

  it('разбирает только нужные строки и не обрезает пароль', () => {
    const dir = mkdtempSync(join(tmpdir(), 'lms-students-'))
    try {
      const file = join(dir, 'info.txt')
      writeFileSync(file, 'OTHER=чужое\nADMIN_EMAIL=a@b.c\nADMIN_PASSWORD=p=a ss\n')
      expect(readAdminCredentials({ LMS_INFO_FILE: file }, dir)).toEqual({ email: 'a@b.c', password: 'p=a ss' })
      writeFileSync(file, 'OTHER=чужое\n')
      expect(() => readAdminCredentials({ LMS_INFO_FILE: file }, dir)).toThrow('нет строк')
    } finally { rmSync(dir, { recursive: true, force: true }) }
  })

  it('без файла называет, что задать, не падая необъяснимо', () => {
    expect(() => readAdminCredentials({ LMS_INFO_FILE: '/nonexistent/info.txt' }, '/')).toThrow('LMS_ADMIN_EMAIL')
  })
})

describe('заморозка из командной строки', () => {
  const body = (command: string, argv: string[]) => freezeBody(command, parseArgs(argv).options)

  it('по умолчанию месяц и отпуск; срок, дата, причина и заметка передаются как на экране', () => {
    expect(body('freeze', ['a@b.c'])).toEqual({ action: 'freeze', term: '1m', reason: 'vacation' })
    expect(body('freeze', ['a@b.c', '--for', 'forever', '--reason', 'no-contact', '--note', 'Пропал'])).toEqual({ action: 'freeze', term: 'forever', reason: 'no-contact', note: 'Пропал' })
    expect(body('freeze', ['a@b.c', '--until', '2027-01-15'])).toEqual({ action: 'freeze', term: 'date', until: '2027-01-15', reason: 'vacation' })
  })

  it('неверные значения отклоняются до входа на прод', () => {
    expect(() => body('freeze', ['--for', '2w'])).toThrow(StudentsCliError)
    expect(() => body('freeze', ['--for', '1m', '--until', '2027-01-15'])).toThrow(StudentsCliError)
    expect(() => body('freeze', ['--until', '15.01.2027'])).toThrow(StudentsCliError)
    expect(() => body('freeze', ['--reason', 'term'])).toThrow(StudentsCliError)
    expect(() => body('unfreeze', ['--next', 'soon'])).toThrow(StudentsCliError)
    expect(() => body('plan', [])).toThrow(StudentsCliError)
  })

  it('разморозка и плановая дата', () => {
    expect(body('unfreeze', [])).toEqual({ action: 'unfreeze', next: '6m' })
    expect(body('unfreeze', ['--next', 'none'])).toEqual({ action: 'unfreeze', next: 'none' })
    expect(body('plan', ['--date', '2027-05-12'])).toEqual({ action: 'plan', date: '2027-05-12' })
    expect(body('plan', ['--date', 'none'])).toEqual({ action: 'plan', date: null })
  })

  it('строка состояния', () => {
    const freeze = { active: false, since: null, endsAt: null, frozenUntil: null, reason: null, note: null, plannedAt: '2027-05-12T09:00:00.000Z' }
    expect(freezeLine({ isTestStudent: false, freeze })).toBe('Доступ до 12.05.2027')
    expect(freezeLine({ isTestStudent: true, freeze: { ...freeze, plannedAt: null } })).toBe('Доступ без срока, тестовый ученик')
    expect(freezeLine({ isTestStudent: false, freeze: { ...freeze, active: true, endsAt: '2026-12-11T21:00:00.000Z', frozenUntil: '2026-12-11T21:00:00.000Z', reason: 'vacation' } })).toBe('Заморожен до 12.12.2026 (vacation)')
  })
})
