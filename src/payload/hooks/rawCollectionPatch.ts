import type { CollectionBeforeOperationHook, PayloadRequest } from 'payload'

export type RawCollectionPatch = { keys: ReadonlySet<string>; overrideAccess: boolean }
type CapturedPatch = RawCollectionPatch & { collection: string; id: string | null }
const patches = new WeakMap<PayloadRequest, CapturedPatch[]>()

/** Capture before field hooks fill omitted PATCH fields from the original document. */
export const captureRawCollectionPatch: CollectionBeforeOperationHook = ({ args, collection, operation, overrideAccess, req }) => {
  if (operation !== 'update' || !('data' in args) || !args.data || typeof args.data !== 'object') return
  const records = patches.get(req) ?? []
  const raw = args.data as Record<string, unknown>
  records.push({ collection: collection.slug, id: 'id' in args && args.id !== undefined ? String(args.id) : null, keys: new Set(Object.keys(raw).filter((key) => raw[key] !== undefined)), overrideAccess: Boolean(overrideAccess) })
  patches.set(req, records)
}

/** One ID operation is consumed once; a bulk patch applies to every document in its operation. */
export function consumeRawCollectionPatch(req: PayloadRequest, collection: string, id: number | string): RawCollectionPatch | null {
  const records = patches.get(req)
  if (!records) return null
  let index = records.findLastIndex((record) => record.collection === collection && record.id === String(id))
  if (index === -1) index = records.findLastIndex((record) => record.collection === collection && record.id === null)
  if (index === -1) return null
  const record = records[index]
  if (record.id !== null) records.splice(index, 1)
  if (!records.length) patches.delete(req)
  return record
}
