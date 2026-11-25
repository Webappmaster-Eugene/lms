import 'server-only'

import { sql } from '@payloadcms/db-postgres'
import type { Payload, PayloadRequest } from 'payload'
import { z } from 'zod'

import { tutoringPrograms, type TutoringProgram } from '@/lib/tutoring'
import type { TutoringStream, User } from '@/payload-types'
import { sendExistingTutoringInvite } from '@/payload/hooks/sendNotification'
import { getAccountFreeze } from '@/server/account-freeze'
import { inTransaction, txDb } from '@/server/bootcamp-lead-events'
import { hasEnrollmentIdentity } from '@/server/enrollment-identity'
import { getAuthoritativeLearningPolicy } from '@/server/learning-access-policy'
import { generateStudentPassword } from '@/server/student-password'
import { TutoringProblem, tutoringMeetings } from '@/server/tutoring'
import { writeTutoringStream } from '@/server/tutoring-schedule'

type Invite = { email: string; name: string }
type Stream = Pick<TutoringStream, 'id' | 'title' | 'program' | 'invitesAwaitingIdentity'>
const waitingInviteSchema = z.array(z.object({ studentId: z.number().int().positive(), email: z.email() }))
type WaitingInvite = z.infer<typeof waitingInviteSchema>[number]

export function tutoringInvitesAwaitingIdentity(stream: Stream): WaitingInvite[] {
  const queue = waitingInviteSchema.safeParse(stream.invitesAwaitingIdentity ?? [])
  if (!queue.success) throw new TutoringProblem('Не удалось прочитать список приглашений на сверку')
  return queue.data
}
type NewStream = Pick<TutoringStream, 'program' | 'title' | 'startsAt' | 'introductionStartsAt' | 'meetingUrl' | 'hourlyKopecks'>

function parseTutoringInvitations(raw: string): Invite[] {
  const invites = new Map<string, Invite>()
  for (const entry of raw.split(/[\r\n,;]+/).map(value => value.trim()).filter(Boolean)) {
    const named = /^([^<>]+)<([^<>]+)>$/.exec(entry)
    const email = (named?.[2] ?? entry).trim().toLowerCase()
    if (email.length > 254 || !z.email().safeParse(email).success) {
      throw new TutoringProblem('Проверьте почту каждого ученика. Можно указать только адрес или имя и фамилию перед адресом в угловых скобках.')
    }
    const name = named?.[1]?.trim().replace(/\s+/g, ' ') ?? ''
    const [firstName, ...surname] = name.split(' ')
    if (name && (!surname.length || firstName.length > 100 || surname.join(' ').length > 100)) {
      throw new TutoringProblem('Укажите имя и фамилию до 100 символов каждое или оставьте только почту.')
    }
    if (name || !invites.has(email)) invites.set(email, { email, name })
  }
  return [...invites.values()].sort((a, b) => a.email < b.email ? -1 : a.email > b.email ? 1 : 0)
}

function savedInviteList(invites: Invite[]) {
  return invites.map(({ email, name }) => name ? `${name} <${email}>` : email).join('\n') || null
}

async function requireTutoringMaterials(payload: Payload, req: PayloadRequest, program: TutoringProgram) {
  const meetings = await tutoringMeetings(payload, req, program)
  if (meetings.length !== tutoringPrograms[program].meetings || meetings.some(meeting => !meeting.filename && !meeting.deckPdf)) {
    throw new TutoringProblem('Сначала загрузите полный комплект презентаций и домашних заданий программы')
  }
}

