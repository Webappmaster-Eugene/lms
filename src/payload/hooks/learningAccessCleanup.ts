import type { CollectionBeforeDeleteHook } from 'payload'

import type { LearningTargetCollection } from '@/lib/learning-access'

export function cleanupLearningTargetGrants(target: LearningTargetCollection): CollectionBeforeDeleteHook {
  return async ({ req, id }) => {
    await req.payload.delete({ collection: 'learning-access-grants', where: { and: [{ 'target.relationTo': { equals: target } }, { 'target.value': { equals: id } }] }, overrideAccess: true, req })
  }
}
