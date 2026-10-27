import { mkdtempSync, rmSync, writeFileSync } from 'node:fs'
import { tmpdir } from 'node:os'
import { join } from 'node:path'
import { afterAll, afterEach, describe, expect, it } from 'vitest'

import { freeSlots, MAX_SLOT, parseWorktreeList, slotSettings, treeDatabases } from '../../scripts/worktree.mjs'
import { loadWorktreeEnv, parseEnv } from '../../scripts/worktree-env.mjs'
import { integrationDb } from '../integration/setup/constants'

describe('настройки worktree', () => {
  it('слот задаёт свои порты и базу с именем дерева', () => {
    expect(slotSettings(3, 'wt-guides-search')).toEqual({
      WORKTREE_SLOT: '3',
      LMS_INTEGRATION_DB: 'lms_wt3_guides_search',
      E2E_APP_PORT: '4030',
      E2E_LANDING_PORT: '4031',
      VISUAL_APP_PORT: '4032',
      VISUAL_LANDING_PORT: '4033',
    })
  })

  it('порты соседних слотов не пересекаются и не задевают порты основного checkout', () => {
    const ports = freeSlots(new Set()).flatMap((slot) => {
      const settings = slotSettings(slot, 'wt-x')
      return [settings.E2E_APP_PORT, settings.E2E_LANDING_PORT, settings.VISUAL_APP_PORT, settings.VISUAL_LANDING_PORT].map(Number)
    })
    expect(new Set(ports).size).toBe(MAX_SLOT * 4)
    expect(Math.min(...ports)).toBeGreaterThan(3151)
    expect(Math.max(...ports)).toBeLessThan(5000)
  })

  it('имя базы проходит проверку интеграции даже с суффиксами и любым названием папки', () => {
    for (const name of ['wt-Bootcamp Landing!', `wt-${'очень-длинное-'.repeat(3)}${'x'.repeat(80)}`, 'wt-', 'wt-__a__']) {
      const settings = slotSettings(MAX_SLOT, name)
      for (const db of treeDatabases(settings)) {
        expect(integrationDb(db)).toBe(db)
        expect(db.length).toBeLessThanOrEqual(63)
      }
    }
  })

  it('базы дерева: интеграция, её сид и миграции, e2e и скриншоты', () => {
    expect(treeDatabases(slotSettings(1, 'wt-seo'))).toEqual(['lms_wt1_seo', 'lms_wt1_seo_seed', 'lms_wt1_seo_migrations', 'lms_e2e_4010', 'lms_e2e_4012'])
  })

  it('свободным считается наименьший незанятый слот', () => {
    expect(freeSlots(new Set([1, 2, 4])).slice(0, 2)).toEqual([3, 5])
  })

  it('разбирает git worktree list --porcelain', () => {
    const text = [
      'worktree /repo/app', 'HEAD aaa', 'branch refs/heads/main', '',
      'worktree /repo/wt-seo', 'HEAD bbb', 'branch refs/heads/fix/seo-meta', '',
      'worktree /repo/wt-gone', 'HEAD ccc', 'detached', 'prunable gitdir file points to non-existent location', '',
    ].join('\n')
    expect(parseWorktreeList(text)).toEqual([
      { path: '/repo/app', head: 'aaa', branch: 'main' },
      { path: '/repo/wt-seo', head: 'bbb', branch: 'fix/seo-meta' },
      { path: '/repo/wt-gone', head: 'ccc', prunable: true },
    ])
  })
})

describe('.worktree.env', () => {
  const dir = mkdtempSync(join(tmpdir(), 'lms-worktree-env-'))
  const keys = ['LMS_WT_TEST_A', 'LMS_WT_TEST_B']
  afterEach(() => keys.forEach((key) => delete process.env[key]))
  afterAll(() => rmSync(dir, { recursive: true, force: true }))

  it('пропускает комментарии и пустые строки, понимает CRLF', () => {
    expect(parseEnv('# заголовок\r\n\r\nA=1\r\n  B = два  \r\nlower=нет\r\n')).toEqual({ A: '1', B: 'два' })
  })

  it('явно заданная переменная главнее файла', () => {
    const file = join(dir, 'explicit.env')
    writeFileSync(file, 'LMS_WT_TEST_A=из файла\nLMS_WT_TEST_B=из файла\n')
    process.env.LMS_WT_TEST_A = 'явно'
    loadWorktreeEnv(file)
    expect(process.env.LMS_WT_TEST_A).toBe('явно')
    expect(process.env.LMS_WT_TEST_B).toBe('из файла')
  })

  it('без файла ничего не меняет', () => {
    expect(loadWorktreeEnv(join(dir, 'нет.env'))).toEqual({})
  })
})
