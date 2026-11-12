import { describe, expect, it } from 'vitest'
import { buildLearningAccess } from '@/lib/learning-access'
import { evaluateAccess, sameRules, toggleAccess, type AccessCatalog, type AccessInput, type CatalogLesson, type TreeTarget } from '@/lib/learning-access-edit'
import { maximumLearningRules, type AssignmentRule } from '@/components/learning-access/contracts'
import { passwordPolicyError } from '@/lib/profile'
import { generateStudentPassword } from '@/server/student-password'

const NOW = Date.parse('2026-11-05T12:00:00Z')
const catalog: AccessCatalog = {
  roadmaps: [{ id: 1, title: 'Backend', isPublished: true }, { id: 2, title: 'Frontend', isPublished: true }, { id: 3, title: 'Черновик', isPublished: false }],
  nodes: [
    { id: 10, label: 'Базы', roadmap: 1, course: null, nodeType: 'topic', sharedCourses: [] },
    { id: 20, label: 'Общая тема', roadmap: 2, course: null, nodeType: 'topic', sharedCourses: [11] },
  ],
  courses: [
    { id: 11, title: 'Node.js', roadmap: 1, roadmapNode: 10, isPublished: true, assignedOnly: false, isBootcamp: false },
    { id: 12, title: 'Express', roadmap: 1, roadmapNode: null, isPublished: true, assignedOnly: false, isBootcamp: false },
    { id: 13, title: 'SQL', roadmap: 1, roadmapNode: 10, isPublished: true, assignedOnly: true, isBootcamp: false },
    { id: 14, title: 'Буткемп', roadmap: 1, roadmapNode: null, isPublished: true, assignedOnly: true, isBootcamp: true },
    { id: 15, title: 'Черновик курса', roadmap: 1, roadmapNode: null, isPublished: false, assignedOnly: false, isBootcamp: false },
    { id: 21, title: 'React', roadmap: 2, roadmapNode: null, isPublished: true, assignedOnly: false, isBootcamp: false },
    { id: 31, title: 'В черновике карты', roadmap: 3, roadmapNode: null, isPublished: true, assignedOnly: false, isBootcamp: false },
  ],
  sections: [
    { id: 110, title: 'Раздел 1', course: 11, isPublished: true },
    { id: 111, title: 'Раздел 2', course: 11, isPublished: true },
  ],
}
const lessons: CatalogLesson[] = [
  { id: 1100, title: 'Урок раздела', course: 11, section: 110, isPublished: true },
  { id: 1101, title: 'Сосед', course: 11, section: 110, isPublished: true },
  { id: 1102, title: 'Без раздела', course: 11, section: null, isPublished: true },
]
const rule = (relationTo: AssignmentRule['target']['relationTo'], value: number, effect: 'allow' | 'deny' = 'allow', extra: Partial<AssignmentRule> = {}): AssignmentRule => ({ target: { relationTo, value }, effect, startsAt: null, expiresAt: null, note: '', ...extra })
const input = (rules: AssignmentRule[] = [], mode: AccessInput['mode'] = 'assigned'): AccessInput => ({ catalog, lessons, rules, mode, now: NOW })
const roadmap = (value: number, title = 'Карта'): TreeTarget => ({ relationTo: 'roadmaps', value, title })
const course = (value: number, title = 'Курс'): TreeTarget => ({ relationTo: 'courses', value, title })
const section = (value: number, title = 'Раздел'): TreeTarget => ({ relationTo: 'sections', value, title })
const lesson = (value: number, title = 'Урок'): TreeTarget => ({ relationTo: 'lessons', value, title })
function changed(outcome: ReturnType<typeof toggleAccess>): AssignmentRule[] {
  if (outcome.status !== 'changed') throw new Error(`Ожидалось изменение, получено: ${JSON.stringify(outcome)}`)
  return outcome.rules
}
const summary = (rules: AssignmentRule[]) => rules.map((item) => `${item.effect} ${item.target.relationTo}:${item.target.value}`)