async function inviteMember(req: PayloadRequest, stream: Stream, { email, name }: Invite, waiting?: WaitingInvite): Promise<number | WaitingInvite> {
  const payload = req.payload
  const db = await txDb(req)
  // При двух одновременных приглашениях в разные потоки аккаунт создается один раз.
  await db.execute(sql`select pg_advisory_xact_lock(hashtext('tutoring-invite'), hashtext(${email}))`)
  await db.execute(sql`select id from users where email = ${email} for share`)
  const { docs: [account] } = await payload.find({
    collection: 'users', req, depth: 0, limit: 1, overrideAccess: false, where: { email: { equals: email } },
    select: { email: true, firstName: true, role: true, isActive: true },
  })
  // Повтор относится к исходному аккаунту, даже если его прежний адрес теперь свободен или занят другим учеником.
  if (waiting && account?.id !== waiting.studentId) return waiting
  if (account && (account.isActive === false || (await getAuthoritativeLearningPolicy(payload, account.id, req)).role !== 'student')) {
    if (waiting) return waiting
    throw new TutoringProblem('Среди приглашенных есть отключенный или служебный аккаунт. Проверьте адреса в разделе «Ученики и доступы».')
  }

  if (account && (await getAccountFreeze(payload, account.id, req)).active) {
    if (waiting) return waiting
    throw new TutoringProblem('Аккаунт ученика заморожен. Проверьте его состояние в разделе «Ученики и доступы».')
  }
  if (account && !await hasEnrollmentIdentity(req, account.id, email)) return { studentId: account.id, email }
  const [firstName, ...surname] = name.split(' ')
  const student = account ?? await payload.create({
    collection: 'users', req, depth: 0, overrideAccess: false,
    context: { tutoringWelcomePath: `/tutoring/${stream.program}/streams/${stream.id}`, tutoringUnnamed: !name },
    data: { email, firstName: firstName || 'Ученик', lastName: surname.join(' ') || 'менторства', password: generateStudentPassword(), role: 'student', isActive: true,
      learningAccessMode: 'assigned', learningCatalogVisibility: 'assigned', trainerAccessMode: 'assigned', guidesAccessMode: 'assigned' },
  })
  const { docs: [existing] } = await payload.find({
    collection: 'tutoring-participants', req, depth: 0, overrideAccess: false, limit: 1,
    where: { and: [{ student: { equals: student.id } }, { stream: { equals: stream.id } }] },
  })
  if (existing && !existing.active) throw new TutoringProblem('Ученик уже был в этом потоке. Проверьте его доступ в карточке.')
  if (existing) return existing.id
  const member = await payload.create({
    collection: 'tutoring-participants', req, depth: 0, overrideAccess: false, context: { tutoringInviteEmail: email },
    data: { stream: stream.id, student: student.id, active: true, currentMeeting: 1 },
  })
  if (account) await sendExistingTutoringInvite(req, account.email, stream)
  return member.id
}

async function storeAwaitingIdentity(req: PayloadRequest, streamId: number, pending: WaitingInvite[]) {
  await req.payload.update({ collection: 'tutoring-streams', id: streamId, req, depth: 0, overrideAccess: false,
    context: { tutoringIdentityQueue: true }, data: { invitesAwaitingIdentity: pending.length ? pending : null } })
}

async function inviteTutoringList(req: PayloadRequest, stream: Stream, invites: Invite[]) {
  const previous = tutoringInvitesAwaitingIdentity(stream)
  const pending = new Map(previous.map(row => [row.email, row]))
  const members: number[] = []
  // Одинаковый порядок захвата адресов у пересекающихся списков.
  for (const invite of invites) {
    const result = await inviteMember(req, stream, invite, pending.get(invite.email))
    if (typeof result === 'number') {
      pending.delete(invite.email)
      members.push(result)
    } else pending.set(invite.email, result)
  }
  const waiting = [...pending.values()]
  if (previous.length !== waiting.length || previous.some((row, i) => row.studentId !== waiting[i].studentId || row.email !== waiting[i].email)) {
    await storeAwaitingIdentity(req, stream.id, waiting)
  }
  return { members, waiting }
}

export async function repeatTutoringInvitations(payload: Payload, actor: User, streamId: number) {
  return writeTutoringStream(payload, actor, streamId, async (req, stream) => {
    if (stream.status !== 'active') throw new TutoringProblem('Сначала откройте поток')
    const waiting = tutoringInvitesAwaitingIdentity(stream)
    return inviteTutoringList(req, stream, parseTutoringInvitations(waiting.map(row => row.email).join('\n')))
  })
}

