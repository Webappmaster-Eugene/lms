import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_bootcamp_leads_program" AS ENUM('nodejs');
  CREATE TYPE "public"."enum_bootcamp_leads_status" AS ENUM('new', 'contacted', 'diagnostic', 'admitted', 'preparation', 'rejected', 'withdrawn');
  CREATE TABLE "bootcamp_leads" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"email" varchar NOT NULL,
  	"name" varchar,
  	"program" "enum_bootcamp_leads_program" DEFAULT 'nodejs' NOT NULL,
  	"status" "enum_bootcamp_leads_status" DEFAULT 'new' NOT NULL,
  	"assignee_id" integer,
  	"next_action_at" timestamp(3) with time zone,
  	"note" varchar,
  	"source_utm_source" varchar,
  	"source_utm_medium" varchar,
  	"source_utm_campaign" varchar,
  	"source_utm_content" varchar,
  	"source_utm_term" varchar,
  	"source_referrer_host" varchar,
  	"consent_version" varchar NOT NULL,
  	"consent_at" timestamp(3) with time zone NOT NULL,
  	"submission_count" numeric DEFAULT 1 NOT NULL,
  	"last_submitted_at" timestamp(3) with time zone,
  	"notified_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "bootcamp_leads_id" integer;
  ALTER TABLE "bootcamp_leads" ADD CONSTRAINT "bootcamp_leads_assignee_id_users_id_fk" FOREIGN KEY ("assignee_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "bootcamp_leads_assignee_idx" ON "bootcamp_leads" USING btree ("assignee_id");
  CREATE INDEX "bootcamp_leads_updated_at_idx" ON "bootcamp_leads" USING btree ("updated_at");
  CREATE INDEX "bootcamp_leads_created_at_idx" ON "bootcamp_leads" USING btree ("created_at");
  CREATE UNIQUE INDEX "program_email_idx" ON "bootcamp_leads" USING btree ("program","email");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_bootcamp_leads_fk" FOREIGN KEY ("bootcamp_leads_id") REFERENCES "public"."bootcamp_leads"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_bootcamp_leads_id_idx" ON "payload_locked_documents_rels" USING btree ("bootcamp_leads_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Сначала связь из payload_locked_documents_rels: DROP TABLE ... CASCADE удалил бы её сам,
  // и следующий DROP CONSTRAINT упал бы.
  await db.execute(sql`
   ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_bootcamp_leads_fk";
  DROP INDEX "payload_locked_documents_rels_bootcamp_leads_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "bootcamp_leads_id";
  DROP TABLE "bootcamp_leads";
  DROP TYPE "public"."enum_bootcamp_leads_program";
  DROP TYPE "public"."enum_bootcamp_leads_status";`)
}