describe('состояния дерева берутся из политики доступа', () => {
  it('без правил всё закрыто, режим «все материалы» открывает обычные курсы, но не закрытые типы', () => {
    const closed = evaluateAccess(input())
    expect(closed.roadmap(1)).toBe('closed')
    const all = evaluateAccess(input([], 'all'))
    expect(all.roadmap(1)).toBe('full')
    expect(all.course(11)).toBe('full')
    expect(all.course(13)).toBe('closed')
    expect(all.course(14)).toBe('closed')
  })

  it('карта считается открытой без своих закрытых курсов и черновиков', () => {
    const access = evaluateAccess(input([rule('roadmaps', 1)]))
    expect(access.roadmap(1)).toBe('full')
    expect(access.course(13)).toBe('closed')
    expect(access.course(15)).toBe('closed')
  })

  it('открытый платный курс показывает закрытую карту частично, но проверка действия смотрит на обычные курсы', () => {
    const access = evaluateAccess(input([rule('courses', 13)]))
    expect(access.roadmap(1)).toBe('partial')
    expect(access.ordinaryRoadmap(1)).toBe('closed')
  })

  it('запрет урока делает частичными раздел, курс и карту', () => {
    const access = evaluateAccess(input([rule('roadmaps', 1), rule('lessons', 1100, 'deny')]))
    expect(access.lesson(lessons[0])).toBe('closed')
    expect(access.lesson(lessons[1])).toBe('full')
    expect(access.section(110)).toBe('partial')
    expect(access.section(111)).toBe('full')
    expect(access.course(11)).toBe('partial')
    expect(access.roadmap(1)).toBe('partial')
  })

  it('разрешение одного урока показывает частичными родителей закрытого курса', () => {
    const access = evaluateAccess(input([rule('lessons', 1100)]))
    expect(access.section(110)).toBe('partial')
    expect(access.section(111)).toBe('closed')
    expect(access.course(11)).toBe('partial')
    expect(access.roadmap(1)).toBe('partial')
  })

  it('истёкшее и ещё не начавшееся правила не действуют', () => {
    expect(evaluateAccess(input([rule('courses', 11, 'allow', { expiresAt: '2026-01-01T00:00:00Z' })])).course(11)).toBe('closed')
    expect(evaluateAccess(input([rule('courses', 11, 'allow', { startsAt: '2027-01-01T00:00:00Z' })])).course(11)).toBe('closed')
  })

  it('курс другой карты в теме открывает назначение темы, но не всей карты', () => {
    expect(evaluateAccess(input([rule('roadmaps', 2)])).course(11)).toBe('closed')
    expect(evaluateAccess(input([rule('roadmap-nodes', 20)])).course(11)).toBe('full')
  })

  it('совпадает с buildLearningAccess по доступности курсов и уроков', () => {
    const cases: AssignmentRule[][] = [[], [rule('roadmaps', 1)], [rule('roadmaps', 1), rule('courses', 11, 'deny')], [rule('courses', 11, 'deny'), rule('lessons', 1100)], [rule('sections', 110)], [rule('roadmap-nodes', 10)], [rule('courses', 13)], [rule('roadmaps', 2)]]
    for (const rules of cases) for (const mode of ['assigned', 'all'] as const) {
      const policy = buildLearningAccess({ id: 1, role: 'student', learningAccessMode: mode }, rules, { ...catalog, lessons }, NOW)
      const access = evaluateAccess(input(rules, mode))
      for (const item of catalog.courses) expect(access.course(item.id) !== 'closed').toBe(policy.canAccessCourse(item.id))
      for (const item of lessons) expect(access.lesson(item) === 'full').toBe(policy.canAccessLessonMetadata(item))
    }
  })
})

