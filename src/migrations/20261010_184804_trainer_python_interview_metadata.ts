import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_trainer_tasks_interview_format" AS ENUM('livecoding', 'algorithms', 'debugging', 'language', 'frontend', 'type-system');
  ALTER TYPE "public"."enum_trainer_topics_category" ADD VALUE 'python';
  ALTER TYPE "public"."enum_trainer_tasks_languages" ADD VALUE 'python' BEFORE 'html';
  ALTER TYPE "public"."enum_trainer_tasks_tags" ADD VALUE 'react';
  ALTER TYPE "public"."enum_trainer_tasks_tags" ADD VALUE 'hooks';
  ALTER TYPE "public"."enum_trainer_tasks_tags" ADD VALUE 'state';
  ALTER TYPE "public"."enum_trainer_tasks_tags" ADD VALUE 'forms';
  ALTER TYPE "public"."enum_trainer_tasks_tags" ADD VALUE 'accessibility';
  ALTER TYPE "public"."enum_trainer_tasks_tags" ADD VALUE 'go';
  ALTER TYPE "public"."enum_trainer_tasks_tags" ADD VALUE 'python';
  ALTER TYPE "public"."enum_trainer_tasks_tags" ADD VALUE 'concurrency';
  ALTER TYPE "public"."enum_trainer_tasks_tags" ADD VALUE 'channels';
  ALTER TYPE "public"."enum_trainer_tasks_tags" ADD VALUE 'context';
  ALTER TYPE "public"."enum_trainer_tasks_tags" ADD VALUE 'mutex';
  ALTER TYPE "public"."enum_trainer_tasks_tags" ADD VALUE 'two-pointers';
  ALTER TYPE "public"."enum_trainer_tasks_tags" ADD VALUE 'sliding-window';
  ALTER TYPE "public"."enum_trainer_tasks_tags" ADD VALUE 'hash-table';
  ALTER TYPE "public"."enum_trainer_tasks_tags" ADD VALUE 'stack';
  ALTER TYPE "public"."enum_trainer_tasks_tags" ADD VALUE 'queue';
  ALTER TYPE "public"."enum_trainer_tasks_tags" ADD VALUE 'binary-search';
  ALTER TYPE "public"."enum_trainer_tasks_tags" ADD VALUE 'sorting';
  ALTER TYPE "public"."enum_trainer_tasks_tags" ADD VALUE 'dynamic-programming';
  ALTER TYPE "public"."enum_trainer_tasks_tags" ADD VALUE 'graph';
  ALTER TYPE "public"."enum_trainer_tasks_tags" ADD VALUE 'tree';
  ALTER TYPE "public"."enum_trainer_tasks_tags" ADD VALUE 'heap';
  ALTER TYPE "public"."enum_trainer_tasks_tags" ADD VALUE 'linked-list';
  ALTER TYPE "public"."enum_trainer_tasks_tags" ADD VALUE 'greedy';
  ALTER TYPE "public"."enum_trainer_tasks_tags" ADD VALUE 'backtracking';
  ALTER TYPE "public"."enum_trainer_tasks_tags" ADD VALUE 'livecoding';
  ALTER TYPE "public"."enum_trainer_tasks_tags" ADD VALUE 'cancelation';
  ALTER TYPE "public"."enum_trainer_tasks_companies" ADD VALUE 'mts';
  ALTER TYPE "public"."enum_trainer_tasks_companies" ADD VALUE 'google';
  ALTER TYPE "public"."enum_trainer_tasks_companies" ADD VALUE 'meta';
  ALTER TYPE "public"."enum_trainer_tasks_companies" ADD VALUE 'amazon';
  ALTER TYPE "public"."enum_trainer_tasks_companies" ADD VALUE 'microsoft';
  ALTER TYPE "public"."enum_trainer_tasks_companies" ADD VALUE 'uber';
  ALTER TYPE "public"."enum_trainer_tasks_companies" ADD VALUE 'airbnb';
  ALTER TYPE "public"."enum_user_trainer_progress_language" ADD VALUE 'python' BEFORE 'html';
  ALTER TYPE "public"."enum_interview_rooms_language" ADD VALUE 'python' BEFORE 'html';
  ALTER TABLE "trainer_tasks" ADD COLUMN "starter_code_python" varchar;
  ALTER TABLE "trainer_tasks" ADD COLUMN "solution_code_python" varchar;
  ALTER TABLE "trainer_tasks" ADD COLUMN "interview_format" "enum_trainer_tasks_interview_format";
  ALTER TABLE "trainer_tasks" ADD COLUMN "recommended_minutes" numeric;
  ALTER TABLE "trainer_tasks" ADD COLUMN "company_evidence" jsonb;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "trainer_topics" ALTER COLUMN "category" SET DATA TYPE text;
  ALTER TABLE "trainer_topics" ALTER COLUMN "category" SET DEFAULT 'javascript'::text;
  DROP TYPE "public"."enum_trainer_topics_category";
  CREATE TYPE "public"."enum_trainer_topics_category" AS ENUM('javascript', 'typescript', 'algorithms', 'leetcode', 'companies', 'patterns', 'webapi', 'go', 'frontend');
  ALTER TABLE "trainer_topics" ALTER COLUMN "category" SET DEFAULT 'javascript'::"public"."enum_trainer_topics_category";
  ALTER TABLE "trainer_topics" ALTER COLUMN "category" SET DATA TYPE "public"."enum_trainer_topics_category" USING "category"::"public"."enum_trainer_topics_category";
  ALTER TABLE "trainer_tasks_languages" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "public"."enum_trainer_tasks_languages";
  CREATE TYPE "public"."enum_trainer_tasks_languages" AS ENUM('js', 'ts', 'go', 'html', 'react', 'next');
  ALTER TABLE "trainer_tasks_languages" ALTER COLUMN "value" SET DATA TYPE "public"."enum_trainer_tasks_languages" USING "value"::"public"."enum_trainer_tasks_languages";
  ALTER TABLE "trainer_tasks_tags" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "public"."enum_trainer_tasks_tags";
  CREATE TYPE "public"."enum_trainer_tasks_tags" AS ENUM('closures', 'this', 'hoisting', 'event-loop', 'prototypes', 'hof', 'async', 'promise', 'arrays', 'objects', 'strings', 'polyfill', 'data-structures', 'algorithms', 'recursion', 'leetcode', 'patterns', 'type-level', 'generics', 'web-api', 'performance');
  ALTER TABLE "trainer_tasks_tags" ALTER COLUMN "value" SET DATA TYPE "public"."enum_trainer_tasks_tags" USING "value"::"public"."enum_trainer_tasks_tags";
  ALTER TABLE "trainer_tasks_companies" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "public"."enum_trainer_tasks_companies";
  CREATE TYPE "public"."enum_trainer_tasks_companies" AS ENUM('yandex', 'ozon', 'avito', 'tbank', 'sber', 'wildberries', 'vk', 'faang');
  ALTER TABLE "trainer_tasks_companies" ALTER COLUMN "value" SET DATA TYPE "public"."enum_trainer_tasks_companies" USING "value"::"public"."enum_trainer_tasks_companies";
  ALTER TABLE "user_trainer_progress" ALTER COLUMN "language" SET DATA TYPE text;
  ALTER TABLE "user_trainer_progress" ALTER COLUMN "language" SET DEFAULT 'js'::text;
  DROP TYPE "public"."enum_user_trainer_progress_language";
  CREATE TYPE "public"."enum_user_trainer_progress_language" AS ENUM('js', 'ts', 'go', 'html', 'react', 'next');
  ALTER TABLE "user_trainer_progress" ALTER COLUMN "language" SET DEFAULT 'js'::"public"."enum_user_trainer_progress_language";
  ALTER TABLE "user_trainer_progress" ALTER COLUMN "language" SET DATA TYPE "public"."enum_user_trainer_progress_language" USING "language"::"public"."enum_user_trainer_progress_language";
  ALTER TABLE "interview_rooms" ALTER COLUMN "language" SET DATA TYPE text;
  ALTER TABLE "interview_rooms" ALTER COLUMN "language" SET DEFAULT 'js'::text;
  DROP TYPE "public"."enum_interview_rooms_language";
  CREATE TYPE "public"."enum_interview_rooms_language" AS ENUM('js', 'ts', 'go', 'html', 'react', 'next');
  ALTER TABLE "interview_rooms" ALTER COLUMN "language" SET DEFAULT 'js'::"public"."enum_interview_rooms_language";
  ALTER TABLE "interview_rooms" ALTER COLUMN "language" SET DATA TYPE "public"."enum_interview_rooms_language" USING "language"::"public"."enum_interview_rooms_language";
  ALTER TABLE "trainer_tasks" DROP COLUMN "starter_code_python";
  ALTER TABLE "trainer_tasks" DROP COLUMN "solution_code_python";
  ALTER TABLE "trainer_tasks" DROP COLUMN "interview_format";
  ALTER TABLE "trainer_tasks" DROP COLUMN "recommended_minutes";
  ALTER TABLE "trainer_tasks" DROP COLUMN "company_evidence";
  DROP TYPE "public"."enum_trainer_tasks_interview_format";`)
}
