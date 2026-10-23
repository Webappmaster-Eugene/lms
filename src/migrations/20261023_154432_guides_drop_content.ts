import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

// Фаза contract: старый Lexical-текст гайдов не читает ни один работающий код — с guides_v2 текст только в markdown.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`ALTER TABLE "guides" DROP COLUMN IF EXISTS "content";`)
}

// Колонка возвращается пустой: down миграции guides_markdown заполняет её заглушкой перед SET NOT NULL.
export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`ALTER TABLE "guides" ADD COLUMN IF NOT EXISTS "content" jsonb;`)
}
