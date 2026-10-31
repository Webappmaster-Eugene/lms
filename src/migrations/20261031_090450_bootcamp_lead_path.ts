import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_bootcamp_payments_status" AS ENUM('pending', 'paid', 'cancelled');
  CREATE TYPE "public"."enum_bootcamp_payments_method" AS ENUM('robokassa', 'manual');
  CREATE TYPE "public"."enum_bootcamp_lead_events_type" AS ENUM('lead_created', 'entry_task_sent', 'entry_task_extended', 'solution_submitted', 'review_overdue', 'admitted', 'preparation', 'rejected', 'withdrawn', 'reopened', 'admission_cancelled', 'payment_link_sent', 'payment_page_opened', 'checkout_started', 'payment_failed_return', 'payment_reminder', 'payment_expired', 'paid', 'paid_manually', 'payment_alert', 'enrollment_started', 'enrollment_failed', 'enrolled', 'lms_signed_in', 'gitlab_signed_in', 'gitlab_event');
  ALTER TYPE "public"."enum_bootcamp_leads_status" ADD VALUE 'paid' BEFORE 'enrolled';
  CREATE TABLE "bootcamp_payments" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"lead_id" integer NOT NULL,
  	"amount_kopecks" numeric NOT NULL,
  	"status" "enum_bootcamp_payments_status" DEFAULT 'pending' NOT NULL,
  	"method" "enum_bootcamp_payments_method" DEFAULT 'robokassa' NOT NULL,
  	"is_test" boolean DEFAULT false,
  	"offer_version" varchar,
  	"offer_accepted_at" timestamp(3) with time zone,
  	"paid_at" timestamp(3) with time zone,
  	"processed_at" timestamp(3) with time zone,
  	"payment_method" varchar,
  	"inc_curr_label" varchar,
  	"fee" varchar,
  	"op_key" varchar,
  	"checked_at" timestamp(3) with time zone,
  	"fail_return_at" timestamp(3) with time zone,
  	"comment" varchar,
  	"marked_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "bootcamp_lead_events" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"lead_id" integer,
  	"type" "enum_bootcamp_lead_events_type" NOT NULL,
  	"message" varchar NOT NULL,
  	"actor_id" integer,
  	"data" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "bootcamp_leads" ADD COLUMN "admitted_at" timestamp(3) with time zone;
  ALTER TABLE "bootcamp_leads" ADD COLUMN "admitted_by_id" integer;
  ALTER TABLE "bootcamp_leads" ADD COLUMN "payment_amount_kopecks" numeric;
  ALTER TABLE "bootcamp_leads" ADD COLUMN "payment_due_at" timestamp(3) with time zone;
  ALTER TABLE "bootcamp_leads" ADD COLUMN "payment_token" varchar;
  ALTER TABLE "bootcamp_leads" ADD COLUMN "payment_link_sent_at" timestamp(3) with time zone;
  ALTER TABLE "bootcamp_leads" ADD COLUMN "payment_page_opened_at" timestamp(3) with time zone;
  ALTER TABLE "bootcamp_leads" ADD COLUMN "payment_started_at" timestamp(3) with time zone;
  ALTER TABLE "bootcamp_leads" ADD COLUMN "payment_reminder_sent_at" timestamp(3) with time zone;
  ALTER TABLE "bootcamp_leads" ADD COLUMN "payment_expired_notice_at" timestamp(3) with time zone;
  ALTER TABLE "bootcamp_leads" ADD COLUMN "paid_at" timestamp(3) with time zone;
  ALTER TABLE "bootcamp_leads" ADD COLUMN "decision_message" varchar;
  ALTER TABLE "bootcamp_leads" ADD COLUMN "review_alert_at" timestamp(3) with time zone;
  ALTER TABLE "bootcamp_leads" ADD COLUMN "admission" jsonb;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "bootcamp_payments_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "bootcamp_lead_events_id" integer;
  ALTER TABLE "bootcamp_payments" ADD CONSTRAINT "bootcamp_payments_lead_id_bootcamp_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."bootcamp_leads"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "bootcamp_payments" ADD CONSTRAINT "bootcamp_payments_marked_by_id_users_id_fk" FOREIGN KEY ("marked_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "bootcamp_lead_events" ADD CONSTRAINT "bootcamp_lead_events_lead_id_bootcamp_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."bootcamp_leads"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "bootcamp_lead_events" ADD CONSTRAINT "bootcamp_lead_events_actor_id_users_id_fk" FOREIGN KEY ("actor_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "bootcamp_payments_lead_idx" ON "bootcamp_payments" USING btree ("lead_id");
  CREATE INDEX "bootcamp_payments_marked_by_idx" ON "bootcamp_payments" USING btree ("marked_by_id");
  CREATE INDEX "bootcamp_payments_updated_at_idx" ON "bootcamp_payments" USING btree ("updated_at");
  CREATE INDEX "bootcamp_payments_created_at_idx" ON "bootcamp_payments" USING btree ("created_at");
  CREATE INDEX "bootcamp_lead_events_lead_idx" ON "bootcamp_lead_events" USING btree ("lead_id");
  CREATE INDEX "bootcamp_lead_events_type_idx" ON "bootcamp_lead_events" USING btree ("type");
  CREATE INDEX "bootcamp_lead_events_actor_idx" ON "bootcamp_lead_events" USING btree ("actor_id");
  CREATE INDEX "bootcamp_lead_events_updated_at_idx" ON "bootcamp_lead_events" USING btree ("updated_at");
  CREATE INDEX "bootcamp_lead_events_created_at_idx" ON "bootcamp_lead_events" USING btree ("created_at");
  ALTER TABLE "bootcamp_leads" ADD CONSTRAINT "bootcamp_leads_admitted_by_id_users_id_fk" FOREIGN KEY ("admitted_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_bootcamp_payments_fk" FOREIGN KEY ("bootcamp_payments_id") REFERENCES "public"."bootcamp_payments"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_bootcamp_lead_events_fk" FOREIGN KEY ("bootcamp_lead_events_id") REFERENCES "public"."bootcamp_lead_events"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "bootcamp_leads_admitted_by_idx" ON "bootcamp_leads" USING btree ("admitted_by_id");
  CREATE UNIQUE INDEX "bootcamp_leads_payment_token_idx" ON "bootcamp_leads" USING btree ("payment_token");
  CREATE INDEX "payload_locked_documents_rels_bootcamp_payments_id_idx" ON "payload_locked_documents_rels" USING btree ("bootcamp_payments_id");
  CREATE INDEX "payload_locked_documents_rels_bootcamp_lead_events_id_idx" ON "payload_locked_documents_rels" USING btree ("bootcamp_lead_events_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Сгенерированный откат снимал внешние ключи после DROP TABLE ... CASCADE, который их уже снял,
  // и пересоздавал перечисление этапов при строках «Оплачен»: они возвращаются в «Допущен».
  await db.execute(sql`
   ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_bootcamp_payments_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_bootcamp_lead_events_fk";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_bootcamp_payments_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_bootcamp_lead_events_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "bootcamp_payments_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "bootcamp_lead_events_id";
  DROP TABLE "bootcamp_payments" CASCADE;
  DROP TABLE "bootcamp_lead_events" CASCADE;
  ALTER TABLE "bootcamp_leads" DROP CONSTRAINT IF EXISTS "bootcamp_leads_admitted_by_id_users_id_fk";
  ALTER TABLE "bootcamp_leads" ALTER COLUMN "status" SET DATA TYPE text;
  ALTER TABLE "bootcamp_leads" ALTER COLUMN "status" SET DEFAULT 'new'::text;
  UPDATE "bootcamp_leads" SET "status" = 'admitted' WHERE "status" = 'paid';
  DROP TYPE "public"."enum_bootcamp_leads_status";
  CREATE TYPE "public"."enum_bootcamp_leads_status" AS ENUM('new', 'contacted', 'diagnostic', 'admitted', 'enrolled', 'preparation', 'rejected', 'withdrawn');
  ALTER TABLE "bootcamp_leads" ALTER COLUMN "status" SET DEFAULT 'new'::"public"."enum_bootcamp_leads_status";
  ALTER TABLE "bootcamp_leads" ALTER COLUMN "status" SET DATA TYPE "public"."enum_bootcamp_leads_status" USING "status"::"public"."enum_bootcamp_leads_status";
  DROP INDEX IF EXISTS "bootcamp_leads_admitted_by_idx";
  DROP INDEX IF EXISTS "bootcamp_leads_payment_token_idx";
  ALTER TABLE "bootcamp_leads" DROP COLUMN "admitted_at";
  ALTER TABLE "bootcamp_leads" DROP COLUMN "admitted_by_id";
  ALTER TABLE "bootcamp_leads" DROP COLUMN "payment_amount_kopecks";
  ALTER TABLE "bootcamp_leads" DROP COLUMN "payment_due_at";
  ALTER TABLE "bootcamp_leads" DROP COLUMN "payment_token";
  ALTER TABLE "bootcamp_leads" DROP COLUMN "payment_link_sent_at";
  ALTER TABLE "bootcamp_leads" DROP COLUMN "payment_page_opened_at";
  ALTER TABLE "bootcamp_leads" DROP COLUMN "payment_started_at";
  ALTER TABLE "bootcamp_leads" DROP COLUMN "payment_reminder_sent_at";
  ALTER TABLE "bootcamp_leads" DROP COLUMN "payment_expired_notice_at";
  ALTER TABLE "bootcamp_leads" DROP COLUMN "paid_at";
  ALTER TABLE "bootcamp_leads" DROP COLUMN "decision_message";
  ALTER TABLE "bootcamp_leads" DROP COLUMN "review_alert_at";
  ALTER TABLE "bootcamp_leads" DROP COLUMN "admission";
  DROP TYPE "public"."enum_bootcamp_payments_status";
  DROP TYPE "public"."enum_bootcamp_payments_method";
  DROP TYPE "public"."enum_bootcamp_lead_events_type";`)
}
