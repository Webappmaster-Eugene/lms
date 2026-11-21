import { type MigrateUpArgs, type MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
  CREATE TYPE "public"."enum_tutoring_meetings_deck_origin" AS ENUM('import', 'manual');
  CREATE TABLE "tutoring_deck_files" (
    "id" serial PRIMARY KEY NOT NULL,
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

  ALTER TABLE "tutoring_meetings" ADD COLUMN "deck_pdf_id" integer;
  ALTER TABLE "tutoring_meetings" ADD COLUMN "deck_pptx_id" integer;
  ALTER TABLE "tutoring_meetings" ADD COLUMN "deck_origin" "enum_tutoring_meetings_deck_origin";
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "tutoring_deck_files_id" integer;
  CREATE INDEX "tutoring_deck_files_updated_at_idx" ON "tutoring_deck_files" USING btree ("updated_at");
  CREATE INDEX "tutoring_deck_files_created_at_idx" ON "tutoring_deck_files" USING btree ("created_at");
  CREATE UNIQUE INDEX "tutoring_deck_files_filename_idx" ON "tutoring_deck_files" USING btree ("filename");
  ALTER TABLE "tutoring_meetings" ADD CONSTRAINT "tutoring_meetings_deck_pdf_id_tutoring_deck_files_id_fk" FOREIGN KEY ("deck_pdf_id") REFERENCES "public"."tutoring_deck_files"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tutoring_meetings" ADD CONSTRAINT "tutoring_meetings_deck_pptx_id_tutoring_deck_files_id_fk" FOREIGN KEY ("deck_pptx_id") REFERENCES "public"."tutoring_deck_files"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_tutoring_deck_files_fk" FOREIGN KEY ("tutoring_deck_files_id") REFERENCES "public"."tutoring_deck_files"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "tutoring_meetings_deck_pdf_idx" ON "tutoring_meetings" USING btree ("deck_pdf_id");
  CREATE INDEX "tutoring_meetings_deck_pptx_idx" ON "tutoring_meetings" USING btree ("deck_pptx_id");
  CREATE INDEX "payload_locked_documents_rels_tutoring_deck_files_id_idx" ON "payload_locked_documents_rels" USING btree ("tutoring_deck_files_id");`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
  ALTER TABLE "tutoring_meetings" DROP CONSTRAINT "tutoring_meetings_deck_pdf_id_tutoring_deck_files_id_fk";

  ALTER TABLE "tutoring_meetings" DROP CONSTRAINT "tutoring_meetings_deck_pptx_id_tutoring_deck_files_id_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_tutoring_deck_files_fk";

  DROP INDEX "tutoring_meetings_deck_pdf_idx";
  DROP INDEX "tutoring_meetings_deck_pptx_idx";
  DROP INDEX "payload_locked_documents_rels_tutoring_deck_files_id_idx";
  ALTER TABLE "tutoring_meetings" DROP COLUMN "deck_pdf_id";
  ALTER TABLE "tutoring_meetings" DROP COLUMN "deck_pptx_id";
  ALTER TABLE "tutoring_meetings" DROP COLUMN "deck_origin";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "tutoring_deck_files_id";
  DROP TABLE "tutoring_deck_files";
  DROP TYPE "public"."enum_tutoring_meetings_deck_origin";`)
}
