import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_bootcamp_enrollments_status" AS ENUM('queued', 'running', 'done', 'failed');
  ALTER TYPE "public"."enum_bootcamp_leads_status" ADD VALUE 'enrolled' BEFORE 'preparation';
  CREATE TABLE "bootcamp_enrollments" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"lead_id" integer NOT NULL,
  	"email" varchar NOT NULL,
  	"first_name" varchar NOT NULL,
  	"last_name" varchar NOT NULL,
  	"gitlab_username" varchar NOT NULL,
  	"stream_group" varchar NOT NULL,
  	"access_until" timestamp(3) with time zone,
  	"status" "enum_bootcamp_enrollments_status" DEFAULT 'queued' NOT NULL,
  	"steps" jsonb,
  	"error" varchar,
  	"attempts" numeric DEFAULT 0,
  	"lms_user_id" integer,
  	"gitlab_user_id" numeric,
  	"gitlab_project_id" numeric,
  	"gitlab_project_url" varchar,
  	"requested_by_id" integer,
  	"queued_at" timestamp(3) with time zone,
  	"started_at" timestamp(3) with time zone,
  	"finished_at" timestamp(3) with time zone,
  	"lms_signed_in_at" timestamp(3) with time zone,
  	"gitlab_signed_in_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "bootcamp_enrollments_id" integer;
  ALTER TABLE "bootcamp_enrollments" ADD CONSTRAINT "bootcamp_enrollments_lead_id_bootcamp_leads_id_fk" FOREIGN KEY ("lead_id") REFERENCES "public"."bootcamp_leads"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "bootcamp_enrollments" ADD CONSTRAINT "bootcamp_enrollments_lms_user_id_users_id_fk" FOREIGN KEY ("lms_user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "bootcamp_enrollments" ADD CONSTRAINT "bootcamp_enrollments_requested_by_id_users_id_fk" FOREIGN KEY ("requested_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "bootcamp_enrollments_lead_idx" ON "bootcamp_enrollments" USING btree ("lead_id");
  CREATE UNIQUE INDEX "bootcamp_enrollments_gitlab_username_idx" ON "bootcamp_enrollments" USING btree ("gitlab_username");
  CREATE INDEX "bootcamp_enrollments_lms_user_idx" ON "bootcamp_enrollments" USING btree ("lms_user_id");
  CREATE INDEX "bootcamp_enrollments_gitlab_project_id_idx" ON "bootcamp_enrollments" USING btree ("gitlab_project_id");
  CREATE INDEX "bootcamp_enrollments_requested_by_idx" ON "bootcamp_enrollments" USING btree ("requested_by_id");
  CREATE INDEX "bootcamp_enrollments_updated_at_idx" ON "bootcamp_enrollments" USING btree ("updated_at");
  CREATE INDEX "bootcamp_enrollments_created_at_idx" ON "bootcamp_enrollments" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_bootcamp_enrollments_fk" FOREIGN KEY ("bootcamp_enrollments_id") REFERENCES "public"."bootcamp_enrollments"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_bootcamp_enrollments_id_idx" ON "payload_locked_documents_rels" USING btree ("bootcamp_enrollments_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Сгенерированный откат удалял внешний ключ после DROP TABLE ... CASCADE, который его уже снял.
  await db.execute(sql`
   ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT IF EXISTS "payload_locked_documents_rels_bootcamp_enrollments_fk";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_bootcamp_enrollments_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "bootcamp_enrollments_id";
  DROP TABLE "bootcamp_enrollments" CASCADE;
  ALTER TABLE "bootcamp_leads" ALTER COLUMN "status" SET DATA TYPE text;
  ALTER TABLE "bootcamp_leads" ALTER COLUMN "status" SET DEFAULT 'new'::text;
  -- В прежнем перечислении этапа «Зачислен» нет: такие заявки возвращаются в «Допущен».
  UPDATE "bootcamp_leads" SET "status" = 'admitted' WHERE "status" = 'enrolled';
  DROP TYPE "public"."enum_bootcamp_leads_status";
  CREATE TYPE "public"."enum_bootcamp_leads_status" AS ENUM('new', 'contacted', 'diagnostic', 'admitted', 'preparation', 'rejected', 'withdrawn');
  ALTER TABLE "bootcamp_leads" ALTER COLUMN "status" SET DEFAULT 'new'::"public"."enum_bootcamp_leads_status";
  ALTER TABLE "bootcamp_leads" ALTER COLUMN "status" SET DATA TYPE "public"."enum_bootcamp_leads_status" USING "status"::"public"."enum_bootcamp_leads_status";
  DROP TYPE "public"."enum_bootcamp_enrollments_status";`)
}
