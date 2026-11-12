import type { Payload, PayloadRequest, Where } from 'payload'

import { addMoscowMonths, AUTOMATIC_FREEZE_MONTHS, freezeReasons, freezeState, type FreezePeriod, type FreezeReason, type FreezeState } from '@/lib/account-freeze'
import { learningRelationId } from '@/lib/learning-access'
import { collectAllPages } from '@/lib/paginate'
import type { AccountFreeze } from '@/payload-types'

const periodsByRequest = new WeakMap<PayloadRequest, Map<number, Promise<FreezePeriod[]>>>()

function toPeriod(doc: Pick<AccountFreeze, 'id' | 'startsAt' | 'endsAt' | 'reason' | 'automatic' | 'note'>): FreezePeriod {
  return {
    id: doc.id,
    startsAt: doc.startsAt,
    endsAt: doc.endsAt ?? null,
    reason: freezeReasons.includes(doc.reason as FreezeReason) ? doc.reason as FreezeReason : 'other',
    automatic: doc.automatic === true,
    note: doc.note ?? null,
  }
}

const select = { startsAt: true, endsAt: true, reason: true, automatic: true, note: true } as const

/** Периоды ученика; в пределах одного req читаются один раз, после записи кэш сбрасывается. */
export function loadFreezePeriods(payload: Payload, userId: number, req?: PayloadRequest): Promise<FreezePeriod[]> {
  const load = async () => (await collectAllPages(
    ({ page, limit }) => payload.find({ collection: 'account-freezes', where: { user: { equals: userId } }, select, sort: 'startsAt', depth: 0, overrideAccess: true, req, page, limit }),
    { label: 'заморозки ученика' },
  )).map(toPeriod)
  if (!req) return load()
  let byUser = periodsByRequest.get(req)
  if (!byUser) { byUser = new Map(); periodsByRequest.set(req, byUser) }
  let periods = byUser.get(userId)
  if (!periods) { periods = load(); byUser.set(userId, periods) }
  return periods
}

export function clearFreezeCache(req: PayloadRequest): void {
  periodsByRequest.delete(req)
}

export async function getAccountFreeze(payload: Payload, userId: number, req?: PayloadRequest, now = Date.now()): Promise<FreezeState> {
  return freezeState(await loadFreezePeriods(payload, userId, req), now)
}

const activeWhere = (now: string): Where => ({ and: [{ startsAt: { less_than_equal: now } }, { or: [{ endsAt: { exists: false } }, { endsAt: { greater_than: now } }] }] })

/** Кто из перечисленных (или из всех, если список не задан) заморожен прямо сейчас. */
export async function frozenUserIds(payload: Payload, userIds?: readonly number[] | null, req?: PayloadRequest): Promise<Set<number>> {
  const now = new Date().toISOString()
  const result = new Set<number>()
  const chunks = userIds ? Array.from({ length: Math.ceil(userIds.length / 500) }, (_, index) => userIds.slice(index * 500, index * 500 + 500)) : [null]
  for (const chunk of chunks) {
    if (chunk && !chunk.length) continue
    const where: Where = chunk ? { and: [activeWhere(now), { user: { in: [...chunk] } }] } : activeWhere(now)
    const rows = await collectAllPages(
      ({ page, limit }) => payload.find({ collection: 'account-freezes', where, select: { user: true }, sort: 'id', depth: 0, overrideAccess: true, req, page, limit }),
      { label: 'замороженные ученики' },
    )
    for (const row of rows) {
      const id = learningRelationId(row.user)
      if (id !== null) result.add(id)
    }
  }
  return result
}

/** Запись в коллекцию открыта только этому модулю: флаг ставится на время операции и снимается. */
async function withCapability<T>(req: PayloadRequest, work: () => Promise<T>): Promise<T> {
  const previous = req.context.syncAccountFreezes
  req.context.syncAccountFreezes = true
  try {
    return await work()
  } finally {
    if (previous === undefined) delete req.context.syncAccountFreezes
    else req.context.syncAccountFreezes = previous
    clearFreezeCache(req)
  }
}

export type NewFreeze = { startsAt: string; endsAt: string | null; reason: FreezeReason; automatic?: boolean; note?: string | null; createdBy?: number | null }

export function createFreeze(req: PayloadRequest, userId: number, freeze: NewFreeze): Promise<FreezePeriod> {
  return withCapability(req, async () => toPeriod(await req.payload.create({
    collection: 'account-freezes',
    data: { user: userId, startsAt: freeze.startsAt, endsAt: freeze.endsAt, reason: freeze.reason, automatic: freeze.automatic === true, note: freeze.note ?? null, createdBy: freeze.createdBy ?? null },
    overrideAccess: true,
    depth: 0,
    req,
  })))
}

/** Завершает действующие периоды сейчас. Начавшиеся периоды не удаляются: это история. */
export async function endActiveFreezes(req: PayloadRequest, userId: number, endedBy: number | null, options: { automaticOnly?: boolean } = {}): Promise<number> {
  const now = new Date().toISOString()
  const active = (await loadFreezePeriods(req.payload, userId, req)).filter((period) => Date.parse(period.startsAt) <= Date.parse(now) && (period.endsAt === null || Date.parse(period.endsAt) > Date.parse(now)) && (!options.automaticOnly || period.automatic))
  if (!active.length) return 0
  await withCapability(req, async () => {
    for (const period of active) await req.payload.update({ collection: 'account-freezes', id: period.id, data: { endsAt: now, endedBy }, overrideAccess: true, depth: 0, req })
  })
  return active.length
}

/** Удаляет плановые периоды: пока они не начались, следов в истории им оставлять незачем. */
export async function deletePlannedFreezes(req: PayloadRequest, userId: number, options: { automaticOnly?: boolean } = {}): Promise<number> {
  const now = Date.now()
  const planned = (await loadFreezePeriods(req.payload, userId, req)).filter((period) => Date.parse(period.startsAt) > now && (!options.automaticOnly || period.automatic))
  if (!planned.length) return 0
  await withCapability(req, async () => {
    for (const period of planned) await req.payload.delete({ collection: 'account-freezes', id: period.id, overrideAccess: true, depth: 0, req })
  })
  return planned.length
}

/** Плановая заморозка «срок обучения»: бессрочная, снимает её администратор, когда ученик выйдет на связь. */
export function planAutomaticFreeze(req: PayloadRequest, userId: number, startsAt: string, createdBy: number | null = null): Promise<FreezePeriod> {
  return createFreeze(req, userId, { startsAt, endsAt: null, reason: 'term', automatic: true, createdBy })
}

export const automaticFreezeStart = (createdAt: string) => addMoscowMonths(createdAt, AUTOMATIC_FREEZE_MONTHS)
