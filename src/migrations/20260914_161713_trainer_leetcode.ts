import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Тренажёр: переход от сравнения вывода к прогону тестов, поддержка TypeScript.
 *
 * Расширение по схеме expand-contract: старые колонки (`starter_code`,
 * `expected_output`, `description`) остаются на месте, у них лишь снимается
 * NOT NULL. Девять существующих задач продолжают работать в режиме
 * `check_mode = 'stdout'` — он и стоит значением по умолчанию.
 *
 * Отдельно здесь два шага, которых генератор Payload не делает:
 *   1. Бэкфилл `trainer_tasks_languages`. Поле `languages` обязательное, но для
 *      существующих задач строк в таблице-связке нет — без бэкфилла они
 *      перестали бы сохраняться из админки.
 *   2. Уникальный индекс на `user_trainer_progress (user_id, task_id)`. Его не
 *      было: от дублей защищал только find-then-create в коде роута, который
 *      не выдерживает параллельных отправок.
 *
 * Про `courses.roadmap_node_id`: колонку уже создала миграция
 * 20260914_140000_course_roadmap_node. Она попала в диф потому, что снимок
 * схемы (.json) есть только у сгенерированных миграций, а та написана руками.
 * Поэтому в `up` эти операции сделаны идемпотентными, а из `down` убраны —
 * откатывать чужую миграцию эта не должна.
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_trainer_topics_category" AS ENUM('javascript', 'typescript', 'algorithms', 'leetcode', 'companies', 'patterns', 'webapi');
  CREATE TYPE "public"."enum_trainer_tasks_languages" AS ENUM('js', 'ts');
  CREATE TYPE "public"."enum_trainer_tasks_test_cases_compare" AS ENUM('deep', 'strict', 'approx', 'sorted', 'set');
  CREATE TYPE "public"."enum_trainer_tasks_tags" AS ENUM('closures', 'this', 'hoisting', 'event-loop', 'prototypes', 'hof', 'async', 'promise', 'arrays', 'objects', 'strings', 'polyfill', 'data-structures', 'algorithms', 'recursion', 'leetcode', 'patterns', 'type-level', 'generics', 'web-api', 'performance');
  CREATE TYPE "public"."enum_trainer_tasks_companies" AS ENUM('yandex', 'ozon', 'avito', 'tbank', 'sber', 'wildberries', 'vk', 'faang');
  CREATE TYPE "public"."enum_trainer_tasks_check_mode" AS ENUM('stdout', 'unit', 'types');
  CREATE TYPE "public"."enum_user_trainer_progress_language" AS ENUM('js', 'ts');
  CREATE TYPE "public"."enum_user_trainer_progress_verified_by" AS ENUM('server', 'client');
  CREATE TABLE "trainer_tasks_languages" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_trainer_tasks_languages",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "trainer_tasks_test_cases" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"args_code" varchar,
  	"expected_code" varchar,
  	"compare" "enum_trainer_tasks_test_cases_compare" DEFAULT 'deep',
  	"hidden" boolean DEFAULT false
  );
  
  CREATE TABLE "trainer_tasks_tags" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_trainer_tasks_tags",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  CREATE TABLE "trainer_tasks_companies" (
  	"order" integer NOT NULL,
  	"parent_id" integer NOT NULL,
  	"value" "enum_trainer_tasks_companies",
  	"id" serial PRIMARY KEY NOT NULL
  );
  
  ALTER TABLE "trainer_tasks" ALTER COLUMN "description" DROP NOT NULL;
  ALTER TABLE "trainer_tasks" ALTER COLUMN "expected_output" DROP NOT NULL;
  ALTER TABLE "trainer_topics" ADD COLUMN "category" "enum_trainer_topics_category" DEFAULT 'javascript' NOT NULL;
  ALTER TABLE "trainer_tasks" ADD COLUMN "check_mode" "enum_trainer_tasks_check_mode" DEFAULT 'stdout' NOT NULL;
  ALTER TABLE "trainer_tasks" ADD COLUMN "description_md" varchar;
  ALTER TABLE "trainer_tasks" ADD COLUMN "entry_name" varchar;
  ALTER TABLE "trainer_tasks" ADD COLUMN "starter_code_ts" varchar;
  ALTER TABLE "trainer_tasks" ADD COLUMN "setup_code" varchar;
  ALTER TABLE "trainer_tasks" ADD COLUMN "test_code" varchar;
  ALTER TABLE "trainer_tasks" ADD COLUMN "type_harness" varchar;
  ALTER TABLE "trainer_tasks" ADD COLUMN "time_limit_ms" numeric DEFAULT 5000;
  ALTER TABLE "trainer_tasks" ADD COLUMN "solution_code_ts" varchar;
  ALTER TABLE "trainer_tasks" ADD COLUMN "solution_notes" varchar;
  ALTER TABLE "trainer_tasks" ADD COLUMN "source_url" varchar;
  ALTER TABLE "trainer_tasks" ADD COLUMN "leetcode_number" numeric;
  ALTER TABLE "user_trainer_progress" ADD COLUMN "language" "enum_user_trainer_progress_language" DEFAULT 'js';
  ALTER TABLE "user_trainer_progress" ADD COLUMN "failed_attempts" numeric DEFAULT 0;
  ALTER TABLE "user_trainer_progress" ADD COLUMN "verified_by" "enum_user_trainer_progress_verified_by" DEFAULT 'client';
  ALTER TABLE "user_trainer_progress" ADD COLUMN "last_result" jsonb;
  ALTER TABLE "trainer_tasks_languages" ADD CONSTRAINT "trainer_tasks_languages_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."trainer_tasks"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "trainer_tasks_test_cases" ADD CONSTRAINT "trainer_tasks_test_cases_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."trainer_tasks"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "trainer_tasks_tags" ADD CONSTRAINT "trainer_tasks_tags_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."trainer_tasks"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "trainer_tasks_companies" ADD CONSTRAINT "trainer_tasks_companies_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."trainer_tasks"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "trainer_tasks_languages_order_idx" ON "trainer_tasks_languages" USING btree ("order");
  CREATE INDEX "trainer_tasks_languages_parent_idx" ON "trainer_tasks_languages" USING btree ("parent_id");
  CREATE INDEX "trainer_tasks_test_cases_order_idx" ON "trainer_tasks_test_cases" USING btree ("_order");
  CREATE INDEX "trainer_tasks_test_cases_parent_id_idx" ON "trainer_tasks_test_cases" USING btree ("_parent_id");
  CREATE INDEX "trainer_tasks_tags_order_idx" ON "trainer_tasks_tags" USING btree ("order");
  CREATE INDEX "trainer_tasks_tags_parent_idx" ON "trainer_tasks_tags" USING btree ("parent_id");
  CREATE INDEX "trainer_tasks_companies_order_idx" ON "trainer_tasks_companies" USING btree ("order");
  CREATE INDEX "trainer_tasks_companies_parent_idx" ON "trainer_tasks_companies" USING btree ("parent_id");`)

  // Колонка и её индекс уже могут существовать — см. комментарий к миграции.
  await db.execute(sql`
    ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "roadmap_node_id" integer;

    DO $$ BEGIN
      ALTER TABLE "courses" ADD CONSTRAINT "courses_roadmap_node_id_roadmap_nodes_id_fk"
        FOREIGN KEY ("roadmap_node_id") REFERENCES "public"."roadmap_nodes"("id")
        ON DELETE set null ON UPDATE no action;
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    CREATE INDEX IF NOT EXISTS "courses_roadmap_node_idx" ON "courses" USING btree ("roadmap_node_id");
  `)

  // Бэкфилл: у каждой существующей задачи ровно один язык — JavaScript.
  await db.execute(sql`
    INSERT INTO "trainer_tasks_languages" ("order", "parent_id", "value")
    SELECT 0, t."id", 'js'::"enum_trainer_tasks_languages"
    FROM "trainer_tasks" t
    WHERE NOT EXISTS (
      SELECT 1 FROM "trainer_tasks_languages" l WHERE l."parent_id" = t."id"
    );
  `)

  // Дубли прогресса: оставляем самую «сильную» строку — решённую, а среди
  // равных ту, где больше попыток; при полном равенстве — последнюю созданную.
  await db.execute(sql`
    DELETE FROM "user_trainer_progress" p
    USING (
      SELECT "id",
             ROW_NUMBER() OVER (
               PARTITION BY "user_id", "task_id"
               ORDER BY "is_completed" DESC NULLS LAST,
                        COALESCE("attempts", 0) DESC,
                        "id" DESC
             ) AS rn
      FROM "user_trainer_progress"
    ) ranked
    WHERE p."id" = ranked."id" AND ranked.rn > 1;
  `)

  await db.execute(sql`
    CREATE UNIQUE INDEX IF NOT EXISTS "user_trainer_progress_user_task_unique_idx"
      ON "user_trainer_progress" USING btree ("user_id", "task_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP INDEX IF EXISTS "user_trainer_progress_user_task_unique_idx";
  ALTER TABLE "trainer_tasks_languages" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "trainer_tasks_test_cases" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "trainer_tasks_tags" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "trainer_tasks_companies" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "trainer_tasks_languages" CASCADE;
  DROP TABLE "trainer_tasks_test_cases" CASCADE;
  DROP TABLE "trainer_tasks_tags" CASCADE;
  DROP TABLE "trainer_tasks_companies" CASCADE;
  ALTER TABLE "trainer_tasks" ALTER COLUMN "description" SET NOT NULL;
  ALTER TABLE "trainer_tasks" ALTER COLUMN "expected_output" SET NOT NULL;
  ALTER TABLE "trainer_topics" DROP COLUMN "category";
  ALTER TABLE "trainer_tasks" DROP COLUMN "check_mode";
  ALTER TABLE "trainer_tasks" DROP COLUMN "description_md";
  ALTER TABLE "trainer_tasks" DROP COLUMN "entry_name";
  ALTER TABLE "trainer_tasks" DROP COLUMN "starter_code_ts";
  ALTER TABLE "trainer_tasks" DROP COLUMN "setup_code";
  ALTER TABLE "trainer_tasks" DROP COLUMN "test_code";
  ALTER TABLE "trainer_tasks" DROP COLUMN "type_harness";
  ALTER TABLE "trainer_tasks" DROP COLUMN "time_limit_ms";
  ALTER TABLE "trainer_tasks" DROP COLUMN "solution_code_ts";
  ALTER TABLE "trainer_tasks" DROP COLUMN "solution_notes";
  ALTER TABLE "trainer_tasks" DROP COLUMN "source_url";
  ALTER TABLE "trainer_tasks" DROP COLUMN "leetcode_number";
  ALTER TABLE "user_trainer_progress" DROP COLUMN "language";
  ALTER TABLE "user_trainer_progress" DROP COLUMN "failed_attempts";
  ALTER TABLE "user_trainer_progress" DROP COLUMN "verified_by";
  ALTER TABLE "user_trainer_progress" DROP COLUMN "last_result";
  DROP TYPE "public"."enum_trainer_topics_category";
  DROP TYPE "public"."enum_trainer_tasks_languages";
  DROP TYPE "public"."enum_trainer_tasks_test_cases_compare";
  DROP TYPE "public"."enum_trainer_tasks_tags";
  DROP TYPE "public"."enum_trainer_tasks_companies";
  DROP TYPE "public"."enum_trainer_tasks_check_mode";
  DROP TYPE "public"."enum_user_trainer_progress_language";
  DROP TYPE "public"."enum_user_trainer_progress_verified_by";`)
}
