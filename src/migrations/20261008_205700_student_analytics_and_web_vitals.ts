import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_student_session_telemetry_geo_source" AS ENUM('local-mmdb', 'unknown');
  CREATE TYPE "public"."enum_student_learning_events_type" AS ENUM('login', 'logout', 'page_view', 'lesson_view', 'lesson_completed', 'trainer_completed', 'achievement_unlocked', 'certificate_issued');
  CREATE TYPE "public"."enum_student_learning_events_source" AS ENUM('server', 'observed');
  CREATE TYPE "public"."enum_web_vitals_reports_name" AS ENUM('LCP', 'INP', 'CLS');
  CREATE TYPE "public"."enum_web_vitals_reports_navigation_type" AS ENUM('navigate', 'reload', 'back-forward', 'back-forward-cache', 'prerender', 'restore', 'soft-navigation');
  CREATE TABLE "student_session_telemetry" (
    "id" serial PRIMARY KEY NOT NULL,
    "user_id" integer NOT NULL,
    "session_hash" varchar NOT NULL,
    "first_seen_at" timestamp(3) with time zone NOT NULL,
    "last_seen_at" timestamp(3) with time zone NOT NULL,
    "expires_at" timestamp(3) with time zone NOT NULL,
    "ended_at" timestamp(3) with time zone,
    "device" varchar NOT NULL,
    "browser" varchar NOT NULL,
    "os" varchar NOT NULL,
    "ip" varchar,
    "ip_expires_at" timestamp(3) with time zone,
    "country_code" varchar,
    "country" varchar,
    "region" varchar,
    "city" varchar,
    "geo_source" "enum_student_session_telemetry_geo_source" DEFAULT 'unknown' NOT NULL,
    "timezone" varchar,
    "standalone" boolean,
    "path" varchar,
    "course_id" integer,
    "lesson_id" integer,
    "last_event_at" timestamp(3) with time zone,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "student_learning_events" (
    "id" serial PRIMARY KEY NOT NULL,
    "user_id" integer NOT NULL,
    "event_key" varchar NOT NULL,
    "type" "enum_student_learning_events_type" NOT NULL,
    "source" "enum_student_learning_events_source" NOT NULL,
    "at" timestamp(3) with time zone NOT NULL,
    "session_id" integer,
    "course_id" integer,
    "lesson_id" integer,
    "task_id" numeric,
    "achievement_id" numeric,
    "certificate_id" numeric,
    "path" varchar,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "web_vitals_reports" (
    "id" serial PRIMARY KEY NOT NULL,
    "user_id" integer NOT NULL,
    "report_key" varchar NOT NULL,
    "session_hash" varchar NOT NULL,
    "name" "enum_web_vitals_reports_name" NOT NULL,
    "value" numeric NOT NULL,
    "route_template" varchar NOT NULL,
    "navigation_type" "enum_web_vitals_reports_navigation_type",
    "reported_at" timestamp(3) with time zone NOT NULL,
    "quota_window_started_at" timestamp(3) with time zone,
    "quota_report_count" numeric,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "student_session_telemetry" ADD CONSTRAINT "student_session_telemetry_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "student_session_telemetry" ADD CONSTRAINT "student_session_telemetry_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "student_session_telemetry" ADD CONSTRAINT "student_session_telemetry_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "student_learning_events" ADD CONSTRAINT "student_learning_events_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "student_learning_events" ADD CONSTRAINT "student_learning_events_session_id_student_session_telemetry_id_fk" FOREIGN KEY ("session_id") REFERENCES "public"."student_session_telemetry"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "student_learning_events" ADD CONSTRAINT "student_learning_events_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "student_learning_events" ADD CONSTRAINT "student_learning_events_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "web_vitals_reports" ADD CONSTRAINT "web_vitals_reports_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "student_session_telemetry_user_idx" ON "student_session_telemetry" USING btree ("user_id");
  CREATE UNIQUE INDEX "student_session_telemetry_session_hash_idx" ON "student_session_telemetry" USING btree ("session_hash");
  CREATE INDEX "student_session_telemetry_last_seen_at_idx" ON "student_session_telemetry" USING btree ("last_seen_at");
  CREATE INDEX "student_session_telemetry_expires_at_idx" ON "student_session_telemetry" USING btree ("expires_at");
  CREATE INDEX "student_session_telemetry_ip_expires_at_idx" ON "student_session_telemetry" USING btree ("ip_expires_at");
  CREATE INDEX "student_session_telemetry_course_idx" ON "student_session_telemetry" USING btree ("course_id");
  CREATE INDEX "student_session_telemetry_lesson_idx" ON "student_session_telemetry" USING btree ("lesson_id");
  CREATE INDEX "student_session_telemetry_updated_at_idx" ON "student_session_telemetry" USING btree ("updated_at");
  CREATE INDEX "student_session_telemetry_created_at_idx" ON "student_session_telemetry" USING btree ("created_at");
  CREATE INDEX "user_lastSeenAt_idx" ON "student_session_telemetry" USING btree ("user_id","last_seen_at");
  CREATE INDEX "student_learning_events_user_idx" ON "student_learning_events" USING btree ("user_id");
  CREATE UNIQUE INDEX "student_learning_events_event_key_idx" ON "student_learning_events" USING btree ("event_key");
  CREATE INDEX "student_learning_events_at_idx" ON "student_learning_events" USING btree ("at");
  CREATE INDEX "student_learning_events_session_idx" ON "student_learning_events" USING btree ("session_id");
  CREATE INDEX "student_learning_events_course_idx" ON "student_learning_events" USING btree ("course_id");
  CREATE INDEX "student_learning_events_lesson_idx" ON "student_learning_events" USING btree ("lesson_id");
  CREATE INDEX "student_learning_events_updated_at_idx" ON "student_learning_events" USING btree ("updated_at");
  CREATE INDEX "student_learning_events_created_at_idx" ON "student_learning_events" USING btree ("created_at");
  CREATE INDEX "user_at_idx" ON "student_learning_events" USING btree ("user_id","at");
  CREATE INDEX "web_vitals_reports_user_idx" ON "web_vitals_reports" USING btree ("user_id");
  CREATE UNIQUE INDEX "web_vitals_reports_report_key_idx" ON "web_vitals_reports" USING btree ("report_key");
  CREATE INDEX "web_vitals_reports_reported_at_idx" ON "web_vitals_reports" USING btree ("reported_at");
  CREATE INDEX "web_vitals_reports_updated_at_idx" ON "web_vitals_reports" USING btree ("updated_at");
  CREATE INDEX "web_vitals_reports_created_at_idx" ON "web_vitals_reports" USING btree ("created_at");
  CREATE INDEX "user_reportedAt_idx" ON "web_vitals_reports" USING btree ("user_id","reported_at");
  CREATE INDEX "sessionHash_createdAt_idx" ON "web_vitals_reports" USING btree ("session_hash","created_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "student_session_telemetry" CASCADE;
  DROP TABLE "student_learning_events" CASCADE;
  DROP TABLE "web_vitals_reports" CASCADE;
  DROP TYPE "public"."enum_student_session_telemetry_geo_source";
  DROP TYPE "public"."enum_student_learning_events_type";
  DROP TYPE "public"."enum_student_learning_events_source";
  DROP TYPE "public"."enum_web_vitals_reports_name";
  DROP TYPE "public"."enum_web_vitals_reports_navigation_type";`)
}