export async function removeWaitingTutoringInvite(payload: Payload, actor: User, streamId: number, studentId: number, email: string) {
  return writeTutoringStream(payload, actor, streamId, async (req, stream) => {
    const waiting = tutoringInvitesAwaitingIdentity(stream)
    const remaining = waiting.filter(row => row.studentId !== studentId || row.email !== email)
    if (remaining.length !== waiting.length) await storeAwaitingIdentity(req, stream.id, remaining)
  }, true)
}

export async function saveNewTutoringStream(payload: Payload, actor: User, input: NewStream, creationKey: string, rawInvites: string, open: boolean) {
  if (!z.uuidv4().safeParse(creationKey).success) throw new TutoringProblem('Обновите форму создания потока')
  const invites = parseTutoringInvitations(rawInvites)
  if (open && !invites.length) throw new TutoringProblem('Введите почту хотя бы одного ученика')
  if (open && !input.hourlyKopecks) throw new TutoringProblem('Укажите стоимость часа')
  return inTransaction(payload, actor, async req => {
    if (actor.isActive === false || (await getAuthoritativeLearningPolicy(payload, actor.id, req)).role !== 'admin') {
      throw new TutoringProblem('Открыть поток может только наставник')
    }
    const db = await txDb(req)
    await db.execute(sql`select pg_advisory_xact_lock(hashtext('tutoring-stream'), hashtext(${creationKey}))`)
    const { docs: [previous] } = await payload.find({
      collection: 'tutoring-streams', req, overrideAccess: false, depth: 0, limit: 1, where: { creationKey: { equals: creationKey } },
    })
    if (previous) {
      if (previous.program !== input.program) throw new TutoringProblem('Форма относится к другому потоку. Обновите страницу')
      return previous.id
    }
    if (open) await requireTutoringMaterials(payload, req, input.program)
    const stream = await payload.create({
      collection: 'tutoring-streams', req, overrideAccess: false, depth: 0,
      data: { ...input, status: open ? 'active' : 'draft', creationKey, pendingInviteEmails: open ? null : savedInviteList(invites),
        awaitingFirstLecture: true, currentMeeting: 1 },
    })
    if (open) await inviteTutoringList(req, stream, invites)
    return stream.id
  })
}

export async function addTutoringInvite(payload: Payload, actor: User, streamId: number, raw: string) {
  const invites = parseTutoringInvitations(raw)
  if (invites.length !== 1) throw new TutoringProblem('Укажите почту одного ученика')
  return writeTutoringStream(payload, actor, streamId, async (req, stream) => {
    if (stream.status === 'active') {
      const result = await inviteTutoringList(req, stream, invites)
      return result.members[0] ?? null
    }
    const pending = savedInviteList(parseTutoringInvitations([stream.pendingInviteEmails, raw].filter(Boolean).join('\n')))
    await payload.update({ collection: 'tutoring-streams', id: streamId, req, overrideAccess: false, data: { pendingInviteEmails: pending } })
    return null
  })
}

export async function saveTutoringStreamSettings(req: PayloadRequest, stream: TutoringStream,
  updates: Pick<TutoringStream, 'title' | 'meetingUrl' | 'status' | 'currentMeeting' | 'hourlyKopecks'>, inviteText?: string) {
  const open = updates.status === 'active'
  if (open && stream.status === 'draft' && stream.creationKey && !updates.hourlyKopecks) {
    throw new TutoringProblem('Укажите стоимость часа, чтобы открыть поток')
  }
  if (open) await requireTutoringMaterials(req.payload, req, stream.program)
  const invites = parseTutoringInvitations((stream.status === 'draft' ? inviteText : undefined) ?? stream.pendingInviteEmails ?? '')
  const saved = await req.payload.update({ collection: 'tutoring-streams', req, id: stream.id, overrideAccess: false,
    data: { ...updates, pendingInviteEmails: open ? null : savedInviteList(invites) } })
  if (open) await inviteTutoringList(req, saved, invites)
}
