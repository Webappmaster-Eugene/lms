import 'server-only'

import { randomUUID } from 'node:crypto'
import { sql } from '@payloadcms/db-postgres'
import { commitTransaction, createLocalReq, getPayload, initTransaction, killTransaction, type PayloadRequest } from 'payload'
import config from '@payload-config'

import type { InterviewRoom as RoomDocument, User } from '@/payload-types'
import { relationId } from '@/lib/relation-id'
import { getTrainerAccess, invalidateTrainerAccess } from '@/server/trainer-access'
import type { TrainerAccessSnapshot } from '@/lib/trainer-access'
import { lockLearningAccess } from '@/payload/hooks/learningAccessLock'
import { lexicalToMarkdown } from '@/lib/lexical'
import { starterCodeFor, taskLanguages } from '@/lib/trainer/spec'
import { parseTaskId } from '@/lib/trainer/task-id'
import { createRateLimiter } from '@/server/trainer/rate-limit'
import { compileTypeScript } from '@/server/trainer/sandbox'
import { InterviewError, interviewBody, interviewCode, interviewLanguage, interviewVersion, validRoomToken, type InterviewParticipant, type InterviewRoom } from './interview'

const creates = createRateLimiter('interview-create', 10, 60_000)
const writes = createRateLimiter('interview-write', 120, 60_000)
const compiles = createRateLimiter('interview-compile', 30, 60_000)
const MAX_MEMBERS = 8

type Executor = { execute: (query: ReturnType<typeof sql>) => Promise<unknown> }
type SessionsAdapter = { sessions: Record<string | number, { db: Executor } | undefined> }

function memberIds(room: RoomDocument): number[] {
  return (room.members ?? []).map((member) => relationId(member))
}

function presence(room: RoomDocument): InterviewParticipant[] {
  if (!Array.isArray(room.presence)) return []
  return room.presence.filter((item): item is InterviewParticipant =>
    item !== null && typeof item === 'object' && !Array.isArray(item)
    && 'id' in item && typeof item.id === 'number' && 'name' in item && typeof item.name === 'string'
    && 'lastSeen' in item && typeof item.lastSeen === 'string')
}

function clientRoom(room: RoomDocument): InterviewRoom {
  return {
    token: room.token, ownerId: relationId(room.owner), title: room.title,
    descriptionMd: room.descriptionMd ?? '', setupCode: room.setupCode ?? '',
    code: room.code ?? '', language: room.language, version: room.version,
    createdAt: room.createdAt, endedAt: room.endedAt ?? null,
    participants: presence(room).filter((member) => memberIds(room).includes(member.id)),
  }
}

function canReadRoomOrigin(room: RoomDocument, scope: TrainerAccessSnapshot): boolean {
  if (scope.admin) return true
  if (room.sourceTaskKnown !== true && scope.mode !== 'all') return false
  return room.sourceTaskId == null || scope.canAccessTask(room.sourceTaskId)
}

function assertMember(room: RoomDocument, user: User): void {
  if (!memberIds(room).includes(user.id)) throw new InterviewError('Сначала войдите в комнату по ссылке приглашения', 403)
}

function assertOpen(room: RoomDocument): void {
  if (room.endedAt) throw new InterviewError('Собеседование завершено. Создайте новую комнату', 410)
}

async function body(request: Request): Promise<Record<string, unknown>> {
  if (request.headers.get('Content-Type')?.split(';')[0]?.trim() !== 'application/json') {
    throw new InterviewError('Требуется Content-Type: application/json')
  }
  if (!request.body) throw new InterviewError('Пустой запрос')
  const reader = request.body.getReader()
  const decoder = new TextDecoder()
  let text = ''
  let bytes = 0
  try {
    while (true) {
      const chunk = await reader.read()
      if (chunk.done) break
      bytes += chunk.value.byteLength
      if (bytes > 450_000) {
        await reader.cancel()
        throw new InterviewError('Слишком большой запрос', 413)
      }
      text += decoder.decode(chunk.value, { stream: true })
      if (text.length > 150_000) {
        await reader.cancel()
        throw new InterviewError('Слишком большой запрос', 413)
      }
    }
    text += decoder.decode()
  } finally {
    reader.releaseLock()
  }
  try {
    return interviewBody(JSON.parse(text))
  } catch (error) {
    if (error instanceof InterviewError) throw error
    throw new InterviewError('Невалидный JSON')
  }
}

