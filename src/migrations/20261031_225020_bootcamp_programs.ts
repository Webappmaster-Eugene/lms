import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Программы буткемпов вместо констант одного Node.js. Программа заявки - текстовый ключ:
 * enum пришлось бы менять миграцией на каждую новую программу. Перевод enum в varchar
 * совместим с контейнерами прежней версии: они пишут и читают ту же строку 'nodejs'.
 * Программа nodejs заводится здесь же с прежними значениями констант, курс методичек -
 * по slug, если он уже импортирован.
 */
export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "bootcamp_programs" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"title" varchar NOT NULL,
  	"short_title" varchar NOT NULL,
  	"is_active" boolean DEFAULT true,
  	"landing_url" varchar NOT NULL,
  	"price_kopecks" numeric NOT NULL,
  	"payment_due_days" numeric DEFAULT 7 NOT NULL,
  	"offer_url" varchar NOT NULL,
  	"offer_version" varchar NOT NULL,
  	"receipt_item_name" varchar NOT NULL,
  	"manuals_course_id" integer,
  	"gitlab_course_project" varchar DEFAULT 'bootcamp/course' NOT NULL,
  	"gitlab_stream_group" varchar NOT NULL,
  	"grading_project" varchar DEFAULT 'bootcamp-staff/grading' NOT NULL,
  	"entry_task_set" varchar DEFAULT 'rental-js' NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "bootcamp_leads" ALTER COLUMN "program" DROP DEFAULT;
  ALTER TABLE "bootcamp_leads" ALTER COLUMN "program" SET DATA TYPE varchar USING "program"::text;
  ALTER TABLE "bootcamp_entry_tasks" ALTER COLUMN "program" DROP DEFAULT;
  ALTER TABLE "bootcamp_entry_tasks" ALTER COLUMN "program" SET DATA TYPE varchar USING "program"::text;
  ALTER TABLE "bootcamp_entry_tasks" ALTER COLUMN "program" SET DEFAULT 'nodejs';
  ALTER TABLE "bootcamp_enrollments" ADD COLUMN "program" varchar;
  ALTER TABLE "bootcamp_enrollments" ADD COLUMN "course_project" varchar;
  ALTER TABLE "bootcamp_enrollments" ADD COLUMN "grading_project" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "bootcamp_programs_id" integer;
  ALTER TABLE "bootcamp_programs" ADD CONSTRAINT "bootcamp_programs_manuals_course_id_courses_id_fk" FOREIGN KEY ("manuals_course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "bootcamp_programs_key_idx" ON "bootcamp_programs" USING btree ("key");
  CREATE INDEX "bootcamp_programs_manuals_course_idx" ON "bootcamp_programs" USING btree ("manuals_course_id");
  CREATE INDEX "bootcamp_programs_updated_at_idx" ON "bootcamp_programs" USING btree ("updated_at");
  CREATE INDEX "bootcamp_programs_created_at_idx" ON "bootcamp_programs" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_bootcamp_programs_fk" FOREIGN KEY ("bootcamp_programs_id") REFERENCES "public"."bootcamp_programs"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_bootcamp_programs_id_idx" ON "payload_locked_documents_rels" USING btree ("bootcamp_programs_id");
  DROP TYPE "public"."enum_bootcamp_leads_program";
  DROP TYPE "public"."enum_bootcamp_entry_tasks_program";

  INSERT INTO "bootcamp_programs" (
    "key", "title", "short_title", "is_active", "landing_url", "price_kopecks", "payment_due_days",
    "offer_url", "offer_version", "receipt_item_name", "manuals_course_id",
    "gitlab_course_project", "gitlab_stream_group", "grading_project", "entry_task_set"
  ) VALUES (
    'nodejs', 'Node.js: backend сервиса проката', 'Node.js', true, 'https://info.mentorcareer.ru/bootcamp/nodejs/', 4500000, 7,
    'https://info.mentorcareer.ru/bootcamp/nodejs/offer/', '2026-10-31', 'Буткемп Node.js: онлайн-обучение backend-разработке, 20 недель',
    (SELECT "id" FROM "courses" WHERE "slug" = 'nodejs-bootcamp-manuals' ORDER BY "id" LIMIT 1),
    'bootcamp/course', 'nodejs-bootcamp', 'bootcamp-staff/grading', 'rental-js'
  ) ON CONFLICT ("key") DO NOTHING;

  UPDATE "bootcamp_enrollments" SET "program" = 'nodejs', "course_project" = 'bootcamp/course', "grading_project" = 'bootcamp-staff/grading'
  WHERE "program" IS NULL;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Сгенерированный откат снимал внешний ключ после DROP TABLE ... CASCADE, который его уже снял.
  // Откат проходит, только пока все заявки и задания на nodejs: перечисление прежней версии знает только её.
  await db.execute(sql`
   ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_bootcamp_programs_fk";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_bootcamp_programs_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "bootcamp_programs_id";
  DROP TABLE "bootcamp_programs" CASCADE;
  CREATE TYPE "public"."enum_bootcamp_leads_program" AS ENUM('nodejs');
  CREATE TYPE "public"."enum_bootcamp_entry_tasks_program" AS ENUM('nodejs');
  ALTER TABLE "bootcamp_leads" ALTER COLUMN "program" SET DATA TYPE "public"."enum_bootcamp_leads_program" USING "program"::"public"."enum_bootcamp_leads_program";
  ALTER TABLE "bootcamp_leads" ALTER COLUMN "program" SET DEFAULT 'nodejs'::"public"."enum_bootcamp_leads_program";
  ALTER TABLE "bootcamp_entry_tasks" ALTER COLUMN "program" DROP DEFAULT;
  ALTER TABLE "bootcamp_entry_tasks" ALTER COLUMN "program" SET DATA TYPE "public"."enum_bootcamp_entry_tasks_program" USING "program"::"public"."enum_bootcamp_entry_tasks_program";
  ALTER TABLE "bootcamp_entry_tasks" ALTER COLUMN "program" SET DEFAULT 'nodejs'::"public"."enum_bootcamp_entry_tasks_program";
  ALTER TABLE "bootcamp_enrollments" DROP COLUMN "program";
  ALTER TABLE "bootcamp_enrollments" DROP COLUMN "course_project";
  ALTER TABLE "bootcamp_enrollments" DROP COLUMN "grading_project";`)
}
