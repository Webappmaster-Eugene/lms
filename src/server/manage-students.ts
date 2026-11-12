import { sql } from '@payloadcms/db-postgres'
import { APIError, commitTransaction, createLocalReq, initTransaction, killTransaction, ValidationError, type Payload, type PayloadRequest } from 'payload'

import { AssignmentInputError, type CreatedStudent, type StudentCredentials, type StudentDetails, type StudentImpact, type StudentProfile } from '@/components/learning-access/contracts'
import { revokeUserSessions } from '@/payload/hooks/authSessionRevocations'
import { addMoscowMonths, FREEZE_TERMS, freezeReasons, moscowDayStart, type FreezeReason, type FreezeTerm } from '@/lib/account-freeze'
import { createFreeze, deletePlannedFreezes, endActiveFreezes, getAccountFreeze, planAutomaticFreeze } from '@/server/account-freeze'
import { lockLearningAccess, transactionDb } from '@/payload/hooks/learningAccessLock'
import { generateStudentPassword } from '@/server/student-password'
import type { User } from '@/payload-types'

type StudentFields = { email?: string; firstName?: string; lastName?: string; telegram?: string | null; isActive?: boolean; isTestStudent?: boolean }
const emailPattern = /^[^\s@]+@[^\s@]+\.[^\s@]+$/
const select = { email: true, firstName: true, lastName: true, telegram: true, isActive: true, isTestStudent: true, role: true, totalPoints: true } as const
type StudentDoc = Pick<User, 'id' | 'email' | 'firstName' | 'lastName' | 'telegram' | 'isActive' | 'isTestStudent' | 'role' | 'totalPoints'>

function name(value: unknown, label: string): string {
  if (typeof value !== 'string' || !value.trim() || value.trim().length > 100) throw new AssignmentInputError(`Укажите ${label} длиной до 100 символов`)
  return value.trim()
}

function email(value: unknown): string {
  if (typeof value !== 'string' || value.trim().length > 254 || !emailPattern.test(value.trim())) throw new AssignmentInputError('Укажите корректную почту')
  return value.trim().toLowerCase()
}

/** Только перечисленные поля: роль и настройки доступа этим маршрутом не меняются. */
function readFields(raw: unknown, partial: boolean): StudentFields {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new AssignmentInputError('Проверьте данные ученика')
  const input = raw as Record<string, unknown>
  const fields: StudentFields = {}
  if (!partial || input.email !== undefined) fields.email = email(input.email)
  if (!partial || input.firstName !== undefined) fields.firstName = name(input.firstName, 'имя')
  if (!partial || input.lastName !== undefined) fields.lastName = name(input.lastName, 'фамилию')
  if (input.telegram !== undefined) {
    if (input.telegram !== null && typeof input.telegram !== 'string') throw new AssignmentInputError('Проверьте Telegram')
    fields.telegram = typeof input.telegram === 'string' && input.telegram.trim() ? input.telegram.trim() : null
  }
  if (partial && input.isActive !== undefined) {
    if (typeof input.isActive !== 'boolean') throw new AssignmentInputError('Проверьте признак активности')
    fields.isActive = input.isActive
  }
  if (partial && input.isTestStudent !== undefined) {
    if (typeof input.isTestStudent !== 'boolean') throw new AssignmentInputError('Проверьте признак тестового ученика')
    fields.isTestStudent = input.isTestStudent
  }
  return fields
}

async function profile(payload: Payload, doc: StudentDoc, req: PayloadRequest): Promise<StudentProfile> {
  const freeze = await getAccountFreeze(payload, doc.id, req)
  return {
    id: doc.id, email: doc.email, firstName: doc.firstName, lastName: doc.lastName, telegram: doc.telegram ?? null, isActive: doc.isActive !== false, isTestStudent: doc.isTestStudent === true,
    freeze: {
      active: freeze.active !== null,
      since: freeze.active?.startsAt ?? null,
      endsAt: freeze.active?.endsAt ?? null,
      frozenUntil: freeze.frozenUntil,
      reason: freeze.active?.reason ?? null,
      note: freeze.active?.note ?? null,
      plannedAt: freeze.planned?.startsAt ?? null,
    },
  }
}