function assertOrigin(request: Request): void {
  // Explicit API tokens cannot be attached by a foreign HTML form.
  if (request.headers.has('Authorization')) return
  const allowed = new Set([new URL(request.url).origin])
  if (process.env.NEXT_PUBLIC_SERVER_URL) allowed.add(new URL(process.env.NEXT_PUBLIC_SERVER_URL).origin)
  const host = request.headers.get('Host')
  const proto = request.headers.get('X-Forwarded-Proto')?.split(',')[0]?.trim()
  if (host && /^[a-z0-9.:[\]-]+$/i.test(host)) {
    allowed.add(new URL(`${proto === 'https' ? 'https:' : new URL(request.url).protocol}//${host}`).origin)
  }
  const origin = request.headers.get('Origin')
  if (!origin || !allowed.has(origin) || ['cross-site', 'same-site'].includes(request.headers.get('Sec-Fetch-Site') ?? '')) {
    throw new InterviewError('Откройте комнату на платформе', 403)
  }
}

/** All member and code writes take the same row lock, including heartbeats. */
async function lockRoom(req: PayloadRequest, id: number): Promise<void> {
  const transactionId = await req.transactionID
  const adapter = req.payload.db as unknown as SessionsAdapter
  const db = transactionId === undefined ? undefined : adapter.sessions[transactionId]?.db
  if (!db) throw new Error('Room writes require a transaction')
  await db.execute(sql`select id from interview_rooms where id = ${id} for update`)
}

type Action = 'create' | 'read' | 'join' | 'update' | 'compile'

