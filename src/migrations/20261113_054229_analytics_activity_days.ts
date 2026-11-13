import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_admin_digests_kind" AS ENUM('inactive-students', 'bootcamp-lagging');
  CREATE TABLE "student_activity_days" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar NOT NULL,
  	"user_id" integer NOT NULL,
  	"day" varchar NOT NULL,
  	"course_id" integer,
  	"minutes" numeric DEFAULT 0 NOT NULL,
  	"lessons_completed" numeric DEFAULT 0 NOT NULL,
  	"trainer_solved" numeric DEFAULT 0 NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "admin_digests" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"kind" "enum_admin_digests_kind" NOT NULL,
  	"period" varchar NOT NULL,
  	"summary" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "student_activity_days" ADD CONSTRAINT "student_activity_days_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "student_activity_days" ADD CONSTRAINT "student_activity_days_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "student_activity_days_key_idx" ON "student_activity_days" USING btree ("key");
  CREATE INDEX "student_activity_days_user_idx" ON "student_activity_days" USING btree ("user_id");
  CREATE INDEX "student_activity_days_day_idx" ON "student_activity_days" USING btree ("day");
  CREATE INDEX "student_activity_days_course_idx" ON "student_activity_days" USING btree ("course_id");
  CREATE INDEX "student_activity_days_updated_at_idx" ON "student_activity_days" USING btree ("updated_at");
  CREATE INDEX "student_activity_days_created_at_idx" ON "student_activity_days" USING btree ("created_at");
  CREATE INDEX "user_day_idx" ON "student_activity_days" USING btree ("user_id","day");
  CREATE INDEX "course_day_idx" ON "student_activity_days" USING btree ("course_id","day");
  CREATE INDEX "admin_digests_updated_at_idx" ON "admin_digests" USING btree ("updated_at");
  CREATE INDEX "admin_digests_created_at_idx" ON "admin_digests" USING btree ("created_at");
  CREATE UNIQUE INDEX "kind_period_idx" ON "admin_digests" USING btree ("kind","period");`)

  // История в сводку: минуты - из событий открытия страниц и уроков (они хранятся 90 дней, одно
  // событие на сессию в минуту), прохождения уроков и задач - из прогресса за всё время. День по Москве.
  await db.execute(sql`
  INSERT INTO "student_activity_days" ("key", "user_id", "day", "course_id", "minutes", "lessons_completed", "trainer_solved")
  SELECT s."user_id" || ':' || s."day" || ':' || coalesce(s."course_id"::text, '-'), s."user_id", s."day", s."course_id",
    sum(s."minutes"), sum(s."lessons"), sum(s."tasks")
  FROM (
    SELECT e."user_id", to_char(e."at" AT TIME ZONE 'Europe/Moscow', 'YYYY-MM-DD') AS "day", e."course_id", count(*) AS "minutes", 0 AS "lessons", 0 AS "tasks"
    FROM "student_learning_events" e
    WHERE e."type" IN ('page_view', 'lesson_view')
    GROUP BY 1, 2, 3
    UNION ALL
    SELECT p."user_id", to_char(p."completed_at" AT TIME ZONE 'Europe/Moscow', 'YYYY-MM-DD'), l."course_id", 0, count(*), 0
    FROM "user_progress" p JOIN "lessons" l ON l."id" = p."lesson_id"
    WHERE p."is_completed" AND p."completed_at" IS NOT NULL
    GROUP BY 1, 2, 3
    UNION ALL
    SELECT t."user_id", to_char(t."completed_at" AT TIME ZONE 'Europe/Moscow', 'YYYY-MM-DD'), NULL::integer, 0, 0, count(*)
    FROM "user_trainer_progress" t
    WHERE t."is_completed" AND t."verified_by" = 'server' AND t."completed_at" IS NOT NULL
    GROUP BY 1, 2, 3
  ) s
  JOIN "users" u ON u."id" = s."user_id"
  GROUP BY s."user_id", s."day", s."course_id";`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "student_activity_days" CASCADE;
  DROP TABLE "admin_digests" CASCADE;
  DROP TYPE "public"."enum_admin_digests_kind";`)
}
