import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_bootcamp_refunds_status" AS ENUM('processing', 'done', 'cancelled');
  CREATE TYPE "public"."enum_bootcamp_refunds_method" AS ENUM('robokassa', 'manual');
  ALTER TYPE "public"."enum_bootcamp_leads_status" ADD VALUE 'refunded';
  ALTER TYPE "public"."enum_bootcamp_lead_events_type" ADD VALUE 'refund_requested';
  ALTER TYPE "public"."enum_bootcamp_lead_events_type" ADD VALUE 'refunded';
  ALTER TYPE "public"."enum_bootcamp_lead_events_type" ADD VALUE 'refund_cancelled';
  ALTER TYPE "public"."enum_bootcamp_lead_events_type" ADD VALUE 'access_revoked';
  ALTER TYPE "public"."enum_bootcamp_lead_events_type" ADD VALUE 'refund_alert';
  CREATE TABLE "bootcamp_refunds" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"lead_id" integer NOT NULL,
  	"payment_id" integer NOT NULL,
  	"amount_kopecks" numeric NOT NULL,
  	"status" "enum_bootcamp_refunds_status" DEFAULT 'processing' NOT NULL,
  	"method" "enum_bootcamp_refunds_method" NOT NULL,
  	"reason" varchar NOT NULL,
  	"request_id" varchar,
  	"robokassa_label" varchar,
  	"requested_by_id" integer,
  	"checked_at" timestamp(3) with time zone,
  	"finished_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "bootcamp_enrollments" ADD COLUMN "revoke_requested_at" timestamp(3) with time zone;
  ALTER TABLE "bootcamp_enrollments" ADD COLUMN "revoked_at" timestamp(3) with time zone;
  ALTER TABLE "bootcamp_enrollments" ADD COLUMN "revoke_error" varchar;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "bootcamp_refunds_id" integer;
  ALTER TABLE "bootcamp_refunds" ADD CONSTRAINT "bootcamp_refunds_lead_id_bootcamp_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."bootcamp_leads"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "bootcamp_refunds" ADD CONSTRAINT "bootcamp_refunds_payment_id_bootcamp_payments_id_fk" FOREIGN KEY ("payment_id") REFERENCES "public"."bootcamp_payments"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "bootcamp_refunds" ADD CONSTRAINT "bootcamp_refunds_requested_by_id_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "bootcamp_refunds_lead_idx" ON "bootcamp_refunds" USING btree ("lead_id");
  CREATE INDEX "bootcamp_refunds_payment_idx" ON "bootcamp_refunds" USING btree ("payment_id");
  CREATE INDEX "bootcamp_refunds_request_id_idx" ON "bootcamp_refunds" USING btree ("request_id");
  CREATE INDEX "bootcamp_refunds_requested_by_idx" ON "bootcamp_refunds" USING btree ("requested_by_id");
  CREATE INDEX "bootcamp_refunds_updated_at_idx" ON "bootcamp_refunds" USING btree ("updated_at");
  CREATE INDEX "bootcamp_refunds_created_at_idx" ON "bootcamp_refunds" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_bootcamp_refunds_fk" FOREIGN KEY ("bootcamp_refunds_id") REFERENCES "public"."bootcamp_refunds"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_bootcamp_refunds_id_idx" ON "payload_locked_documents_rels" USING btree ("bootcamp_refunds_id");`)
}

// Откат возможен, пока нет заявок с этапом «Деньги возвращены» и событий возврата: старое перечисление их не примет.
// Ограничение снимается до DROP TABLE CASCADE: каскад уносит его вместе с таблицей, и повторный DROP CONSTRAINT падал бы.
export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_bootcamp_refunds_fk";
  ALTER TABLE "bootcamp_refunds" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "bootcamp_refunds" CASCADE;
  
  ALTER TABLE "bootcamp_leads" ALTER COLUMN "status" SET DATA TYPE text;
  ALTER TABLE "bootcamp_leads" ALTER COLUMN "status" SET DEFAULT 'new'::text;
  DROP TYPE "public"."enum_bootcamp_leads_status";
  CREATE TYPE "public"."enum_bootcamp_leads_status" AS ENUM('new', 'contacted', 'diagnostic', 'admitted', 'paid', 'enrolled', 'preparation', 'rejected', 'withdrawn');
  ALTER TABLE "bootcamp_leads" ALTER COLUMN "status" SET DEFAULT 'new'::"public"."enum_bootcamp_leads_status";
  ALTER TABLE "bootcamp_leads" ALTER COLUMN "status" SET DATA TYPE "public"."enum_bootcamp_leads_status" USING "status"::"public"."enum_bootcamp_leads_status";
  ALTER TABLE "bootcamp_lead_events" ALTER COLUMN "type" SET DATA TYPE text;
  DROP TYPE "public"."enum_bootcamp_lead_events_type";
  CREATE TYPE "public"."enum_bootcamp_lead_events_type" AS ENUM('lead_created', 'entry_task_sent', 'entry_task_extended', 'solution_submitted', 'review_overdue', 'admitted', 'preparation', 'rejected', 'withdrawn', 'reopened', 'admission_cancelled', 'payment_link_sent', 'payment_page_opened', 'checkout_started', 'payment_failed_return', 'payment_reminder', 'payment_expired', 'paid', 'paid_manually', 'payment_alert', 'enrollment_started', 'enrollment_failed', 'enrolled', 'lms_signed_in', 'gitlab_signed_in', 'gitlab_event', 'weekly_summary');
  ALTER TABLE "bootcamp_lead_events" ALTER COLUMN "type" SET DATA TYPE "public"."enum_bootcamp_lead_events_type" USING "type"::"public"."enum_bootcamp_lead_events_type";
  DROP INDEX "payload_locked_documents_rels_bootcamp_refunds_id_idx";
  ALTER TABLE "bootcamp_enrollments" DROP COLUMN "revoke_requested_at";
  ALTER TABLE "bootcamp_enrollments" DROP COLUMN "revoked_at";
  ALTER TABLE "bootcamp_enrollments" DROP COLUMN "revoke_error";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "bootcamp_refunds_id";
  DROP TYPE "public"."enum_bootcamp_refunds_status";
  DROP TYPE "public"."enum_bootcamp_refunds_method";`)
}
