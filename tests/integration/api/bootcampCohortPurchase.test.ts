import { randomBytes } from 'node:crypto'
import { createLocalReq, type Payload } from 'payload'
import { afterAll, beforeAll, describe, expect, it, vi } from 'vitest'

import { POST as apply } from '@/app/api/bootcamp/leads/route'
import { POST as admit } from '@/app/api/bootcamp/leads/[id]/path/route'
import { POST as enroll } from '@/app/api/bootcamp/leads/[id]/enrollment/route'
import { POST as checkout } from '@/app/api/bootcamp/pay/[token]/start/route'
import { POST as resultNotice } from '@/app/api/bootcamp/robokassa/result/route'
import { relationId } from '@/lib/relation-id'
import { reactNextProgramData } from '@/lib/react-next-bootcamp-setup'
import type { BootcampProgram, User } from '@/payload-types'
import { getBuyerEnrollment } from '@/server/bootcamp-buyer'
import { claimEnrollment, reportEnrollment } from '@/server/bootcamp-enrollment'
import { noteFailReturn } from '@/server/bootcamp-payment'
import { getLearningAccess } from '@/server/learning-access'
import { noticeSignatureBase, signatureHash } from '@/server/robokassa'

import { LEAD_ANSWERS, leadFormData } from '../../fixtures/bootcampLead'
import { createProgram } from '../helpers/bootcamp'
import { captureEmails, createAdmin, createCourseTree, getTestPayload, login, rest, uid } from '../helpers/payload'

const origin = 'http://lms.test'
const configuration = {
  ROBOKASSA_MERCHANT_LOGIN: 'integration-shop',
  ROBOKASSA_PASSWORD1: randomBytes(16).toString('hex'),
  ROBOKASSA_PASSWORD2: randomBytes(16).toString('hex'),
  ROBOKASSA_TEST_PASSWORD1: randomBytes(16).toString('hex'),
  ROBOKASSA_TEST_PASSWORD2: randomBytes(16).toString('hex'),
  ROBOKASSA_HASH: 'sha256',
}
let payload: Payload
let token: string
let products: BootcampProgram[]
let mailbox: ReturnType<typeof captureEmails>

function post(body: unknown, authenticated = false) {
  const headers = new Headers({ 'Content-Type': 'application/json', Origin: origin, Host: 'lms.test', 'Sec-Fetch-Site': 'same-origin' })
  if (authenticated) headers.set('Authorization', `JWT ${token}`)
  return new Request(origin, { method: 'POST', headers, body: JSON.stringify(body) })
}

function notification(invoice: number, sum: string, isTest: boolean) {
  const values: Record<string, string> = { InvId: String(invoice), OutSum: sum }
  if (isTest) values.IsTest = '1'
  const key = isTest ? configuration.ROBOKASSA_TEST_PASSWORD2 : configuration.ROBOKASSA_PASSWORD2
  values.SignatureValue = signatureHash('sha256', noticeSignatureBase(sum, String(invoice), key, values))
  return resultNotice(new Request(origin + '/api/bootcamp/robokassa/result', { method: 'POST', body: new URLSearchParams(values) }))
}

async function createInvoice(paymentToken: string) {
  const response = await checkout(post({ acceptOffer: true }), { params: Promise.resolve({ token: paymentToken }) })
  expect(response.status).toBe(200)
  const { url } = await response.json() as { url: string }
  const args = new URL(url).searchParams
  expect(args.get('MerchantLogin')).toBe(configuration.ROBOKASSA_MERCHANT_LOGIN)
  return { invoice: Number(args.get('InvId')), sum: args.get('OutSum') ?? '', test: args.has('IsTest') }
}

beforeAll(async () => {
  for (const [name, value] of Object.entries(configuration)) vi.stubEnv(name, value)
  payload = await getTestPayload()
  token = await login(payload, await createAdmin(payload))
  mailbox = captureEmails(payload)
  const settings = (await payload.find({ collection: 'bootcamp-programs', where: { key: { equals: 'nodejs' } }, depth: 0 })).docs[0]
  if (!settings) throw new Error('Не найдена программа Node.js')
  const node = await createCourseTree(payload, { lessons: 1 })
  const react = await createCourseTree(payload, { lessons: 1 })
  for (const tree of [node, react]) {
    await payload.update({ collection: 'courses', id: tree.course.id, data: { isBootcamp: true } })
  }
  // Условия обоих продуктов настоящие. У тестовых наборов собственные ключи,
  // чтобы эта проверка не открывала набор для остальных тестов в общей базе.
  const { title, shortTitle, priceKopecks, gitlabCourseProject, gradingProject, receiptItemName } = settings
  products = [
    await createProgram(payload, { title, shortTitle, priceKopecks, gitlabCourseProject, gradingProject, gitlabStreamGroup: uid('node-cohort'), receiptItemName, manualsCourse: node.course.id }),
    await createProgram(payload, { ...reactNextProgramData(react.course.id), key: uid('react-qa'), gitlabStreamGroup: uid('react-cohort'), isActive: true }),
  ]
})

afterAll(() => { mailbox?.restore(); vi.unstubAllEnvs() })