async function readStudent(payload: Payload, id: number, req: PayloadRequest): Promise<StudentDoc> {
  const doc = await payload.findByID({ collection: 'users', id, depth: 0, select, overrideAccess: false, req }) as StudentDoc
  if (doc.role !== 'student') throw new AssignmentInputError('Здесь можно менять только учеников', 400)
  return doc
}

/** Тот же порядок блокировок, что у сохранения назначений: сначала 7204, затем строка пользователя. */
async function lockStudent(req: PayloadRequest, id: number): Promise<void> {
  await lockLearningAccess(req, id)
  const db = await transactionDb(req)
  await db.execute(sql`select id from users where id = ${id} for update`)
}

async function transaction<T>(req: PayloadRequest, work: () => Promise<T>): Promise<T> {
  if (!await initTransaction(req)) throw new Error('Student change requires a transaction')
  try {
    const value = await work()
    await commitTransaction(req)
    return value
  } catch (error) {
    await killTransaction(req)
    throw error
  }
}

async function activeSessionIds(req: PayloadRequest, id: number): Promise<string[]> {
  const current = await req.payload.db.findOne({ collection: 'users', where: { id: { equals: id } }, req })
  const sessions = current && 'sessions' in current && Array.isArray(current.sessions) ? current.sessions as { id?: unknown }[] : []
  return sessions.flatMap((session) => typeof session.id === 'string' ? [session.id] : [])
}

function duplicateEmail(error: unknown): boolean {
  return error instanceof ValidationError && error.data.errors.some((item) => item.path === 'email')
}

export async function createStudent(payload: Payload, user: User, headers: Headers, raw: unknown): Promise<CreatedStudent> {
  const fields = readFields(raw, false)
  const password = generateStudentPassword()
  const req = await createLocalReq({ user, context: { suppressInvite: true }, req: { headers } }, payload)
  try {
    const doc = await payload.create({
      collection: 'users',
      data: { ...fields, email: fields.email as string, firstName: fields.firstName as string, lastName: fields.lastName as string, password, role: 'student', isActive: true, learningAccessMode: 'assigned', learningCatalogVisibility: 'assigned', trainerAccessMode: 'assigned', guidesAccessMode: 'assigned' },
      overrideAccess: false,
      req,
    })
    return { student: await profile(payload, doc as StudentDoc, req), credentials: { email: doc.email, password } }
  } catch (error) {
    if (duplicateEmail(error)) throw new AssignmentInputError('Такая почта уже занята другим аккаунтом', 409)
    throw error
  }
}

async function studentImpact(payload: Payload, id: number, points: number): Promise<StudentImpact> {
  // Счётчики без текста записей. Личные записи собеседований обычным чтением админу не видны.
  const count = async (collection: 'user-progress' | 'certificates' | 'comments' | 'notes' | 'learning-access-grants', field = 'user') => (await payload.count({ collection, where: { [field]: { equals: id } }, overrideAccess: true })).totalDocs
  const [progress, certificates, comments, notes, rules, enrollments, recordings] = await Promise.all([
    count('user-progress'), count('certificates'), count('comments'), count('notes'), count('learning-access-grants'),
    payload.count({ collection: 'bootcamp-enrollments', where: { lmsUser: { equals: id } }, overrideAccess: true }),
    payload.count({ collection: 'interview-recordings', where: { and: [{ owner: { equals: id } }, { category: { equals: 'personal' } }] }, overrideAccess: true }),
  ])
  const blockers = [
    ...(enrollments.totalDocs ? ['Ученик зачислен на буткемп: при удалении его учётка в GitLab и зачисление останутся без связи. Заморозьте аккаунт.'] : []),
    ...(recordings.totalDocs ? ['У ученика есть личные записи собеседований: файлы остались бы без владельца. Заморозьте аккаунт.'] : []),
  ]
  return { progress, certificates, comments, notes, rules, points, blockers }
}

