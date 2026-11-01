import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_trainer_topics_category" ADD VALUE 'sql';
  ALTER TYPE "public"."enum_trainer_tasks_languages" ADD VALUE 'sql' BEFORE 'html';
  ALTER TYPE "public"."enum_trainer_tasks_tags" ADD VALUE 'sql';
  ALTER TYPE "public"."enum_trainer_tasks_tags" ADD VALUE 'sql-select';
  ALTER TYPE "public"."enum_trainer_tasks_tags" ADD VALUE 'sql-functions';
  ALTER TYPE "public"."enum_trainer_tasks_tags" ADD VALUE 'sql-aggregates';
  ALTER TYPE "public"."enum_trainer_tasks_tags" ADD VALUE 'sql-joins';
  ALTER TYPE "public"."enum_trainer_tasks_tags" ADD VALUE 'sql-subqueries';
  ALTER TYPE "public"."enum_trainer_tasks_tags" ADD VALUE 'sql-dml';
  ALTER TYPE "public"."enum_trainer_tasks_tags" ADD VALUE 'sql-ddl';
  ALTER TYPE "public"."enum_trainer_tasks_tags" ADD VALUE 'sql-transactions';
  ALTER TYPE "public"."enum_user_trainer_progress_language" ADD VALUE 'sql' BEFORE 'html';
  ALTER TYPE "public"."enum_interview_rooms_language" ADD VALUE 'sql' BEFORE 'html';
  ALTER TABLE "trainer_topics" ADD COLUMN "assigned_only" boolean DEFAULT false;
  ALTER TABLE "trainer_tasks" ADD COLUMN "sql_check" varchar;
  ALTER TABLE "trainer_tasks" ADD COLUMN "sql_ordered" boolean DEFAULT false;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "trainer_topics" ALTER COLUMN "category" SET DATA TYPE text;
  ALTER TABLE "trainer_topics" ALTER COLUMN "category" SET DEFAULT 'javascript'::text;
  DROP TYPE "public"."enum_trainer_topics_category";
  CREATE TYPE "public"."enum_trainer_topics_category" AS ENUM('javascript', 'typescript', 'algorithms', 'leetcode', 'companies', 'patterns', 'webapi', 'go', 'frontend', 'python');
  ALTER TABLE "trainer_topics" ALTER COLUMN "category" SET DEFAULT 'javascript'::"public"."enum_trainer_topics_category";
  ALTER TABLE "trainer_topics" ALTER COLUMN "category" SET DATA TYPE "public"."enum_trainer_topics_category" USING "category"::"public"."enum_trainer_topics_category";
  ALTER TABLE "trainer_tasks_languages" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "public"."enum_trainer_tasks_languages";
  CREATE TYPE "public"."enum_trainer_tasks_languages" AS ENUM('js', 'ts', 'go', 'python', 'html', 'react', 'next');
  ALTER TABLE "trainer_tasks_languages" ALTER COLUMN "value" SET DATA TYPE "public"."enum_trainer_tasks_languages" USING "value"::"public"."enum_trainer_tasks_languages";
  ALTER TABLE "trainer_tasks_tags" ALTER COLUMN "value" SET DATA TYPE text;
  DROP TYPE "public"."enum_trainer_tasks_tags";
  CREATE TYPE "public"."enum_trainer_tasks_tags" AS ENUM('closures', 'this', 'hoisting', 'event-loop', 'prototypes', 'hof', 'async', 'promise', 'arrays', 'objects', 'strings', 'polyfill', 'data-structures', 'algorithms', 'recursion', 'leetcode', 'patterns', 'type-level', 'generics', 'web-api', 'performance', 'react', 'hooks', 'state', 'forms', 'accessibility', 'go', 'python', 'concurrency', 'channels', 'context', 'mutex', 'two-pointers', 'sliding-window', 'hash-table', 'stack', 'queue', 'binary-search', 'sorting', 'dynamic-programming', 'graph', 'tree', 'heap', 'linked-list', 'greedy', 'backtracking', 'livecoding', 'cancelation');
  ALTER TABLE "trainer_tasks_tags" ALTER COLUMN "value" SET DATA TYPE "public"."enum_trainer_tasks_tags" USING "value"::"public"."enum_trainer_tasks_tags";
  ALTER TABLE "user_trainer_progress" ALTER COLUMN "language" SET DATA TYPE text;
  ALTER TABLE "user_trainer_progress" ALTER COLUMN "language" SET DEFAULT 'js'::text;
  DROP TYPE "public"."enum_user_trainer_progress_language";
  CREATE TYPE "public"."enum_user_trainer_progress_language" AS ENUM('js', 'ts', 'go', 'python', 'html', 'react', 'next');
  ALTER TABLE "user_trainer_progress" ALTER COLUMN "language" SET DEFAULT 'js'::"public"."enum_user_trainer_progress_language";
  ALTER TABLE "user_trainer_progress" ALTER COLUMN "language" SET DATA TYPE "public"."enum_user_trainer_progress_language" USING "language"::"public"."enum_user_trainer_progress_language";
  ALTER TABLE "interview_rooms" ALTER COLUMN "language" SET DATA TYPE text;
  ALTER TABLE "interview_rooms" ALTER COLUMN "language" SET DEFAULT 'js'::text;
  DROP TYPE "public"."enum_interview_rooms_language";
  CREATE TYPE "public"."enum_interview_rooms_language" AS ENUM('js', 'ts', 'go', 'python', 'html', 'react', 'next');
  ALTER TABLE "interview_rooms" ALTER COLUMN "language" SET DEFAULT 'js'::"public"."enum_interview_rooms_language";
  ALTER TABLE "interview_rooms" ALTER COLUMN "language" SET DATA TYPE "public"."enum_interview_rooms_language" USING "language"::"public"."enum_interview_rooms_language";
  ALTER TABLE "trainer_topics" DROP COLUMN "assigned_only";
  ALTER TABLE "trainer_tasks" DROP COLUMN "sql_check";
  ALTER TABLE "trainer_tasks" DROP COLUMN "sql_ordered";`)
}
