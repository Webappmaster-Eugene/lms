import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_bootcamp_leads_reason" AS ENUM('first-job', 'switch-or-grow', 'interviews', 'new-area', 'other');
  CREATE TYPE "public"."enum_bootcamp_leads_urgency" AS ENUM('now', 'soon', 'browsing');
  CREATE TYPE "public"."enum_bootcamp_leads_hours_per_week" AS ENUM('under-5', '5-10', '10-20', 'over-20');
  CREATE TABLE "bootcamp_lead_resumes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"original_name" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric
  );
  
  ALTER TABLE "bootcamp_leads" ADD COLUMN "telegram" varchar;
  ALTER TABLE "bootcamp_leads" ADD COLUMN "reason" "enum_bootcamp_leads_reason";
  ALTER TABLE "bootcamp_leads" ADD COLUMN "problem" varchar;
  ALTER TABLE "bootcamp_leads" ADD COLUMN "story" varchar;
  ALTER TABLE "bootcamp_leads" ADD COLUMN "goal" varchar;
  ALTER TABLE "bootcamp_leads" ADD COLUMN "urgency" "enum_bootcamp_leads_urgency";
  ALTER TABLE "bootcamp_leads" ADD COLUMN "hours_per_week" "enum_bootcamp_leads_hours_per_week";
  ALTER TABLE "bootcamp_leads" ADD COLUMN "links" varchar;
  ALTER TABLE "bootcamp_leads" ADD COLUMN "resume_id" integer;
  ALTER TABLE "bootcamp_leads" ADD COLUMN "fill_seconds" numeric;
  ALTER TABLE "bootcamp_leads" ADD COLUMN "wrote_telegram" boolean DEFAULT false;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "bootcamp_lead_resumes_id" integer;
  CREATE INDEX "bootcamp_lead_resumes_updated_at_idx" ON "bootcamp_lead_resumes" USING btree ("updated_at");
  CREATE INDEX "bootcamp_lead_resumes_created_at_idx" ON "bootcamp_lead_resumes" USING btree ("created_at");
  CREATE UNIQUE INDEX "bootcamp_lead_resumes_filename_idx" ON "bootcamp_lead_resumes" USING btree ("filename");
  ALTER TABLE "bootcamp_leads" ADD CONSTRAINT "bootcamp_leads_resume_id_bootcamp_lead_resumes_id_fk" FOREIGN KEY ("resume_id") REFERENCES "public"."bootcamp_lead_resumes"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_bootcamp_lead_resumes_fk" FOREIGN KEY ("bootcamp_lead_resumes_id") REFERENCES "public"."bootcamp_lead_resumes"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "bootcamp_leads_resume_idx" ON "bootcamp_leads" USING btree ("resume_id");
  CREATE INDEX "payload_locked_documents_rels_bootcamp_lead_resumes_id_idx" ON "payload_locked_documents_rels" USING btree ("bootcamp_lead_resumes_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "bootcamp_leads" DROP CONSTRAINT "bootcamp_leads_resume_id_bootcamp_lead_resumes_id_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_bootcamp_lead_resumes_fk";
  ALTER TABLE "bootcamp_lead_resumes" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "bootcamp_lead_resumes" CASCADE;
  DROP INDEX "bootcamp_leads_resume_idx";
  DROP INDEX "payload_locked_documents_rels_bootcamp_lead_resumes_id_idx";
  ALTER TABLE "bootcamp_leads" DROP COLUMN "telegram";
  ALTER TABLE "bootcamp_leads" DROP COLUMN "reason";
  ALTER TABLE "bootcamp_leads" DROP COLUMN "problem";
  ALTER TABLE "bootcamp_leads" DROP COLUMN "story";
  ALTER TABLE "bootcamp_leads" DROP COLUMN "goal";
  ALTER TABLE "bootcamp_leads" DROP COLUMN "urgency";
  ALTER TABLE "bootcamp_leads" DROP COLUMN "hours_per_week";
  ALTER TABLE "bootcamp_leads" DROP COLUMN "links";
  ALTER TABLE "bootcamp_leads" DROP COLUMN "resume_id";
  ALTER TABLE "bootcamp_leads" DROP COLUMN "fill_seconds";
  ALTER TABLE "bootcamp_leads" DROP COLUMN "wrote_telegram";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "bootcamp_lead_resumes_id";
  DROP TYPE "public"."enum_bootcamp_leads_reason";
  DROP TYPE "public"."enum_bootcamp_leads_urgency";
  DROP TYPE "public"."enum_bootcamp_leads_hours_per_week";`)
}