export async function studentDetails(payload: Payload, user: User, headers: Headers, id: number): Promise<StudentDetails> {
  const req = await createLocalReq({ user, req: { headers } }, payload)
  const doc = await readStudent(payload, id, req)
  return { student: await profile(payload, doc, req), impact: await studentImpact(payload, id, doc.totalPoints ?? 0) }
}

export async function updateStudent(payload: Payload, user: User, headers: Headers, id: number, raw: unknown): Promise<StudentProfile> {
  const fields = readFields(raw, true)
  if (!Object.keys(fields).length) throw new AssignmentInputError('Нет изменений')
  const req = await createLocalReq({ user, req: { headers } }, payload)
  try {
    return await transaction(req, async () => {
      await lockStudent(req, id)
      const before = await readStudent(payload, id, req)
      // Отключение только прячет сессии при чтении: без отзыва обратное включение оживило бы старые входы.
      if (fields.isActive === false && before.isActive !== false) await revokeUserSessions(req, id, await activeSessionIds(req, id))
      await payload.update({ collection: 'users', id, data: fields, overrideAccess: false, req })
      return profile(payload, await readStudent(payload, id, req), req)
    })
  } catch (error) {
    if (duplicateEmail(error)) throw new AssignmentInputError('Такая почта уже занята другим аккаунтом', 409)
    throw error
  }
}

export async function resetStudentPassword(payload: Payload, user: User, headers: Headers, id: number): Promise<StudentCredentials> {
  const password = generateStudentPassword()
  const req = await createLocalReq({ user, context: { adminPasswordReset: true }, req: { headers } }, payload)
  return transaction(req, async () => {
    await lockStudent(req, id)
    const doc = await readStudent(payload, id, req)
    await revokeUserSessions(req, id, await activeSessionIds(req, id))
    await payload.update({ collection: 'users', id, data: { password }, overrideAccess: false, req })
    return { email: doc.email, password }
  })
}

export async function deleteStudent(payload: Payload, user: User, headers: Headers, id: number, raw: unknown): Promise<void> {
  const confirmation = raw && typeof raw === 'object' && 'confirmEmail' in raw ? raw.confirmEmail : undefined
  const req = await createLocalReq({ user, req: { headers } }, payload)
  const doc = await readStudent(payload, id, req)
  if (typeof confirmation !== 'string' || confirmation.trim().toLowerCase() !== doc.email) throw new AssignmentInputError('Для удаления введите почту ученика')
  const { blockers } = await studentImpact(payload, id, doc.totalPoints ?? 0)
  if (blockers.length) throw new AssignmentInputError(blockers[0], 409)
  await payload.delete({ collection: 'users', id, overrideAccess: false, req })
}

type FreezeChange =
  | { action: 'freeze'; endsAt: string | null; reason: FreezeReason; note: string | null }
  | { action: 'unfreeze'; nextMonths: number | null }
  | { action: 'plan'; startsAt: string | null }

const NEXT_FREEZE = { '6m': 6, '1y': 12, none: null } as const

function futureDay(value: unknown, label: string): string {
  const iso = typeof value === 'string' ? moscowDayStart(value) : null
  if (!iso) throw new AssignmentInputError(`Укажите ${label} в формате ГГГГ-ММ-ДД`)
  if (Date.parse(iso) <= Date.now()) throw new AssignmentInputError(`${label[0].toUpperCase()}${label.slice(1)} должна быть позже сегодняшнего дня`)
  return iso
}