async function runBuyer(program: BootcampProgram, isTest: boolean) {
  vi.stubEnv('ROBOKASSA_IS_TEST', isTest ? '1' : '0')
  const email = uid('buyer') + '@mail.test'
  const form = leadFormData({ ...LEAD_ANSWERS, email, program: program.key, name: 'Тестовый Покупатель', consent: true, consentVersion: program.offerVersion })
  const applied = await apply(new Request(origin + '/api/bootcamp/leads', { method: 'POST', headers: { Origin: origin, 'Sec-Fetch-Site': 'same-origin', Host: 'lms.test' }, body: form }))
  expect(applied.status).toBe(200)
  const lead = (await payload.find({ collection: 'bootcamp-leads', where: { email: { equals: email } }, depth: 0 })).docs[0]
  const params = { params: Promise.resolve({ id: String(lead.id) }) }
  const fields = { firstName: 'Тестовый', lastName: 'Покупатель', username: uid('buyer'), group: program.gitlabStreamGroup, accessUntil: '' }
  const decision = await admit(post({ ...fields, action: 'admit', withoutEntryTask: true }, true), params)
  if (!decision.ok) throw new Error((await decision.json() as { error: string }).error)
  const admitted = await payload.findByID({ collection: 'bootcamp-leads', id: lead.id, depth: 0 })
  expect(mailbox.sent.some(m => m.to === email && m.text?.includes('/pay/' + admitted.paymentToken))).toBe(true)
  expect(admitted.paymentAmountKopecks).toBe(program.priceKopecks)
  const paymentToken = admitted.paymentToken ?? ''
  const first = await createInvoice(paymentToken)
  expect(first.test).toBe(isTest)
  await noteFailReturn(payload, String(first.invoice))
  expect(await payload.findByID({ collection: 'bootcamp-leads', id: lead.id, depth: 0 })).toMatchObject({ status: 'admitted', paidAt: null })
  const where = { lead: { equals: lead.id } }
  const count = async () => (await payload.count({ collection: 'bootcamp-enrollments', where })).totalDocs
  expect(await count()).toBe(0)
  const next = await createInvoice(paymentToken)
  expect(next.invoice).not.toBe(first.invoice)
  expect(next.sum).toBe((program.priceKopecks / 100).toFixed(2))
  expect(await (await notification(next.invoice, next.sum, isTest)).text()).toBe('OK' + next.invoice)
  expect(await (await notification(next.invoice, next.sum, isTest)).text()).toBe('OK' + next.invoice)
  expect(await payload.findByID({ collection: 'bootcamp-payments', id: first.invoice, depth: 0 })).toMatchObject({ status: 'cancelled', method: 'robokassa' })
  expect(await payload.findByID({ collection: 'bootcamp-payments', id: next.invoice, depth: 0 })).toMatchObject({ status: 'paid', isTest })
  if (isTest) {
    expect(await count()).toBe(0)
    // Отдельная тестовая операция администратора после IsTest: тестовая карта
    // не может сама открыть курс. Второй покупатель проходит ветку автозачисления.
    expect((await enroll(post(fields, true), params)).status).toBe(201)
  }
  expect(await count()).toBe(1)
  const member = (await payload.find({ collection: 'bootcamp-enrollments', where, depth: 0 })).docs[0]
  expect(member).toMatchObject({ status: 'queued', program: program.key, streamGroup: fields.group, courseProject: program.gitlabCourseProject })
  const user = await payload.findByID({ collection: 'users', id: relationId(member.lmsUser), depth: 0 })
  const req = await createLocalReq({ user }, payload)
  expect(await getBuyerEnrollment(payload, user, req, { leadId: lead.id })).toMatchObject({ projectStatus: 'queued', projectUrl: null })
  const access = await getLearningAccess(payload, user, req)
  for (const item of products) expect(access.canAccessCourse(relationId(item.manualsCourse))).toBe(item.id === program.id)
  await vi.waitFor(() => expect(mailbox.sent.some(m => m.to === email && m.text?.includes('/reset-password?token='))).toBe(true))
  const invite = mailbox.sent.find(m => m.to === email && m.text?.includes('/reset-password?token='))
  const link = invite?.text?.match(/\/reset-password\?token=([^\s]+)/)?.[1]
  if (!link) throw new Error('В приглашении нет ссылки на установку пароля')
  const password = randomBytes(24).toString('hex')
  expect((await rest('POST', '/users/reset-password', { body: { token: decodeURIComponent(link), password } })).status).toBe(200)
  expect(await login(payload, { email, password })).toBeTruthy()
  // Исполнитель GitLab имитируется на границе очереди. Сетевые проекты не создаются.
  let claimed = await claimEnrollment(payload)
  while (claimed.job && claimed.job.id !== member.id) claimed = await claimEnrollment(payload)
  expect(claimed.job).toMatchObject({ id: member.id, username: fields.username, group: fields.group, courseProject: program.gitlabCourseProject })
  const projectUrl = `https://git.mentorcareer.ru/${fields.group}/${fields.username}`
  await reportEnrollment(payload, member.id, { status: 'done', steps: [], gitlabUserId: user.id, gitlabProjectId: member.id, gitlabProjectUrl: projectUrl })
  const current = await getBuyerEnrollment(payload, user, req, { leadId: lead.id })
  expect(current).toMatchObject({ projectStatus: 'done', projectUrl, defense: null })
  expect(current?.courseHref).toMatch(/^\/bootcamp\//)
  return { lead: lead.id, user, projectUrl }
}

describe('покупка мест на двух потоках', () => {
  it('каждый из четырех покупателей получает только свою программу и свой GitLab даже со ссылкой другого покупателя', async () => {
    const buyers: { lead: number; user: User; projectUrl: string }[] = []
    for (const program of products) {
      buyers.push(await runBuyer(program, true), await runBuyer(program, false))
    }
    expect(new Set(buyers.map(b => b.projectUrl)).size).toBe(4)
    for (const buyer of buyers) {
      const req = await createLocalReq({ user: buyer.user }, payload)
      for (const other of buyers.filter(o => o.lead !== buyer.lead)) {
        expect(await getBuyerEnrollment(payload, buyer.user, req, { leadId: other.lead })).toBeNull()
      }
    }
  })
})