describe('отметка в дереве', () => {
  it('открывает карту одним правилом и не трогает правило платного курса', () => {
    const rules = changed(toggleAccess(input([rule('courses', 13)]), roadmap(1), 'full'))
    expect(summary(rules)).toEqual(['allow courses:13', 'allow roadmaps:1'])
  })

  it('открытие частичной карты убирает правила внутри', () => {
    const rules = changed(toggleAccess(input([rule('roadmaps', 1), rule('courses', 12, 'deny'), rule('lessons', 1100, 'deny'), rule('roadmap-nodes', 10, 'deny')]), roadmap(1), 'full'))
    expect(summary(rules)).toEqual(['allow roadmaps:1'])
  })

  it('чужие карты при этом не затрагиваются', () => {
    expect(summary(changed(toggleAccess(input([rule('roadmaps', 2)]), roadmap(1), 'full')))).toEqual(['allow roadmaps:2', 'allow roadmaps:1'])
  })

  it('закрывает карту, оставляя независимый платный курс', () => {
    const rules = changed(toggleAccess(input([rule('roadmaps', 1), rule('courses', 13)]), roadmap(1), 'closed'))
    expect(summary(rules)).toEqual(['allow courses:13'])
    expect(evaluateAccess(input(rules)).ordinaryRoadmap(1)).toBe('closed')
  })

  it('разрешение темы с платным курсом не исчезает молча', () => {
    const topic = rule('roadmap-nodes', 10)
    expect(evaluateAccess(input([topic])).course(13)).toBe('full')
    const opened = changed(toggleAccess(input([topic]), roadmap(1), 'full'))
    expect(summary(opened)).toEqual(['allow roadmap-nodes:10', 'allow roadmaps:1'])
    expect(evaluateAccess(input(opened)).course(13)).toBe('full')
    expect(toggleAccess(input([rule('roadmaps', 1), topic]), roadmap(1), 'closed')).toEqual({ status: 'confirm', special: [topic] })
    expect(changed(toggleAccess(input([rule('roadmaps', 1), topic]), roadmap(1), 'closed', true))).toEqual([])
  })

  it('запрет темы с платным курсом при открытии карты снимается без вопросов', () => {
    expect(summary(changed(toggleAccess(input([rule('roadmaps', 1), rule('roadmap-nodes', 10, 'deny')]), roadmap(1), 'full')))).toEqual(['allow roadmaps:1'])
  })

  it('карту не закрыть, пока её курс держит правило темы другой карты, и причина названа верно', () => {
    expect(toggleAccess(input([rule('roadmap-nodes', 20)]), roadmap(1), 'closed')).toEqual({ status: 'refused', reason: expect.stringContaining('темы другого роадмапа') })
  })

  it('курс в закрытой карте получает разрешение, а при снятии просто теряет его', () => {
    const open = changed(toggleAccess(input(), course(12), 'full'))
    expect(summary(open)).toEqual(['allow courses:12'])
    expect(changed(toggleAccess(input(open), course(12), 'closed'))).toEqual([])
  })

  it('курс в открытой карте при снятии получает запрет, а при возврате лишается его', () => {
    const closed = changed(toggleAccess(input([rule('roadmaps', 1)]), course(12), 'closed'))
    expect(summary(closed)).toEqual(['allow roadmaps:1', 'deny courses:12'])
    expect(summary(changed(toggleAccess(input(closed), course(12), 'full')))).toEqual(['allow roadmaps:1'])
  })

  it('в режиме «все материалы» закрытие - всегда запрет', () => {
    expect(summary(changed(toggleAccess(input([], 'all'), course(12), 'closed')))).toEqual(['deny courses:12'])
    expect(summary(changed(toggleAccess(input([], 'all'), roadmap(1), 'closed')))).toEqual(['deny roadmaps:1'])
  })

  it('запрет родителя можно обойти разрешением урока внутри него', () => {
    const rules = changed(toggleAccess(input([rule('courses', 11, 'deny')]), lesson(1100), 'full'))
    expect(summary(rules)).toEqual(['deny courses:11', 'allow lessons:1100'])
    expect(evaluateAccess(input(rules)).lesson(lessons[0])).toBe('full')
  })

  it('открытие раздела убирает правила его уроков, но не соседних разделов и не урока без раздела', () => {
    const rules = changed(toggleAccess(input([rule('lessons', 1100, 'deny'), rule('lessons', 1102)]), section(110), 'full'))
    expect(summary(rules)).toEqual(['allow lessons:1102', 'allow sections:110'])
  })

  it('курс из запрета темы открывается своим правилом', () => {
    const rules = changed(toggleAccess(input([rule('roadmaps', 1), rule('roadmap-nodes', 10, 'deny')]), course(11), 'full'))
    expect(summary(rules)).toEqual(['allow roadmaps:1', 'deny roadmap-nodes:10', 'allow courses:11'])
  })

  it('курс, открытый темой другой карты, закрывается запретом', () => {
    const rules = changed(toggleAccess(input([rule('roadmap-nodes', 20)]), course(11), 'closed'))
    expect(summary(rules)).toEqual(['allow roadmap-nodes:20', 'deny courses:11'])
    expect(evaluateAccess(input(rules)).course(11)).toBe('closed')
  })

  it('назначение карты не требует запрета на курсы других карт в её темах', () => {
    const rules = changed(toggleAccess(input([rule('roadmaps', 2)]), course(11), 'closed'))
    expect(summary(rules)).toEqual(['allow roadmaps:2'])
  })

  it('буткемп и платный курс открываются своей отметкой', () => {
    expect(summary(changed(toggleAccess(input(), course(14), 'full')))).toEqual(['allow courses:14'])
    expect(summary(changed(toggleAccess(input(), course(13), 'full')))).toEqual(['allow courses:13'])
  })

  it('правила со сроком или комментарием без подтверждения не удаляются', () => {
    const dated = rule('courses', 12, 'deny', { expiresAt: '2027-01-01T00:00:00Z' })
    const noted = rule('lessons', 1100, 'deny', { note: 'по просьбе ученика' })
    const before = [rule('roadmaps', 1), dated, noted]
    const asked = toggleAccess(input(before), roadmap(1), 'full')
    expect(asked).toEqual({ status: 'confirm', special: [dated, noted] })
    expect(summary(changed(toggleAccess(input(before), roadmap(1), 'full', true)))).toEqual(['allow roadmaps:1'])
  })

  it('истёкшее правило на цели обновляется, а не дублируется: на цель одно правило', () => {
    const old = rule('courses', 12, 'allow', { id: 77, expiresAt: '2026-01-01T00:00:00Z' })
    expect(toggleAccess(input([old]), course(12), 'full').status).toBe('confirm')
    const rules = changed(toggleAccess(input([old]), course(12), 'full', true))
    expect(rules).toHaveLength(1)
    expect(rules[0]).toMatchObject({ id: 77, effect: 'allow', expiresAt: null })
  })

  it('черновик и карта без обычных курсов не открываются, причина названа', () => {
    expect(toggleAccess(input(), course(15, 'Черновик курса'), 'full')).toEqual({ status: 'refused', reason: expect.stringContaining('Черновик курса') })
    expect(toggleAccess(input(), roadmap(3, 'Черновик'), 'full').status).toBe('refused')
  })

  it('лимит правил отказывает, ничего не меняя', () => {
    const many = Array.from({ length: maximumLearningRules }, (_, index) => rule('lessons', 5000 + index))
    expect(toggleAccess(input(many), course(12), 'full')).toEqual({ status: 'refused', reason: expect.stringContaining(String(maximumLearningRules)) })
  })
})

