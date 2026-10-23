import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_guides_category" AS ENUM('career', 'ai', 'business', 'other');
  CREATE TYPE "public"."enum__guides_v_version_category" AS ENUM('career', 'ai', 'business', 'other');
  CREATE TYPE "public"."enum_guide_reads_helpful" AS ENUM('yes', 'no');
  CREATE TABLE "_guides_v" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"parent_id" integer,
  	"version_title" varchar NOT NULL,
  	"version_slug" varchar NOT NULL,
  	"version_summary" varchar NOT NULL,
  	"version_markdown" varchar,
  	"version_category" "enum__guides_v_version_category",
  	"version_reviewed_at" timestamp(3) with time zone,
  	"version_review_by" timestamp(3) with time zone,
  	"version_reading_minutes" numeric,
  	"version_announced_at" timestamp(3) with time zone,
  	"version_order" numeric DEFAULT 0,
  	"version_is_published" boolean DEFAULT false,
  	"version_updated_at" timestamp(3) with time zone,
  	"version_created_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "guide_reads" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer NOT NULL,
  	"guide_id" integer NOT NULL,
  	"helpful" "enum_guide_reads_helpful",
  	"comment" varchar,
  	"feedback_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "guides" ADD COLUMN "category" "enum_guides_category";
  ALTER TABLE "guides" ADD COLUMN "reviewed_at" timestamp(3) with time zone;
  ALTER TABLE "guides" ADD COLUMN "review_by" timestamp(3) with time zone;
  ALTER TABLE "guides" ADD COLUMN "reading_minutes" numeric;
  ALTER TABLE "guides" ADD COLUMN "announced_at" timestamp(3) with time zone;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "guide_reads_id" integer;
  ALTER TABLE "_guides_v" ADD CONSTRAINT "_guides_v_parent_id_guides_id_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."guides"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "guide_reads" ADD CONSTRAINT "guide_reads_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "guide_reads" ADD CONSTRAINT "guide_reads_guide_id_guides_id_fk" FOREIGN KEY ("guide_id") REFERENCES "public"."guides"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "_guides_v_parent_idx" ON "_guides_v" USING btree ("parent_id");
  CREATE INDEX "_guides_v_version_version_slug_idx" ON "_guides_v" USING btree ("version_slug");
  CREATE INDEX "_guides_v_version_version_updated_at_idx" ON "_guides_v" USING btree ("version_updated_at");
  CREATE INDEX "_guides_v_version_version_created_at_idx" ON "_guides_v" USING btree ("version_created_at");
  CREATE INDEX "_guides_v_created_at_idx" ON "_guides_v" USING btree ("created_at");
  CREATE INDEX "_guides_v_updated_at_idx" ON "_guides_v" USING btree ("updated_at");
  CREATE INDEX "guide_reads_user_idx" ON "guide_reads" USING btree ("user_id");
  CREATE INDEX "guide_reads_guide_idx" ON "guide_reads" USING btree ("guide_id");
  CREATE INDEX "guide_reads_updated_at_idx" ON "guide_reads" USING btree ("updated_at");
  CREATE INDEX "guide_reads_created_at_idx" ON "guide_reads" USING btree ("created_at");
  CREATE UNIQUE INDEX "user_guide_1_idx" ON "guide_reads" USING btree ("user_id","guide_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_guide_reads_fk" FOREIGN KEY ("guide_reads_id") REFERENCES "public"."guide_reads"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_guide_reads_id_idx" ON "payload_locked_documents_rels" USING btree ("guide_reads_id");`)

  // Колонка guides.content (старый Lexical) остаётся до следующего выката: expand-contract.
  // Уже опубликованные гайды не рассылаются заново как «новые».
  await db.execute(sql`UPDATE "guides" SET "announced_at" = "updated_at" WHERE "is_published" = true AND "announced_at" IS NULL`)
  // Приблизительно, как guideReadingMinutes: слова без адресов ссылок и разметки, 160 слов в минуту.
  // Точное значение хук пересчитает при следующем сохранении гайда.
  const markup = '\\]\\([^)]*\\)|[#*>`|_~-]+'
  await db.execute(sql`
    UPDATE "guides" SET "reading_minutes" = GREATEST(1, ROUND(COALESCE(array_length(regexp_split_to_array(
      trim(regexp_replace(COALESCE("markdown", ''), ${markup}, ' ', 'g')), ${'\\s+'}), 1), 0) / 160.0))
  `)
  // Первая версия — текущее состояние: иначе откатиться можно было бы только к правкам после выката.
  await db.execute(sql`
    INSERT INTO "_guides_v" ("parent_id", "version_title", "version_slug", "version_summary", "version_markdown", "version_category",
      "version_reviewed_at", "version_review_by", "version_reading_minutes", "version_announced_at", "version_order", "version_is_published",
      "version_updated_at", "version_created_at", "created_at", "updated_at")
    SELECT "id", "title", "slug", "summary", "markdown", NULL, NULL, NULL, "reading_minutes", "announced_at", "order", "is_published",
      "updated_at", "created_at", "updated_at", "updated_at"
    FROM "guides"
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Сначала ссылки на guide_reads, потом таблица: DROP TABLE … CASCADE сам снимает внешний ключ.
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_guide_reads_fk";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_guide_reads_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "guide_reads_id";
  DROP TABLE IF EXISTS "_guides_v" CASCADE;
  DROP TABLE IF EXISTS "guide_reads" CASCADE;
  ALTER TABLE "guides" DROP COLUMN IF EXISTS "category";
  ALTER TABLE "guides" DROP COLUMN IF EXISTS "reviewed_at";
  ALTER TABLE "guides" DROP COLUMN IF EXISTS "review_by";
  ALTER TABLE "guides" DROP COLUMN IF EXISTS "reading_minutes";
  ALTER TABLE "guides" DROP COLUMN IF EXISTS "announced_at";
  DROP TYPE IF EXISTS "public"."enum_guides_category";
  DROP TYPE IF EXISTS "public"."enum__guides_v_version_category";
  DROP TYPE IF EXISTS "public"."enum_guide_reads_helpful";`)
}
