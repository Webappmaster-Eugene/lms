import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Гайды в Markdown и закладки на гайды. Только расширение схемы: старый код пишет `content`
 * как раньше, а NOT NULL снимается, чтобы новые гайды жили без Lexical.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "guides" ALTER COLUMN "content" DROP NOT NULL;
  ALTER TABLE "guides" ADD COLUMN "markdown" varchar;
  ALTER TABLE "bookmarks" ADD COLUMN "guide_id" integer;
  ALTER TABLE "bookmarks" ADD CONSTRAINT "bookmarks_guide_id_guides_id_fk" FOREIGN KEY ("guide_id") REFERENCES "public"."guides"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "bookmarks_guide_idx" ON "bookmarks" USING btree ("guide_id");
  CREATE UNIQUE INDEX "user_guide_idx" ON "bookmarks" USING btree ("user_id","guide_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Гайдам без Lexical нужен пустой документ, иначе NOT NULL не вернуть; текст остаётся в markdown до DROP.
  await db.execute(sql`
  DELETE FROM "bookmarks" WHERE "guide_id" IS NOT NULL;
  ALTER TABLE "bookmarks" DROP CONSTRAINT IF EXISTS "bookmarks_guide_id_guides_id_fk";
  DROP INDEX IF EXISTS "bookmarks_guide_idx";
  DROP INDEX IF EXISTS "user_guide_idx";
  UPDATE "guides" SET "content" = '{"root":{"type":"root","children":[],"direction":null,"format":"","indent":0,"version":1}}'::jsonb WHERE "content" IS NULL;
  ALTER TABLE "guides" ALTER COLUMN "content" SET NOT NULL;
  ALTER TABLE "guides" DROP COLUMN IF EXISTS "markdown";
  ALTER TABLE "bookmarks" DROP COLUMN IF EXISTS "guide_id";`)
}