async function executeInterviewRequest(request: Request, action: Action, token?: string): Promise<Response> {
  const payload = await getPayload({ config })
  let req: PayloadRequest | undefined
  try {
    const authHeaders = new Headers(request.headers)
    if (authHeaders.has('Authorization')) {
      if (!/^(?:JWT|Bearer) \S+$/.test(authHeaders.get('Authorization') ?? '')) throw new InterviewError('Неверная авторизация', 401)
      authHeaders.delete('Cookie')
    }
    const { user } = await payload.auth({ headers: authHeaders })
    if (!user) throw new InterviewError('Требуется авторизация', 401)
    if (user.isActive !== true) throw new InterviewError('Аккаунт неактивен', 403)
    const trainerScope = await getTrainerAccess(payload, user)
    if (!trainerScope.hasAccess) throw new InterviewError('Доступ к тренажёру не назначен', 403)
    if (action !== 'read') assertOrigin(request)
    const input = action === 'read' ? {} : await body(request)
    if (action === 'create') {
      if (!creates.take(String(user.id))) throw new InterviewError('Слишком много новых комнат. Подождите минуту', 429)
      const active = await payload.count({ collection: 'interview-rooms', where: { owner: { equals: user.id }, endedAt: { exists: false } }, overrideAccess: true })
      if (active.totalDocs >= 30) throw new InterviewError('Завершите одну из открытых комнат перед созданием новой', 409)
      const taskId = input.taskId === undefined ? null : parseTaskId(input.taskId)
      if (input.taskId !== undefined && taskId === null) throw new InterviewError('Неверный идентификатор задачи')
      let title = 'Собеседование'
      let descriptionMd = ''
      let setupCode = ''
      let setupTypes = ''
      let code = '// Обсудите условие и напишите решение\nconsole.log("Готов к собеседованию")\n'
      let language: 'js' | 'ts' = 'js'
      if (taskId !== null) {
        if (!trainerScope.canAccessTask(taskId)) throw new InterviewError('Доступ к задаче не назначен', 403)
        const found = await payload.find({ collection: 'trainer-tasks', where: { id: { equals: taskId }, isPublished: { equals: true } }, limit: 1, depth: 0, overrideAccess: false, user })
        const task = found.docs[0]
        if (!task) throw new InterviewError('Задача не найдена', 404)
        const topics = await payload.find({ collection: 'trainer-topics', where: { id: { equals: relationId(task.topic) }, isPublished: { equals: true } }, limit: 1, depth: 0 })
        if (!topics.docs.length) throw new InterviewError('Задача не найдена', 404)
        title = task.title
        descriptionMd = task.descriptionMd ?? (task.description ? lexicalToMarkdown(task.description) : '')
        language = taskLanguages(task)[0] ?? 'js'
        code = starterCodeFor(task, language)
        setupCode = task.setupCode ?? ''
        setupTypes = task.setupTypes ?? ''
      }
      req = await createLocalReq({ user }, payload)
      if (!await initTransaction(req)) throw new Error('Could not start interview transaction')
      await lockLearningAccess(req, user.id)
      invalidateTrainerAccess(req)
      const currentScope = await getTrainerAccess(payload, user, req)
      if (!currentScope.hasAccess || (taskId !== null && !currentScope.canAccessTask(taskId))) throw new InterviewError('Доступ к задаче отозван', 403)
      const room = await payload.create({ collection: 'interview-rooms', req, overrideAccess: true, depth: 0, data: {
        sourceTaskId: taskId, sourceTaskKnown: true, token: randomUUID(), owner: user.id, members: [user.id], title, descriptionMd, setupCode, setupTypes,
        code, language, version: 1,
        presence: [{ id: user.id, name: [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Участник', lastSeen: new Date().toISOString() }],
      } })
      await commitTransaction(req)
      req = undefined
      return Response.json({ room: clientRoom(room), userId: user.id }, { status: 201, headers: { 'Cache-Control': 'no-store' } })
    }
    if (!token || !validRoomToken(token)) throw new InterviewError('Комната не найдена', 404)
    const found = await payload.find({ collection: 'interview-rooms', where: { token: { equals: token } }, limit: 1, depth: 0, overrideAccess: true })
    let room = found.docs[0]
    if (!room) throw new InterviewError('Комната не найдена', 404)
    if (!canReadRoomOrigin(room, trainerScope)) throw new InterviewError('Доступ к задаче этой комнаты не назначен', 403)
    if (action === 'read') {
      assertMember(room, user)
      return Response.json({ room: clientRoom(room), userId: user.id }, { headers: { 'Cache-Control': 'no-store' } })
    }
    if (action === 'compile') {
      assertMember(room, user)
      assertOpen(room)
      const code = interviewCode(input.code)
      if (!compiles.take(String(user.id))) throw new InterviewError('Слишком много запусков. Подождите минуту', 429)
      const result = await compileTypeScript({ code, setupCode: room.setupTypes?.trim() || room.setupCode || '', typeHarness: '', checkTypes: true })
      return Response.json({ js: result.js, diagnostics: result.diagnostics })
    }
    if (!writes.take(String(user.id))) throw new InterviewError('Слишком много изменений. Подождите минуту', 429)
    req = await createLocalReq({ user }, payload)
    if (!await initTransaction(req)) throw new Error('Could not start interview transaction')
    await lockLearningAccess(req, user.id)
    invalidateTrainerAccess(req)
    const currentScope = await getTrainerAccess(payload, user, req)
    if (!currentScope.hasAccess || !canReadRoomOrigin(room, currentScope)) throw new InterviewError('Доступ к задаче этой комнаты отозван', 403)
    await lockRoom(req, room.id)
    room = await payload.findByID({ collection: 'interview-rooms', id: room.id, req, depth: 0, overrideAccess: true })
    if (action === 'join') {
      const ids = memberIds(room)
      if (room.endedAt && !ids.includes(user.id)) throw new InterviewError('Собеседование завершено', 410)
      if (!ids.includes(user.id) && ids.length >= MAX_MEMBERS) throw new InterviewError('В комнате уже восемь участников', 409)
      const lastSeen = new Date().toISOString()
      const participants = presence(room).filter((member) => member.id !== user.id)
      participants.push({ id: user.id, name: [user.firstName, user.lastName].filter(Boolean).join(' ') || 'Участник', lastSeen })
      room = await payload.update({ collection: 'interview-rooms', id: room.id, req, depth: 0, overrideAccess: true, data: {
        members: [...new Set([...ids, user.id])], presence: participants,
      } })
    } else {
      assertMember(room, user)
      assertOpen(room)
      if (input.end === true && relationId(room.owner) !== user.id) throw new InterviewError('Завершить комнату может её создатель', 403)
      const version = interviewVersion(input.version)
      if (version !== room.version) {
        await killTransaction(req)
        req = undefined
        return Response.json({ error: 'Код изменён другим участником. Выберите, какую версию сохранить', room: clientRoom(room) }, { status: 409 })
      }
      const data = input.end === true
        ? { endedAt: new Date().toISOString(), version: version + 1 }
        : { code: interviewCode(input.code), language: interviewLanguage(input.language), version: version + 1 }
      room = await payload.update({ collection: 'interview-rooms', id: room.id, data, req, depth: 0, overrideAccess: true })
    }
    await commitTransaction(req)
    req = undefined
    return Response.json({ room: clientRoom(room), userId: user.id }, { headers: { 'Cache-Control': 'no-store' } })
  } catch (error) {
    if (req) await killTransaction(req)
    if (error instanceof InterviewError) return Response.json({ error: error.message }, { status: error.status })
    payload.logger.error({ msg: 'Interview room request failed', error: error instanceof Error ? error.name : 'UnknownError' })
    return Response.json({ error: 'Комната временно недоступна. Повторите попытку' }, { status: 503 })
  }
}

export async function interviewRequest(request: Request, action: Action, token?: string): Promise<Response> {
  const response = await executeInterviewRequest(request, action, token)
  response.headers.set('Cache-Control', 'no-store')
  return response
}
