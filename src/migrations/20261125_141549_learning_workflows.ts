import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_bootcamp_enrollments_defense_outcome" AS ENUM('passed', 'revise');
  CREATE TABLE "tutoring_merge_requests" (
    "id" serial PRIMARY KEY NOT NULL,
    "project_id" integer NOT NULL,
    "mr_iid" numeric NOT NULL,
    "stage" numeric NOT NULL,
    "title" varchar NOT NULL,
    "is_open" boolean DEFAULT false NOT NULL,
    "head_sha" varchar,
    "event_at" timestamp(3) with time zone NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  DROP INDEX "bootcamp_enrollments_gitlab_username_idx";
  ALTER TABLE "users" ADD COLUMN "enrollment_identity_email" varchar;
  ALTER TABLE "bootcamp_programs" ADD COLUMN "bootcamp_grader_user_id" numeric;
  ALTER TABLE "bootcamp_enrollments" ADD COLUMN "needs_verified_gitlab_account" boolean DEFAULT false;
  ALTER TABLE "bootcamp_enrollments" ADD COLUMN "manuals_course_id" integer;
  ALTER TABLE "bootcamp_enrollments" ADD COLUMN "defense_outcome" "enum_bootcamp_enrollments_defense_outcome";
  ALTER TABLE "bootcamp_enrollments" ADD COLUMN "defense_url" varchar;
  ALTER TABLE "bootcamp_enrollments" ADD COLUMN "defense_recorded_at" timestamp(3) with time zone;
  ALTER TABLE "bootcamp_enrollments" ADD COLUMN "defense_mentor_id" integer;
  ALTER TABLE "bootcamp_week_submissions" ADD COLUMN "head_sha" varchar;
  ALTER TABLE "bootcamp_week_submissions" ADD COLUMN "head_at" timestamp(3) with time zone;
  ALTER TABLE "bootcamp_week_submissions" ADD COLUMN "verdict_sha" varchar;
  ALTER TABLE "bootcamp_week_submissions" ADD COLUMN "merged_head_sha" varchar;
  ALTER TABLE "tutoring_streams" ADD COLUMN "hourly_kopecks" numeric;
  ALTER TABLE "tutoring_streams" ADD COLUMN "creation_key" varchar;
  ALTER TABLE "tutoring_streams" ADD COLUMN "pending_invite_emails" varchar;
  ALTER TABLE "tutoring_streams" ADD COLUMN "invites_awaiting_identity" jsonb;
  ALTER TABLE "tutoring_charges" ADD COLUMN "attended_at" timestamp(3) with time zone;
  ALTER TABLE "tutoring_checks" ADD COLUMN "commit_sha" varchar;
  ALTER TABLE "tutoring_merge_requests" ADD CONSTRAINT "tutoring_merge_requests_project_id_tutoring_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."tutoring_projects"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "tutoring_merge_requests_project_idx" ON "tutoring_merge_requests" USING btree ("project_id");
  CREATE INDEX "tutoring_merge_requests_updated_at_idx" ON "tutoring_merge_requests" USING btree ("updated_at");
  CREATE INDEX "tutoring_merge_requests_created_at_idx" ON "tutoring_merge_requests" USING btree ("created_at");
  CREATE UNIQUE INDEX "project_mrIid_1_idx" ON "tutoring_merge_requests" USING btree ("project_id","mr_iid");
  CREATE INDEX "project_stage_isOpen_eventAt_idx" ON "tutoring_merge_requests" USING btree ("project_id","stage","is_open","event_at");
  ALTER TABLE "bootcamp_enrollments" ADD CONSTRAINT "bootcamp_enrollments_manuals_course_id_courses_id_fk" FOREIGN KEY ("manuals_course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "bootcamp_enrollments" ADD CONSTRAINT "bootcamp_enrollments_defense_mentor_id_users_id_fk" FOREIGN KEY ("defense_mentor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "bootcamp_enrollments_manuals_course_idx" ON "bootcamp_enrollments" USING btree ("manuals_course_id");
  CREATE INDEX "bootcamp_enrollments_defense_mentor_idx" ON "bootcamp_enrollments" USING btree ("defense_mentor_id");
  CREATE UNIQUE INDEX "streamGroup_gitlabUsername_idx" ON "bootcamp_enrollments" USING btree ("stream_group","gitlab_username");
  CREATE UNIQUE INDEX "tutoring_streams_creation_key_idx" ON "tutoring_streams" USING btree ("creation_key");
  CREATE INDEX "bootcamp_enrollments_gitlab_username_idx" ON "bootcamp_enrollments" USING btree ("gitlab_username");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "tutoring_merge_requests" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "tutoring_merge_requests" CASCADE;
  ALTER TABLE "bootcamp_enrollments" DROP CONSTRAINT "bootcamp_enrollments_manuals_course_id_courses_id_fk";

  ALTER TABLE "bootcamp_enrollments" DROP CONSTRAINT "bootcamp_enrollments_defense_mentor_id_users_id_fk";

  DROP INDEX "bootcamp_enrollments_manuals_course_idx";
  DROP INDEX "bootcamp_enrollments_defense_mentor_idx";
  DROP INDEX "streamGroup_gitlabUsername_idx";
  DROP INDEX "tutoring_streams_creation_key_idx";
  DROP INDEX "bootcamp_enrollments_gitlab_username_idx";
  CREATE UNIQUE INDEX "bootcamp_enrollments_gitlab_username_idx" ON "bootcamp_enrollments" USING btree ("gitlab_username");
  ALTER TABLE "users" DROP COLUMN "enrollment_identity_email";
  ALTER TABLE "bootcamp_programs" DROP COLUMN "bootcamp_grader_user_id";
  ALTER TABLE "bootcamp_enrollments" DROP COLUMN "needs_verified_gitlab_account";
  ALTER TABLE "bootcamp_enrollments" DROP COLUMN "manuals_course_id";
  ALTER TABLE "bootcamp_enrollments" DROP COLUMN "defense_outcome";
  ALTER TABLE "bootcamp_enrollments" DROP COLUMN "defense_url";
  ALTER TABLE "bootcamp_enrollments" DROP COLUMN "defense_recorded_at";
  ALTER TABLE "bootcamp_enrollments" DROP COLUMN "defense_mentor_id";
  ALTER TABLE "bootcamp_week_submissions" DROP COLUMN "head_sha";
  ALTER TABLE "bootcamp_week_submissions" DROP COLUMN "head_at";
  ALTER TABLE "bootcamp_week_submissions" DROP COLUMN "verdict_sha";
  ALTER TABLE "bootcamp_week_submissions" DROP COLUMN "merged_head_sha";
  ALTER TABLE "tutoring_streams" DROP COLUMN "hourly_kopecks";
  ALTER TABLE "tutoring_streams" DROP COLUMN "creation_key";
  ALTER TABLE "tutoring_streams" DROP COLUMN "pending_invite_emails";
  ALTER TABLE "tutoring_streams" DROP COLUMN "invites_awaiting_identity";
  ALTER TABLE "tutoring_charges" DROP COLUMN "attended_at";
  ALTER TABLE "tutoring_checks" DROP COLUMN "commit_sha";
  DROP TYPE "public"."enum_bootcamp_enrollments_defense_outcome";`)
}