function readFreezeChange(raw: unknown): FreezeChange {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new AssignmentInputError('Проверьте параметры заморозки')
  const input = raw as Record<string, unknown>
  if (input.action === 'freeze') {
    const term = input.term
    const months = typeof term === 'string' && Object.hasOwn(FREEZE_TERMS, term) ? FREEZE_TERMS[term as FreezeTerm] : undefined
    if (term !== 'date' && months === undefined) throw new AssignmentInputError('Выберите срок заморозки')
    const endsAt = term === 'date' ? futureDay(input.until, 'дату разморозки') : months ? addMoscowMonths(Date.now(), months) : null
    if (typeof input.reason !== 'string' || !freezeReasons.includes(input.reason as FreezeReason)) throw new AssignmentInputError('Выберите причину заморозки')
    if (input.note !== undefined && input.note !== null && (typeof input.note !== 'string' || input.note.length > 500)) throw new AssignmentInputError('Заметка - до 500 символов')
    const note = typeof input.note === 'string' && input.note.trim() ? input.note.trim() : null
    return { action: 'freeze', endsAt, reason: input.reason as FreezeReason, note }
  }
  if (input.action === 'unfreeze') {
    if (typeof input.next !== 'string' || !Object.hasOwn(NEXT_FREEZE, input.next)) throw new AssignmentInputError('Выберите, когда заморозить снова')
    return { action: 'unfreeze', nextMonths: NEXT_FREEZE[input.next as keyof typeof NEXT_FREEZE] }
  }
  if (input.action === 'plan') return { action: 'plan', startsAt: input.date === null ? null : futureDay(input.date, 'дату заморозки') }
  throw new AssignmentInputError('Неизвестное действие с заморозкой')
}

/**
 * Заморозить сейчас, разморозить или назначить дату плановой заморозки. Сессии не отзываются:
 * всё, что открыто до заморозки, отбрасывает проверка сессий (cutoff), и после разморозки оно не оживает.
 */
export async function changeStudentFreeze(payload: Payload, user: User, headers: Headers, id: number, raw: unknown): Promise<StudentProfile> {
  const change = readFreezeChange(raw)
  const req = await createLocalReq({ user, req: { headers } }, payload)
  return transaction(req, async () => {
    await lockStudent(req, id)
    await readStudent(payload, id, req)
    if (change.action === 'freeze') {
      await endActiveFreezes(req, id, user.id)
      await createFreeze(req, id, { startsAt: new Date().toISOString(), endsAt: change.endsAt, reason: change.reason, note: change.note, createdBy: user.id })
    } else if (change.action === 'unfreeze') {
      if (!await endActiveFreezes(req, id, user.id)) throw new AssignmentInputError('Ученик не заморожен', 409)
      await deletePlannedFreezes(req, id)
      if (change.nextMonths !== null) await planAutomaticFreeze(req, id, addMoscowMonths(Date.now(), change.nextMonths), user.id)
    } else {
      await deletePlannedFreezes(req, id)
      if (change.startsAt) await planAutomaticFreeze(req, id, change.startsAt, user.id)
    }
    return profile(payload, await readStudent(payload, id, req), req)
  })
}

/** Текст ошибки для администратора. Подробности остаются в журнале, а тело ответа пароля не содержит. */
export function studentFailureMessage(error: unknown): { message: string; status: number } {
  if (error instanceof AssignmentInputError) return { message: error.message, status: error.status }
  const status = error instanceof Error && 'status' in error && typeof error.status === 'number' ? error.status : 500
  if (status === 404) return { message: 'Ученик не найден', status }
  if (status === 403) return { message: 'Недостаточно прав', status }
  if (status >= 500) return { message: 'Не удалось выполнить операцию. Повторите попытку', status }
  if (error instanceof ValidationError) return { message: 'Проверьте поля ученика', status }
  // Хуки пишут причины по-русски (например, неверный Telegram), служебные тексты Payload показывать незачем.
  return { message: error instanceof APIError && /[а-яё]/i.test(error.message) ? error.message : 'Проверьте поля ученика', status }
}
