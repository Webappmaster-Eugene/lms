/**
 * Lexical editor state contract for Payload's `richText` fields.
 *
 * Payload + @payloadcms/richtext-lexical require a *structural* root object
 * of the shape `{ root: { type: 'root', children: [...], ... } }`. PostgreSQL
 * `jsonb` columns are more permissive — they accept any JSON value (scalar,
 * array, object), so a stray string / number / boolean landing in a richText
 * column will crash the admin edit form at `useMemo` time and leave the
 * document un-editable via the UI.
 *
 * This module owns the normalisation contract for the whole repo:
 *
 *  - {@link LexicalRootState} — the minimal structural type we rely on.
 *  - {@link EMPTY_LEXICAL_STATE} — a frozen, safe-to-share empty document.
 *  - {@link stringToLexicalState} — lifts a plain string into a one-paragraph
 *    document, matching what the Lexical editor would produce on its own.
 *  - {@link isLexicalRootState} — cheap structural guard; does not deep-validate
 *    children.
 *  - {@link normalizeLexicalValue} — single entry point used by field hooks
 *    and migrations to coerce any `unknown` jsonb value into something the
 *    admin UI can render.
 *
 * The module is pure, dependency-free, and side-effect free so it is safe to
 * import from Payload hooks, Drizzle migrations, and standalone scripts alike.
 */

/** Minimal structural type for the Lexical root state Payload expects. */
export type LexicalRootState = {
  readonly root: {
    readonly type: 'root'
    readonly direction: 'ltr' | 'rtl' | null
    readonly format: '' | 'left' | 'right' | 'center' | 'justify' | 'start' | 'end'
    readonly indent: number
    readonly version: number
    readonly children: readonly unknown[]
  }
}

/**
 * A well-formed, empty Lexical document. Frozen at the module boundary so
 * callers cannot accidentally mutate the shared instance across requests.
 */
export const EMPTY_LEXICAL_STATE: LexicalRootState = Object.freeze({
  root: Object.freeze({
    type: 'root' as const,
    direction: 'ltr' as const,
    format: '' as const,
    indent: 0,
    version: 1,
    children: Object.freeze([]),
  }),
})

/**
 * Wraps a plain string in a single-paragraph Lexical document. Matches the
 * shape the Lexical editor produces when a user types a single line of text,
 * so the round-trip through the admin UI is stable.
 *
 * Empty strings return {@link EMPTY_LEXICAL_STATE} — Lexical rejects an empty
 * `text` node, so wrapping `""` would produce an invalid document.
 */
export function stringToLexicalState(text: string): LexicalRootState {
  if (text.length === 0) return EMPTY_LEXICAL_STATE

  return {
    root: {
      type: 'root',
      direction: 'ltr',
      format: '',
      indent: 0,
      version: 1,
      children: [
        {
          type: 'paragraph',
          version: 1,
          direction: 'ltr',
          format: '',
          indent: 0,
          textFormat: 0,
          textStyle: '',
          children: [
            {
              type: 'text',
              version: 1,
              detail: 0,
              format: 0,
              mode: 'normal',
              style: '',
              text,
            },
          ],
        },
      ],
    },
  }
}

/**
 * Structural type guard. Intentionally shallow: we only verify the top-level
 * `root` container exists and has the required primitive fields. Deep-
 * validating every descendant would duplicate Lexical's own validation and
 * force us to chase node-type drift across Payload releases.
 *
 * Rejects `null` even though `typeof null === 'object'`.
 */
export function isLexicalRootState(value: unknown): value is LexicalRootState {
  if (value === null || typeof value !== 'object') return false

  const maybe = value as { root?: unknown }
  const root = maybe.root
  if (root === null || typeof root !== 'object') return false

  const r = root as {
    type?: unknown
    children?: unknown
    version?: unknown
  }
  return r.type === 'root' && Array.isArray(r.children) && typeof r.version === 'number'
}

/**
 * Coerces any value Payload may hand back from a jsonb column into something
 * the Lexical editor can consume. Contract:
 *
 *  - `null` / `undefined` → `null` (field stays empty, Payload renders an
 *    empty editor).
 *  - Already-valid {@link LexicalRootState} → returned as-is (reference-
 *    equal, so React / Lexical reconciliation is stable).
 *  - Plain string → wrapped via {@link stringToLexicalState}.
 *  - Any other value (number, boolean, array, malformed object) → `null`
 *    with an optional `onInvalid` callback for logging. We deliberately do
 *    **not** throw: the whole point of this hook is to keep the admin UI
 *    reachable, and throwing would recreate the crash we are fixing.
 */
export function normalizeLexicalValue(
  value: unknown,
  onInvalid?: (value: unknown) => void,
): LexicalRootState | null {
  if (value === null || value === undefined) return null

  if (isLexicalRootState(value)) return value

  if (typeof value === 'string') return stringToLexicalState(value)

  onInvalid?.(value)
  return null
}
