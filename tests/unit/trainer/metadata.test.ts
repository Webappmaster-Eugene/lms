import { describe, expect, it } from 'vitest'
import { TRAINER_CATALOG } from '@/data/trainer'
import { flattenCatalog } from '@/data/trainer/types'
import { companyEvidence, validateCompanyEvidence, safeSourceUrl } from '@/lib/trainer/metadata'
import { TAG_LABELS, COMPANY_LABELS } from '@/lib/trainer/constants'

describe('метаданные каталога', () => {
  it('каждая старая и новая задача имеет сложность, темы и формат', () => {
    for (const { task } of flattenCatalog(TRAINER_CATALOG)) {
      expect(task.tags?.length, task.slug).toBeGreaterThan(0)
      for (const tag of task.tags ?? []) expect(TAG_LABELS[tag], task.slug).toBeTruthy()
      expect(['easy', 'medium', 'hard'], task.slug).toContain(task.difficulty)
      expect(task.interviewFormat, task.slug).toBeTruthy()
      expect(task.recommendedMinutes, task.slug).toBeGreaterThanOrEqual(5)
      expect(task.recommendedMinutes, task.slug).toBeLessThanOrEqual(180)
      expect(validateCompanyEvidence(task.companyEvidence), task.slug).toBe(true)
      const sources = companyEvidence(task.companyEvidence)
      expect(sources.map((row) => row.company), task.slug).toEqual(task.companies ?? [])
      for (const source of sources) {
        expect(COMPANY_LABELS[source.company], task.slug).toBeTruthy()
        if (source.kind !== 'unverified') expect(safeSourceUrl(source.url), task.slug).toBeTruthy()
      }
    }
  })

  it('старые неподтверждённые атрибуции сохраняются с явной пометкой', () => {
    const task = flattenCatalog(TRAINER_CATALOG).find(({ task }) => task.slug === 'ozon-equal-arrays')?.task
    expect(task?.companies).toContain('ozon')
    expect(task?.companyEvidence).toContainEqual(expect.objectContaining({ company: 'ozon', kind: 'unverified', note: expect.stringContaining('частота неизвестна') }))
    expect(task?.title).not.toContain('Озон:')
  })

  it('официальный пример и общая подготовка остаются разными утверждениями', () => {
    const bySlug = new Map(flattenCatalog(TRAINER_CATALOG).map(({ task }) => [task.slug, task]))
    expect(bySlug.get('is-anagram')?.companyEvidence).toContainEqual(expect.objectContaining({ company: 'yandex', kind: 'official', url: 'https://yandex.ru/jobs/interview/algorithms/' }))
    expect(bySlug.get('create-counter')?.companyEvidence).toContainEqual(expect.objectContaining({ company: 'yandex', kind: 'preparation' }))
    expect(bySlug.get('my-promise-all-settled')?.companyEvidence).toContainEqual(expect.objectContaining({ company: 'yandex', kind: 'candidate-report' }))
  })

  it.each(['javascript:alert(1)', 'data:text/html,abc', '//evil.test/x', 'https://user:pass@example.com/'])('не превращает %s в ссылку источника', (value) => {
    expect(safeSourceUrl(value)).toBeUndefined()
  })

  it('отбрасывает повреждённое JSON и не считает несуществующую дату проверкой', () => {
    const bad = { company: 'avito', kind: 'official', url: 'https://example.com/', note: 'Пример', checkedAt: '2026-02-31' }
    expect(companyEvidence([bad])).toEqual([])
    expect(validateCompanyEvidence([bad])).not.toBe(true)
    expect(companyEvidence({ company: 'avito' })).toEqual([])
  })
})
