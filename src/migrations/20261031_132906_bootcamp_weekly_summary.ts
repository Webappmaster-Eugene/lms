import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TYPE "public"."enum_bootcamp_lead_events_type" ADD VALUE 'weekly_summary';`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Отметки отправленных сводок - служебные строки без заявки, без своего типа они не нужны.
  await db.execute(sql`
   ALTER TABLE "bootcamp_lead_events" ALTER COLUMN "type" SET DATA TYPE text;
  DELETE FROM "bootcamp_lead_events" WHERE "type" = 'weekly_summary';
  DROP TYPE "public"."enum_bootcamp_lead_events_type";
  CREATE TYPE "public"."enum_bootcamp_lead_events_type" AS ENUM('lead_created', 'entry_task_sent', 'entry_task_extended', 'solution_submitted', 'review_overdue', 'admitted', 'preparation', 'rejected', 'withdrawn', 'reopened', 'admission_cancelled', 'payment_link_sent', 'payment_page_opened', 'checkout_started', 'payment_failed_return', 'payment_reminder', 'payment_expired', 'paid', 'paid_manually', 'payment_alert', 'enrollment_started', 'enrollment_failed', 'enrolled', 'lms_signed_in', 'gitlab_signed_in', 'gitlab_event');
  ALTER TABLE "bootcamp_lead_events" ALTER COLUMN "type" SET DATA TYPE "public"."enum_bootcamp_lead_events_type" USING "type"::"public"."enum_bootcamp_lead_events_type";`)
}
