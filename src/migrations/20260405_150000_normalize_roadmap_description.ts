import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Heal legacy bad values in `roadmaps.description`.
 *
 * The column is `jsonb` and Payload expects a Lexical editor state object
 * (`{ root: { type: 'root', children: [...], ... } }`), but `jsonb` also
 * accepts scalars. In practice a plain string ended up in the column at
 * least once (screenshot in `tasks/20260401/task2-req.md`) and crashed the
 * admin edit form at `useMemo` time.
 *
 * This migration is a safety net, idempotent by construction:
 *   1. String values are lifted into a single-paragraph Lexical document,
 *      preserving the original text.
 *   2. Any other non-object value (number, boolean, array, null-typed
 *      jsonb) is reset to SQL `NULL` — there is no meaningful way to
 *      reconstruct a document from a loose boolean.
 *
 * Valid objects are left untouched by both branches.
 *
 * NOTE: the same guarantee is now enforced at write- and read-time by
 * `normalizeLexicalBeforeValidate` / `normalizeLexicalAfterRead` field
 * hooks on `Roadmaps.description`. This migration exists so that fresh
 * environments and any stray historical data converge to the same shape
 * even before the first Payload request touches the row.
 */
export async function up({ db, req: _req }: MigrateUpArgs): Promise<void> {
  // 1. Lift jsonb strings into a one-paragraph Lexical document.
  //
  //    `description #>> '{}'` unwraps a jsonb string to a Postgres text,
  //    which we then embed as a Lexical `text` node. Empty strings are
  //    folded to NULL because Lexical rejects empty `text` nodes.
  await db.execute(sql`
    UPDATE "roadmaps"
    SET "description" = jsonb_build_object(
      'root', jsonb_build_object(
        'type', 'root',
        'direction', 'ltr',
        'format', '',
        'indent', 0,
        'version', 1,
        'children', jsonb_build_array(
          jsonb_build_object(
            'type', 'paragraph',
            'version', 1,
            'direction', 'ltr',
            'format', '',
            'indent', 0,
            'textFormat', 0,
            'textStyle', '',
            'children', jsonb_build_array(
              jsonb_build_object(
                'type', 'text',
                'version', 1,
                'detail', 0,
                'format', 0,
                'mode', 'normal',
                'style', '',
                'text', "description" #>> '{}'
              )
            )
          )
        )
      )
    )
    WHERE "description" IS NOT NULL
      AND jsonb_typeof("description") = 'string'
      AND length("description" #>> '{}') > 0;
  `)

  // 2. Null out empty jsonb strings ("") and every other non-object scalar.
  //    `jsonb_typeof` returns one of 'object' | 'array' | 'string' | 'number'
  //    | 'boolean' | 'null'. We keep 'object' and drop everything else,
  //    since after step 1 any surviving non-object row is unusable.
  await db.execute(sql`
    UPDATE "roadmaps"
    SET "description" = NULL
    WHERE "description" IS NOT NULL
      AND jsonb_typeof("description") <> 'object';
  `)
}

// Rollback is intentionally a no-op: re-introducing malformed values would
// recreate the admin-UI crash, and we have no record of the original scalar
// payloads (they were already healed or removed manually before this change).
export async function down(_args: MigrateDownArgs): Promise<void> {
  // no-op
}
