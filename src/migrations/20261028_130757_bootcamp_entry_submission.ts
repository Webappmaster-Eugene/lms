import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "bootcamp_leads" ADD COLUMN "entry_submitted_at" timestamp(3) with time zone;
  ALTER TABLE "bootcamp_leads" ADD COLUMN "entry_submission_count" numeric;
  ALTER TABLE "bootcamp_leads" ADD COLUMN "entry_passed" numeric;
  ALTER TABLE "bootcamp_leads" ADD COLUMN "entry_total" numeric;
  ALTER TABLE "bootcamp_leads" ADD COLUMN "entry_result" varchar;
  ALTER TABLE "bootcamp_leads" ADD COLUMN "entry_solution" varchar;
  ALTER TABLE "bootcamp_leads" ADD COLUMN "entry_solutions" jsonb;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "bootcamp_leads" DROP COLUMN "entry_submitted_at";
  ALTER TABLE "bootcamp_leads" DROP COLUMN "entry_submission_count";
  ALTER TABLE "bootcamp_leads" DROP COLUMN "entry_passed";
  ALTER TABLE "bootcamp_leads" DROP COLUMN "entry_total";
  ALTER TABLE "bootcamp_leads" DROP COLUMN "entry_result";
  ALTER TABLE "bootcamp_leads" DROP COLUMN "entry_solution";
  ALTER TABLE "bootcamp_leads" DROP COLUMN "entry_solutions";`)
}
