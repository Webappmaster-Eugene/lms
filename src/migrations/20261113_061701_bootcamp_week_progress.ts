import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_bootcamp_week_submissions_pipeline_status" AS ENUM('success', 'failed');
  CREATE TYPE "public"."enum_bootcamp_week_submissions_verdict" AS ENUM('passed', 'failed', 'not-run', 'infra');
  CREATE TABLE "bootcamp_streams_weeks" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"week" numeric NOT NULL,
  	"due_at" timestamp(3) with time zone NOT NULL
  );
  
  CREATE TABLE "bootcamp_streams" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"program" varchar NOT NULL,
  	"gitlab_group" varchar NOT NULL,
  	"starts_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "bootcamp_week_submissions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"enrollment_id" integer NOT NULL,
  	"week" numeric NOT NULL,
  	"mr_iid" numeric NOT NULL,
  	"title" varchar,
  	"mr_url" varchar,
  	"branch" varchar,
  	"opened_at" timestamp(3) with time zone,
  	"last_commit_at" timestamp(3) with time zone,
  	"pipeline_status" "enum_bootcamp_week_submissions_pipeline_status",
  	"pipeline_at" timestamp(3) with time zone,
  	"verdict" "enum_bootcamp_week_submissions_verdict",
  	"checks_passed" numeric,
  	"checks_total" numeric,
  	"attempt" numeric,
  	"verdict_at" timestamp(3) with time zone,
  	"merged_at" timestamp(3) with time zone,
  	"closed_at" timestamp(3) with time zone,
  	"review_alert_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "bootcamp_streams_id" integer;
  ALTER TABLE "bootcamp_streams_weeks" ADD CONSTRAINT "bootcamp_streams_weeks_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."bootcamp_streams"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "bootcamp_week_submissions" ADD CONSTRAINT "bootcamp_week_submissions_enrollment_id_bootcamp_enrollments_id_fk" FOREIGN KEY ("enrollment_id") REFERENCES "public"."bootcamp_enrollments"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "bootcamp_streams_weeks_order_idx" ON "bootcamp_streams_weeks" USING btree ("_order");
  CREATE INDEX "bootcamp_streams_weeks_parent_id_idx" ON "bootcamp_streams_weeks" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "bootcamp_streams_gitlab_group_idx" ON "bootcamp_streams" USING btree ("gitlab_group");
  CREATE INDEX "bootcamp_streams_updated_at_idx" ON "bootcamp_streams" USING btree ("updated_at");
  CREATE INDEX "bootcamp_streams_created_at_idx" ON "bootcamp_streams" USING btree ("created_at");
  CREATE INDEX "bootcamp_week_submissions_enrollment_idx" ON "bootcamp_week_submissions" USING btree ("enrollment_id");
  CREATE INDEX "bootcamp_week_submissions_updated_at_idx" ON "bootcamp_week_submissions" USING btree ("updated_at");
  CREATE INDEX "bootcamp_week_submissions_created_at_idx" ON "bootcamp_week_submissions" USING btree ("created_at");
  CREATE UNIQUE INDEX "enrollment_mrIid_idx" ON "bootcamp_week_submissions" USING btree ("enrollment_id","mr_iid");
  CREATE INDEX "enrollment_week_idx" ON "bootcamp_week_submissions" USING btree ("enrollment_id","week");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_bootcamp_streams_fk" FOREIGN KEY ("bootcamp_streams_id") REFERENCES "public"."bootcamp_streams"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_bootcamp_streams_id_idx" ON "payload_locked_documents_rels" USING btree ("bootcamp_streams_id");`)

  // Первый поток по календарю документа 13 плана (решение владельца 09.11.2026): срок пары учебных
  // недель - начало следующей пары встреч по Москве, у праздничных 6-7 марта +1 день, защиты до 14 мая.
  // Группа потока - текущая группа программы nodejs; без неё поток не создаётся.
  await db.execute(sql`
  WITH stream AS (
    INSERT INTO "bootcamp_streams" ("title", "program", "gitlab_group", "starts_at")
    SELECT 'Поток 1, февраль 2027', p."key", p."gitlab_stream_group", '2027-02-12T21:00:00.000Z'
    FROM "bootcamp_programs" p
    WHERE p."key" = 'nodejs' AND coalesce(p."gitlab_stream_group", '') <> ''
    ON CONFLICT ("gitlab_group") DO NOTHING
    RETURNING "id"
  )
  INSERT INTO "bootcamp_streams_weeks" ("_order", "_parent_id", "id", "week", "due_at")
  SELECT w.week, stream."id", substr(md5(stream."id"::text || ':' || w.week::text), 1, 24), w.week, w.due_at::timestamptz
  FROM stream, (VALUES (1, '2027-02-20T21:00:00.000Z'), (2, '2027-02-20T21:00:00.000Z'), (3, '2027-02-26T21:00:00.000Z'), (4, '2027-02-26T21:00:00.000Z'),
    (5, '2027-03-05T21:00:00.000Z'), (6, '2027-03-05T21:00:00.000Z'), (7, '2027-03-13T21:00:00.000Z'), (8, '2027-03-13T21:00:00.000Z'),
    (9, '2027-03-19T21:00:00.000Z'), (10, '2027-03-19T21:00:00.000Z'), (11, '2027-03-26T21:00:00.000Z'), (12, '2027-03-26T21:00:00.000Z'),
    (13, '2027-04-09T21:00:00.000Z'), (14, '2027-04-09T21:00:00.000Z'), (15, '2027-04-16T21:00:00.000Z'), (16, '2027-04-16T21:00:00.000Z'),
    (17, '2027-04-23T21:00:00.000Z'), (18, '2027-05-04T21:00:00.000Z'), (19, '2027-05-04T21:00:00.000Z'), (20, '2027-05-14T21:00:00.000Z')) AS w(week, due_at);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Сначала связь из payload_locked_documents_rels: DROP TABLE ... CASCADE снял бы её сам, и
  // следующий DROP CONSTRAINT упал бы на отсутствующем ограничении.
  await db.execute(sql`
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_bootcamp_streams_fk";
  DROP INDEX "payload_locked_documents_rels_bootcamp_streams_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "bootcamp_streams_id";
  DROP TABLE "bootcamp_streams_weeks" CASCADE;
  DROP TABLE "bootcamp_streams" CASCADE;
  DROP TABLE "bootcamp_week_submissions" CASCADE;
  DROP TYPE "public"."enum_bootcamp_week_submissions_pipeline_status";
  DROP TYPE "public"."enum_bootcamp_week_submissions_verdict";`)
}
