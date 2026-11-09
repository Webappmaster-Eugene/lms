import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "reply_templates" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"content" varchar NOT NULL,
  	"usage_count" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "reply_templates_id" integer;
  CREATE INDEX "reply_templates_updated_at_idx" ON "reply_templates" USING btree ("updated_at");
  CREATE INDEX "reply_templates_created_at_idx" ON "reply_templates" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_reply_templates_fk" FOREIGN KEY ("reply_templates_id") REFERENCES "public"."reply_templates"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_reply_templates_id_idx" ON "payload_locked_documents_rels" USING btree ("reply_templates_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_reply_templates_fk";
  ALTER TABLE "reply_templates" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "reply_templates" CASCADE;
  DROP INDEX "payload_locked_documents_rels_reply_templates_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "reply_templates_id";`)
}
