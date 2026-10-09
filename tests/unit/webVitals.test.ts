import { describe, expect, it } from 'vitest'
import { WebVitalsReports } from '@/payload/collections/WebVitalsReports'
import { webVitalReportKey, webVitalRoute, webVitalsInput } from '@/server/web-vitals'

const base = { expectedUserId: 17, path: '/lessons/private-lesson', metric: { name: 'LCP', value: 2500, id: 'v5-page-id', navigationType: 'navigate' } }

describe('authenticated web vitals input and privacy', () => {
  it('accepts actual Web Vitals values and retains only a bounded route template', () => {
    expect(webVitalsInput(base)).toEqual({ expectedUserId: 17, routeTemplate: '/lessons/[slug]', metric: base.metric })
    expect(webVitalsInput({ expectedUserId: 17, metric: { name: 'CLS', value: 0.12, id: 'v5-1', navigationType: 'soft-navigation' } }).routeTemplate).toBe('other')
  })

  it.each([
    ['/', '/'], ['/courses/node-backend', '/courses/[slug]'], ['/roadmaps/devops', '/roadmaps/[slug]'],
    ['/trainer/javascript/task-12', '/trainer/[topic]/[task]'], ['/certificates/234', '/certificates/[id]'],
    ['/unrecognized/private-value', 'other'],
  ])('normalizes %s without retaining dynamic IDs', (path, expected) => {
    expect(webVitalRoute(path)).toBe(expected)
  })

  it.each(['https://learn.example/lessons/one', '//foreign.example/path', '/lessons/one?token=secret', '/profile#password', '/notes%3Ftoken-secret', 'private-notes'])('rejects raw URLs/query/fragments: %s', (path) => {
    expect(() => webVitalsInput({ ...base, path })).toThrow()
  })

  it.each([
    { ...base, user: 99 }, { ...base, expectedUserId: '17' }, { ...base, expectedUserId: 0 },
    { ...base, metric: { ...base.metric, name: 'TTFB' } },
    { ...base, metric: { ...base.metric, value: -1 } },
    { ...base, metric: { ...base.metric, value: Number.NaN } },
    { ...base, metric: { ...base.metric, value: Number.POSITIVE_INFINITY } },
    { ...base, metric: { ...base.metric, value: 600001 } },
    { ...base, metric: { ...base.metric, name: 'CLS', value: 100.01 } },
    { ...base, metric: { ...base.metric, id: 'payload-token=secret' } },
    { ...base, metric: { ...base.metric, id: 'x'.repeat(81) } },
    { ...base, metric: { ...base.metric, entries: ['private notes'] } },
    { ...base, metric: { ...base.metric, navigationType: 'unknown' } },
  ])('rejects forged, unbounded or unexpected fields', (input) => {
    expect(() => webVitalsInput(input)).toThrow()
  })

  it('hashes IDs and separates user/session/metric/document instances deterministically', () => {
    const key = webVitalReportKey(17, 'synthetic-session', 'LCP', 'v5-1')
    expect(key).toMatch(/^[a-f0-9]{64}$/)
    expect(key).not.toContain('synthetic-session')
    expect(webVitalReportKey(17, 'synthetic-session', 'LCP', 'v5-1')).toBe(key)
    expect(new Set([
      key, webVitalReportKey(18, 'synthetic-session', 'LCP', 'v5-1'),
      webVitalReportKey(17, 'other-session', 'LCP', 'v5-1'),
      webVitalReportKey(17, 'synthetic-session', 'INP', 'v5-1'),
      webVitalReportKey(17, 'synthetic-session', 'LCP', 'v5-2'),
    ]).size).toBe(5)
  })

  it('declares explicit closed collection access for all raw API operations', () => {
    expect(WebVitalsReports.slug).toBe('web-vitals-reports')
    for (const action of ['create', 'read', 'update', 'delete'] as const) {
      const access = WebVitalsReports.access?.[action]
      expect(typeof access).toBe('function')
      if (!access) throw new Error('Missing collection access')
      expect(Reflect.apply(access, undefined, [{}])).toBe(false)
    }
  })
})
