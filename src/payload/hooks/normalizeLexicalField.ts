import type { FieldHook } from 'payload'

import { normalizeLexicalValue, type LexicalRootState } from '@/lib/lexical'

/**
 * Field hooks that guarantee a Payload `richText` (Lexical) field never
 * crashes the admin UI on malformed jsonb values.
 *
 * The editor in `@payloadcms/richtext-lexical` throws synchronously at
 * `useMemo` time when the value it receives is not an object of the shape
 * `{ root: { ... } }`. PostgreSQL `jsonb` columns, however, accept any JSON
 * value — so a stray string (from a raw SQL update, a careless import, or a
 * legacy seed) is enough to make the document un-editable through the UI.
 *
 * We mitigate this on both ends of the I/O boundary:
 *
 *  - {@link normalizeLexicalBeforeValidate} runs on `create` / `update`
 *    before Payload persists the document. It prevents bad values from ever
 *    reaching the DB through the app.
 *  - {@link normalizeLexicalAfterRead} runs on every read. It heals legacy
 *    bad rows at read time so the admin edit form opens normally even when
 *    the raw column value was written out-of-band.
 *
 * Both hooks are pure, stateless, and never throw — throwing would recreate
 * the very crash we are defending against.
 */

type NormalizeResult = LexicalRootState | null

function normalize(
  value: unknown,
  logger: { warn: (obj: Record<string, unknown>, msg: string) => void },
  phase: 'write' | 'read',
): NormalizeResult {
  return normalizeLexicalValue(value, (bad) => {
    logger.warn(
      { value: bad, phase },
      'richText field received a non-Lexical value — coercing to empty document',
    )
  })
}

export const normalizeLexicalBeforeValidate: FieldHook = ({ value, req }) =>
  normalize(value, req.payload.logger, 'write')

export const normalizeLexicalAfterRead: FieldHook = ({ value, req }) =>
  normalize(value, req.payload.logger, 'read')
