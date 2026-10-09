import { learningRelationId, learningTargetCollections, type LearningTargetCollection } from '@/lib/learning-access'

export const maximumLearningRules = 300
export type AssignmentRule = {
  id?: number
  target: { relationTo: LearningTargetCollection; value: number }
  effect: 'allow' | 'deny'
  startsAt: string | null
  expiresAt: string | null
  note: string
  title?: string
}
export type CatalogVisibility = 'catalog' | 'assigned'
export type TrainerMode = 'all' | 'assigned' | 'disabled'
export type AssignmentInput = { userId: number; mode: 'all' | 'assigned'; catalogVisibility?: CatalogVisibility; trainerMode?: TrainerMode; revision: string; rules: AssignmentRule[] }
export type AssignmentSnapshot = AssignmentInput & { catalogVisibility: CatalogVisibility; trainerMode: TrainerMode; student: { id: number; title: string } }
export type AssignmentOption = { id: number; title: string; published?: boolean; parentId?: number | null }
export type AssignmentOptions = { docs: AssignmentOption[]; page: number; hasNextPage: boolean }
export type AssignmentPreview = { courses: { id: number; title: string; access: 'full' | 'partial' | 'closed'; visible: boolean }[]; page: number; hasNextPage: boolean; availableCount: number; totalCount: number; hiddenCount: number; trainer: { tasks: { id: number; title: string; access: 'open' | 'closed'; visible: boolean }[]; page: number; hasNextPage: boolean; availableCount: number; totalCount: number } }

export class AssignmentInputError extends Error {
  constructor(message: string, readonly status = 400, readonly code?: 'orphaned-assignment') { super(message) }
}

/** Historical polymorphic deletions may leave a rule whose target is no longer present. */
export function storedAssignmentTarget(value: unknown, grantId?: number): AssignmentRule['target'] {
  const target = value && typeof value === 'object' && !Array.isArray(value) ? value as { relationTo?: unknown; value?: unknown } : null
  const id = learningRelationId(target?.value)
  if (!target || typeof target.relationTo !== 'string' || !learningTargetCollections.includes(target.relationTo as LearningTargetCollection) || id === null || id > 2_147_483_647) {
    throw new AssignmentInputError(`У назначения${grantId === undefined ? '' : ` №${grantId}`} удалена цель. Откройте список назначений, удалите правило с пустой целью и обновите данные ученика.`, 409, 'orphaned-assignment')
  }
  return { relationTo: target.relationTo as LearningTargetCollection, value: id }
}

function object(value: unknown): Record<string, unknown> {
  if (!value || typeof value !== 'object' || Array.isArray(value)) throw new AssignmentInputError('Проверьте формат назначений')
  return value as Record<string, unknown>
}

export function assignmentId(value: unknown): number {
  if (typeof value !== 'number' || !Number.isSafeInteger(value) || value < 1 || value > 2_147_483_647) throw new AssignmentInputError('Выберите существующего ученика и учебный материал')
  return value
}

function date(value: unknown): string | null {
  if (value === null || value === undefined || value === '') return null
  if (typeof value !== 'string' || value.length > 40 || !Number.isFinite(Date.parse(value))) throw new AssignmentInputError('Проверьте дату начала и окончания доступа')
  return new Date(value).toISOString()
}

export function validateAssignmentInput(value: unknown): AssignmentInput {
  const input = object(value)
  const userId = assignmentId(input.userId)
  if (input.mode !== 'all' && input.mode !== 'assigned') throw new AssignmentInputError('Выберите режим доступа')
  if (input.catalogVisibility !== undefined && input.catalogVisibility !== 'catalog' && input.catalogVisibility !== 'assigned') throw new AssignmentInputError('Выберите видимость каталога')
  if (input.trainerMode !== undefined && input.trainerMode !== 'all' && input.trainerMode !== 'assigned' && input.trainerMode !== 'disabled') throw new AssignmentInputError('Выберите доступ к тренажёру')
  if (typeof input.revision !== 'string' || !/^[a-f0-9]{64}$/.test(input.revision)) throw new AssignmentInputError('Обновите назначения перед сохранением')
  if (!Array.isArray(input.rules) || input.rules.length > maximumLearningRules) throw new AssignmentInputError(`У одного ученика может быть не более ${maximumLearningRules} назначений`)
  const targets = new Set<string>()
  const ids = new Set<number>()
  const rules = input.rules.map((raw): AssignmentRule => {
    const rule = object(raw)
    const target = object(rule.target)
    if (typeof target.relationTo !== 'string' || !learningTargetCollections.includes(target.relationTo as LearningTargetCollection)) throw new AssignmentInputError('Выберите учебный материал или задачу тренажёра')
    const value = assignmentId(target.value)
    const key = `${target.relationTo}:${value}`
    if (targets.has(key)) throw new AssignmentInputError('Для материала уже есть назначение. Измените существующее правило')
    targets.add(key)
    if (rule.effect !== 'allow' && rule.effect !== 'deny') throw new AssignmentInputError('Выберите, открыть или закрыть доступ')
    const startsAt = date(rule.startsAt)
    const expiresAt = date(rule.expiresAt)
    if (startsAt && expiresAt && Date.parse(expiresAt) <= Date.parse(startsAt)) throw new AssignmentInputError('Окончание доступа должно быть позже начала')
    if (rule.note !== undefined && (typeof rule.note !== 'string' || rule.note.length > 1000)) throw new AssignmentInputError('Комментарий не должен быть длиннее 1000 символов')
    const id = rule.id === undefined ? undefined : assignmentId(rule.id)
    if (id !== undefined && ids.has(id)) throw new AssignmentInputError('Одно назначение нельзя сохранить дважды')
    if (id !== undefined) ids.add(id)
    return { id, target: { relationTo: target.relationTo as LearningTargetCollection, value }, effect: rule.effect, startsAt, expiresAt, note: typeof rule.note === 'string' ? rule.note.trim() : '' }
  })
  return { userId, mode: input.mode, revision: input.revision, rules, ...(input.catalogVisibility === undefined ? {} : { catalogVisibility: input.catalogVisibility }), ...(input.trainerMode === undefined ? {} : { trainerMode: input.trainerMode }) }
}
