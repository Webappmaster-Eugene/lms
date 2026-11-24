import assert from 'node:assert/strict'
import { execFileSync } from 'node:child_process'
import { readFile } from 'node:fs/promises'
import path from 'node:path'

const reactRefs = [
  '01ac105',
  '59f6316',
  'a54fd48',
  'd15ede4',
  'e77ce23',
  'ff932c7',
  '874a367',
  '81d2f19',
  'ea7397c',
  'd50f4d7',
  '4e10729',
  '95b00ac',
  'ba9914a',
  'ad18a0c',
  'd2827c7',
  '477d526',
  '363b914',
  '0398a7b',
  '59a5309',
  '30a98f6',
  '5c45aaf',
]

export const courses = {
  nodejs: { label: 'Node.js', length: 32, readings: '../bootcamp/content/dist/package/mentorcareer/lessons' },
  'react-next': {
    label: 'React и Next.js',
    length: 24,
    readings: '../bootcamp/frontend/journey-content-work/.runtime/package/mentorcareer/lessons',
  },
}

export function localRevision(program, stage) {
  // Для Node используем только идентификатор локального снимка. Исходники и решения
  // не покидают рабочий каталог и не пересылаются в проект ученика.
  const react = program === 'react-next'
  const repo = react
    ? '../bootcamp/frontend/student-journey-2026-11-19'
    : stage === 0
      ? '../bootcamp/starter'
      : '../bootcamp/reference'
  const ref = react ? reactRefs[stage] : stage === 0 ? 'week-00' : 'checkpoint-' + String(stage).padStart(2, '0')
  assert(ref)
  const sha = execFileSync('git', ['-C', repo, 'rev-parse', '--verify', ref + '^{commit}'], { encoding: 'utf8' }).trim()
  assert.match(sha, /^[a-f0-9]{40}$/)
  return { stage, sha }
}

export async function responseJson(response, name) {
  assert(
    response.ok(),
    name + ' HTTP ' + response.status() + ' ' + (response.ok() ? '' : (await response.text()).slice(0, 320)),
  )
  return response.json()
}

export async function prepareReadings(client, meetings, program) {
  const api = async (method, route, data) => responseJson(await client[method]('/api/' + route, { data }), route)
  const rows = meetings.filter((meeting) => meeting.program === program)
  const course = courses[program]
  const slug = 'qa-mentoring-' + program
  const [roadmap] = (await api('get', 'roadmaps?limit=1')).docs
  assert(roadmap, 'Запустите штатный e2e-сид')
  const existing = (await api('get', 'courses?where[slug][equals]=' + slug)).docs
  assert.equal(existing.length, 0, 'Для репетиции нужна свежая изолированная база')
  const { doc } = await api('post', 'courses', {
    title: course.label + ' - учебный проект',
    slug,
    roadmap: roadmap.id,
    isBootcamp: true,
    isPublished: true,
  })
  const settings = {
    manualsCourse: doc.id,
    mentoringGitlabGroup: program + '-bootcamp/mentoring-' + program,
    mentoringGraderUserId: 58741,
  }
  const [prior] = (await api('get', 'bootcamp-programs?where[key][equals]=' + program)).docs
  if (prior) await api('patch', 'bootcamp-programs/' + prior.id, settings)
  else
    await api('post', 'bootcamp-programs', {
      key: program,
      title: course.label,
      shortTitle: course.label,
      ...settings,
      isActive: true,
      landingUrl: 'https://example.invalid/bootcamp',
      priceKopecks: 3000000,
      paymentDueDays: 5,
      offerUrl: 'https://example.invalid/offer',
      offerVersion: 'qa',
      receiptItemName: course.label,
      gitlabCourseProject: program + '/course',
      gitlabStreamGroup: program + '/mass',
      gradingProject: program + '-staff/grading',
      entryTaskSet: 'rental-js',
    })
  const bindings = rows.flatMap((row) => row.homework)
  const stages = new Map(bindings.map((item) => [item.stage, item.practice]))
  assert.equal(bindings.length, 42)
  assert.equal(stages.size, 21)
  for (const [stage, practice] of stages) {
    const key = new URL(practice).pathname
      .split('/')
      .at(-1)
      .replace(/-practice$/, '')
    const folder = key.slice((program + '-bootcamp-').length)
    assert.match(folder, /^\d{2}-[a-z0-9-]+$/)
    for (const part of ['theory', 'practice', 'check']) {
      const markdown = await readFile(path.join(course.readings, folder, part + '.md'), 'utf8')
      const title =
        (stage ? 'Этап ' + stage : 'Подготовка') +
        '. ' +
        { theory: 'Теория', practice: 'Практикум', check: 'Самопроверка' }[part]
      await api('post', 'lessons', {
        title,
        slug: key + '-' + part,
        course: doc.id,
        isPublished: true,
        content: [{ blockType: 'markdown', markdown }],
      })
    }
  }
  return settings
}