describe('сравнение правил', () => {
  it('не зависит от порядка, id и названия, но видит действие, срок и комментарий', () => {
    const base = [rule('courses', 1), rule('lessons', 2, 'deny')]
    expect(sameRules(base, [{ ...rule('lessons', 2, 'deny'), title: 'Урок' }, { ...rule('courses', 1), id: 5 }])).toBe(true)
    expect(sameRules(base, [rule('courses', 1)])).toBe(false)
    expect(sameRules(base, [rule('courses', 1, 'deny'), rule('lessons', 2, 'deny')])).toBe(false)
    expect(sameRules(base, [rule('courses', 1, 'allow', { note: 'важно' }), rule('lessons', 2, 'deny')])).toBe(false)
    expect(sameRules(base, [rule('courses', 1, 'allow', { expiresAt: '2030-01-01T00:00:00Z' }), rule('lessons', 2, 'deny')])).toBe(false)
  })
})

describe('пароль ученика', () => {
  it('проходит политику и не содержит похожих знаков', () => {
    const seen = new Set<string>()
    for (let index = 0; index < 1000; index += 1) {
      const password = generateStudentPassword()
      expect(passwordPolicyError(password)).toBeNull()
      expect(password).not.toMatch(/[lIO01]/)
      expect(password).toHaveLength(14)
      seen.add(password)
    }
    expect(seen.size).toBe(1000)
  })
})
