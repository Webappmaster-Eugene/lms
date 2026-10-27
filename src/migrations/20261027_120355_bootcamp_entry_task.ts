import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_bootcamp_entry_tasks_program" AS ENUM('nodejs');
  CREATE TABLE "bootcamp_entry_tasks" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"program" "enum_bootcamp_entry_tasks_program" DEFAULT 'nodejs' NOT NULL,
  	"active" boolean DEFAULT true,
  	"readme" varchar NOT NULL,
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
  
  ALTER TABLE "bootcamp_leads" ADD COLUMN "entry_task_token" varchar;
  ALTER TABLE "bootcamp_leads" ADD COLUMN "entry_task_sent_at" timestamp(3) with time zone;
  ALTER TABLE "bootcamp_leads" ADD COLUMN "entry_task_due_at" timestamp(3) with time zone;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "bootcamp_entry_tasks_id" integer;
  CREATE INDEX "bootcamp_entry_tasks_updated_at_idx" ON "bootcamp_entry_tasks" USING btree ("updated_at");
  CREATE INDEX "bootcamp_entry_tasks_created_at_idx" ON "bootcamp_entry_tasks" USING btree ("created_at");
  CREATE UNIQUE INDEX "bootcamp_entry_tasks_filename_idx" ON "bootcamp_entry_tasks" USING btree ("filename");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_bootcamp_entry_tasks_fk" FOREIGN KEY ("bootcamp_entry_tasks_id") REFERENCES "public"."bootcamp_entry_tasks"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "bootcamp_leads_entry_task_token_idx" ON "bootcamp_leads" USING btree ("entry_task_token");
  CREATE INDEX "payload_locked_documents_rels_bootcamp_entry_tasks_id_idx" ON "payload_locked_documents_rels" USING btree ("bootcamp_entry_tasks_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // Сначала связь из payload_locked_documents_rels: DROP TABLE ... CASCADE удалил бы её сам,
  // и следующий DROP CONSTRAINT упал бы.
  await db.execute(sql`
   ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_bootcamp_entry_tasks_fk";
  DROP INDEX "payload_locked_documents_rels_bootcamp_entry_tasks_id_idx";
  DROP TABLE "bootcamp_entry_tasks";
  DROP INDEX "bootcamp_leads_entry_task_token_idx";
  ALTER TABLE "bootcamp_leads" DROP COLUMN "entry_task_token";
  ALTER TABLE "bootcamp_leads" DROP COLUMN "entry_task_sent_at";
  ALTER TABLE "bootcamp_leads" DROP COLUMN "entry_task_due_at";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "bootcamp_entry_tasks_id";
  DROP TYPE "public"."enum_bootcamp_entry_tasks_program";`)
}
