import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_trainer_topics_category" ADD VALUE 'go';
  ALTER TYPE "public"."enum_trainer_topics_category" ADD VALUE 'frontend';
  ALTER TYPE "public"."enum_trainer_tasks_languages" ADD VALUE 'go';
  ALTER TYPE "public"."enum_trainer_tasks_languages" ADD VALUE 'html';
  ALTER TYPE "public"."enum_trainer_tasks_languages" ADD VALUE 'react';
  ALTER TYPE "public"."enum_trainer_tasks_languages" ADD VALUE 'next';
  ALTER TYPE "public"."enum_trainer_tasks_check_mode" ADD VALUE 'program';
  ALTER TYPE "public"."enum_trainer_tasks_check_mode" ADD VALUE 'dom';
  ALTER TYPE "public"."enum_user_trainer_progress_language" ADD VALUE 'go';
  ALTER TYPE "public"."enum_user_trainer_progress_language" ADD VALUE 'html';
  ALTER TYPE "public"."enum_user_trainer_progress_language" ADD VALUE 'react';
  ALTER TYPE "public"."enum_user_trainer_progress_language" ADD VALUE 'next';
  ALTER TYPE "public"."enum_interview_rooms_language" ADD VALUE 'go';
  ALTER TYPE "public"."enum_interview_rooms_language" ADD VALUE 'html';
  ALTER TYPE "public"."enum_interview_rooms_language" ADD VALUE 'react';
  ALTER TYPE "public"."enum_interview_rooms_language" ADD VALUE 'next';
  CREATE TABLE "trainer_tasks_runtime_cases" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "name" varchar,
    "hidden" boolean DEFAULT false,
    "input" varchar,
    "expected" varchar,
    "checks" jsonb,
    "viewport" jsonb,
    "path" varchar
  );

  ALTER TABLE "trainer_tasks" ADD COLUMN "starter_code_go" varchar;
  ALTER TABLE "trainer_tasks" ADD COLUMN "starter_files" jsonb;
  ALTER TABLE "trainer_tasks" ADD COLUMN "solution_code_go" varchar;
  ALTER TABLE "trainer_tasks" ADD COLUMN "solution_files" jsonb;
  ALTER TABLE "trainer_tasks_runtime_cases" ADD CONSTRAINT "trainer_tasks_runtime_cases_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."trainer_tasks"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "trainer_tasks_runtime_cases_order_idx" ON "trainer_tasks_runtime_cases" USING btree ("_order");
  CREATE INDEX "trainer_tasks_runtime_cases_parent_id_idx" ON "trainer_tasks_runtime_cases" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "trainer_tasks_runtime_cases" CASCADE;
  ALTER TABLE "trainer_topics" ALTER COLUMN "category" SET DATA TYPE text;
  ALTER TABLE "trainer_topics" ALTER COLUMN "category" SET DEFAULT 'javascript'::text;
  DROP TYPE "public"."enum_trainer_topics_category";
  CREATE TYPE "public"."enum_trainer_topics_category" AS ENUM('javascript', 'typescript', 'algorithms', 'leetcode', 'companies', 'patterns', 'webapi');
  ALTER TABLE "trainer_topics" ALTER COLUMN "category" SET DEFAULT 'javascript'::"public"."enum_trainer_topics_category";
  ALTER TABLE "trainer_topics" ALTER COLUMN "category" SET DATA TYPE "public"."enum_trainer_topics_category" USING "category"::"public"."enum_trainer_topics_category";
  ALTER TABLE "trainer_tasks_languages" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "public"."enum_trainer_tasks_languages";
  CREATE TYPE "public"."enum_trainer_tasks_languages" AS ENUM('js', 'ts');
  ALTER TABLE "trainer_tasks_languages" ALTER COLUMN "value" SET DATA TYPE "public"."enum_trainer_tasks_languages" USING "value"::"public"."enum_trainer_tasks_languages";
  ALTER TABLE "trainer_tasks" ALTER COLUMN "check_mode" SET DATA TYPE text;
  ALTER TABLE "trainer_tasks" ALTER COLUMN "check_mode" SET DEFAULT 'stdout'::text;
  DROP TYPE "public"."enum_trainer_tasks_check_mode";
  CREATE TYPE "public"."enum_trainer_tasks_check_mode" AS ENUM('stdout', 'unit', 'types');
  ALTER TABLE "trainer_tasks" ALTER COLUMN "check_mode" SET DEFAULT 'stdout'::"public"."enum_trainer_tasks_check_mode";
  ALTER TABLE "trainer_tasks" ALTER COLUMN "check_mode" SET DATA TYPE "public"."enum_trainer_tasks_check_mode" USING "check_mode"::"public"."enum_trainer_tasks_check_mode";
  ALTER TABLE "user_trainer_progress" ALTER COLUMN "language" SET DATA TYPE text;
  ALTER TABLE "user_trainer_progress" ALTER COLUMN "language" SET DEFAULT 'js'::text;
  DROP TYPE "public"."enum_user_trainer_progress_language";
  CREATE TYPE "public"."enum_user_trainer_progress_language" AS ENUM('js', 'ts');
  ALTER TABLE "user_trainer_progress" ALTER COLUMN "language" SET DEFAULT 'js'::"public"."enum_user_trainer_progress_language";
  ALTER TABLE "user_trainer_progress" ALTER COLUMN "language" SET DATA TYPE "public"."enum_user_trainer_progress_language" USING "language"::"public"."enum_user_trainer_progress_language";
  ALTER TABLE "interview_rooms" ALTER COLUMN "language" SET DATA TYPE text;
  ALTER TABLE "interview_rooms" ALTER COLUMN "language" SET DEFAULT 'js'::text;
  DROP TYPE "public"."enum_interview_rooms_language";
  CREATE TYPE "public"."enum_interview_rooms_language" AS ENUM('js', 'ts');
  ALTER TABLE "interview_rooms" ALTER COLUMN "language" SET DEFAULT 'js'::"public"."enum_interview_rooms_language";
  ALTER TABLE "interview_rooms" ALTER COLUMN "language" SET DATA TYPE "public"."enum_interview_rooms_language" USING "language"::"public"."enum_interview_rooms_language";
  ALTER TABLE "trainer_tasks" DROP COLUMN "starter_code_go";
  ALTER TABLE "trainer_tasks" DROP COLUMN "starter_files";
  ALTER TABLE "trainer_tasks" DROP COLUMN "solution_code_go";
  ALTER TABLE "trainer_tasks" DROP COLUMN "solution_files";`)
}
