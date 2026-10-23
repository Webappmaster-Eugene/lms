import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

// Фаза expand: добавляет справочник категорий и связь category_id, засевает 4 базовые категории
// и переносит в связь прежнее значение-перечисление. Старую колонку category НЕ трогаем —
// во время переката старые контейнеры ещё читают её; удалит её отдельный contract-выкат.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "guide_categories" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"order" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "guides" ADD COLUMN "category_id" integer;
  ALTER TABLE "_guides_v" ADD COLUMN "version_category_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "guide_categories_id" integer;
  CREATE UNIQUE INDEX "guide_categories_slug_idx" ON "guide_categories" USING btree ("slug");
  CREATE INDEX "guide_categories_updated_at_idx" ON "guide_categories" USING btree ("updated_at");
  CREATE INDEX "guide_categories_created_at_idx" ON "guide_categories" USING btree ("created_at");
  ALTER TABLE "guides" ADD CONSTRAINT "guides_category_id_guide_categories_id_fk" FOREIGN KEY ("category_id") REFERENCES "public"."guide_categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "_guides_v" ADD CONSTRAINT "_guides_v_version_category_id_guide_categories_id_fk" FOREIGN KEY ("version_category_id") REFERENCES "public"."guide_categories"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_guide_categories_fk" FOREIGN KEY ("guide_categories_id") REFERENCES "public"."guide_categories"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "guides_category_idx" ON "guides" USING btree ("category_id");
  CREATE INDEX "_guides_v_version_version_category_idx" ON "_guides_v" USING btree ("version_category_id");
  CREATE INDEX "payload_locked_documents_rels_guide_categories_id_idx" ON "payload_locked_documents_rels" USING btree ("guide_categories_id");`)

  // Базовые категории; slug совпадает с прежними значениями-перечисления — по нему и переносим.
  await db.execute(sql`
  INSERT INTO "guide_categories" ("title", "slug", "order") VALUES
    ('Карьера', 'career', 1),
    ('ИИ в работе', 'ai', 2),
    ('Свой бизнес', 'business', 3),
    ('Другое', 'other', 4)
  ON CONFLICT ("slug") DO NOTHING;

  UPDATE "guides" g SET "category_id" = gc."id" FROM "guide_categories" gc WHERE g."category"::text = gc."slug";
  UPDATE "_guides_v" v SET "version_category_id" = gc."id" FROM "guide_categories" gc WHERE v."version_category"::text = gc."slug";`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "guide_categories" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "guide_categories" CASCADE;
  ALTER TABLE "guides" DROP CONSTRAINT IF EXISTS "guides_category_id_guide_categories_id_fk";
  ALTER TABLE "_guides_v" DROP CONSTRAINT IF EXISTS "_guides_v_version_category_id_guide_categories_id_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_guide_categories_fk";
  DROP INDEX IF EXISTS "guides_category_idx";
  DROP INDEX IF EXISTS "_guides_v_version_version_category_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_guide_categories_id_idx";
  ALTER TABLE "guides" DROP COLUMN IF EXISTS "category_id";
  ALTER TABLE "_guides_v" DROP COLUMN IF EXISTS "version_category_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "guide_categories_id";`)
}
