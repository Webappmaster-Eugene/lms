import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "interview_recordings" ADD COLUMN "analysis_backend" varchar;
  ALTER TABLE "interview_recordings" ADD COLUMN "analysis_remote_job_id" varchar;
  ALTER TABLE "interview_recordings" ADD COLUMN "analysis_remote_key" varchar;
  ALTER TABLE "interview_recordings" ADD COLUMN "analysis_submission_started_at" timestamp(3) with time zone;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "interview_recordings" DROP COLUMN "analysis_backend";
  ALTER TABLE "interview_recordings" DROP COLUMN "analysis_remote_job_id";
  ALTER TABLE "interview_recordings" DROP COLUMN "analysis_remote_key";
  ALTER TABLE "interview_recordings" DROP COLUMN "analysis_submission_started_at";`)
}
