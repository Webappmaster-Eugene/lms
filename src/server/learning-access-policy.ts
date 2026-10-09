import type { Payload, PayloadRequest } from 'payload'

export type LearningAccessMode = 'all' | 'assigned'
export type LearningAccessRole = 'admin' | 'student'
export type AuthoritativeLearningPolicy = { mode: LearningAccessMode; role: LearningAccessRole; catalogVisibility: 'catalog' | 'assigned'; trainerMode: 'all' | 'assigned' | 'disabled' }
const modes = new WeakMap<PayloadRequest, Map<number, Promise<AuthoritativeLearningPolicy>>>()

export function clearAuthoritativeLearningMode(req: PayloadRequest): void {
  modes.delete(req)
}

/** Auth SDK rewrites whole users rows; this separate policy row is the authority. */
export async function getAuthoritativeLearningPolicy(payload: Payload, userId: number, req?: Partial<PayloadRequest>): Promise<AuthoritativeLearningPolicy> {
  const load = async (): Promise<AuthoritativeLearningPolicy> => {
    const policies = await payload.find({ collection: 'learning-access-policies', where: { user: { equals: userId } }, select: { mode: true, role: true, catalogVisibility: true, trainerMode: true }, depth: 0, limit: 1, overrideAccess: true, req })
    const policy = policies.docs[0]
    if (policy) return { mode: policy.mode === 'all' ? 'all' : 'assigned', role: policy.role === 'admin' ? 'admin' : 'student', catalogVisibility: policy.catalogVisibility === 'assigned' ? 'assigned' : 'catalog', trainerMode: policy.trainerMode === 'assigned' || policy.trainerMode === 'disabled' ? policy.trainerMode : 'all' }
    // Compatibility only for pre-migration users without a policy; no Users.afterRead recursion.
    const current = await payload.db.findOne({ collection: 'users', where: { id: { equals: userId } }, req })
    return { mode: current && 'learningAccessMode' in current && current.learningAccessMode === 'all' ? 'all' : 'assigned', role: current && 'role' in current && current.role === 'admin' ? 'admin' : 'student', catalogVisibility: current && 'learningCatalogVisibility' in current && current.learningCatalogVisibility === 'assigned' ? 'assigned' : 'catalog', trainerMode: current && 'trainerAccessMode' in current && (current.trainerAccessMode === 'assigned' || current.trainerAccessMode === 'disabled') ? current.trainerAccessMode : 'all' }
  }
  if (!req) return load()
  const request = req as PayloadRequest
  let values = modes.get(request)
  if (!values) { values = new Map(); modes.set(request, values) }
  let promise = values.get(userId)
  if (!promise) { promise = load(); values.set(userId, promise) }
  return promise
}

export async function getAuthoritativeLearningMode(payload: Payload, userId: number, req?: Partial<PayloadRequest>): Promise<LearningAccessMode> {
  return (await getAuthoritativeLearningPolicy(payload, userId, req)).mode
}
