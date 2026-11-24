import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_tutoring_introductions_program" AS ENUM('nodejs', 'react-next');
  CREATE TYPE "public"."enum_tutoring_introductions_deck_origin" AS ENUM('import', 'manual');
  CREATE TABLE "tutoring_introductions" (
    "id" serial PRIMARY KEY NOT NULL,
    "program" "enum_tutoring_introductions_program" NOT NULL,
    "deck_pdf_id" integer NOT NULL,
    "deck_pptx_id" integer NOT NULL,
    "instructor_notes" varchar NOT NULL,
    "deck_origin" "enum_tutoring_introductions_deck_origin" NOT NULL,
    "source_digest" varchar NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "tutoring_streams" ADD COLUMN "awaiting_first_lecture" boolean;
  ALTER TABLE "tutoring_streams" ADD COLUMN "introduction_starts_at" timestamp(3) with time zone;
  ALTER TABLE "tutoring_participants" ADD COLUMN "intro_submission_url" varchar;
  ALTER TABLE "tutoring_participants" ADD COLUMN "graduated_through" numeric;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "tutoring_introductions_id" integer;
  ALTER TABLE "tutoring_introductions" ADD CONSTRAINT "tutoring_introductions_deck_pdf_id_tutoring_deck_files_id_fk" FOREIGN KEY ("deck_pdf_id") REFERENCES "public"."tutoring_deck_files"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tutoring_introductions" ADD CONSTRAINT "tutoring_introductions_deck_pptx_id_tutoring_deck_files_id_fk" FOREIGN KEY ("deck_pptx_id") REFERENCES "public"."tutoring_deck_files"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "tutoring_introductions_program_idx" ON "tutoring_introductions" USING btree ("program");
  CREATE INDEX "tutoring_introductions_deck_pdf_idx" ON "tutoring_introductions" USING btree ("deck_pdf_id");
  CREATE INDEX "tutoring_introductions_deck_pptx_idx" ON "tutoring_introductions" USING btree ("deck_pptx_id");
  CREATE INDEX "tutoring_introductions_updated_at_idx" ON "tutoring_introductions" USING btree ("updated_at");
  CREATE INDEX "tutoring_introductions_created_at_idx" ON "tutoring_introductions" USING btree ("created_at");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_tutoring_introductions_fk" FOREIGN KEY ("tutoring_introductions_id") REFERENCES "public"."tutoring_introductions"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_tutoring_introductions_id_idx" ON "payload_locked_documents_rels" USING btree ("tutoring_introductions_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "tutoring_introductions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_tutoring_introductions_fk";

  DROP INDEX "payload_locked_documents_rels_tutoring_introductions_id_idx";
  ALTER TABLE "tutoring_streams" DROP COLUMN "awaiting_first_lecture";
  ALTER TABLE "tutoring_streams" DROP COLUMN "introduction_starts_at";
  ALTER TABLE "tutoring_participants" DROP COLUMN "intro_submission_url";
  ALTER TABLE "tutoring_participants" DROP COLUMN "graduated_through";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "tutoring_introductions_id";
  DROP TABLE "tutoring_introductions" CASCADE;
  DROP TYPE "public"."enum_tutoring_introductions_program";
  DROP TYPE "public"."enum_tutoring_introductions_deck_origin";`)
}
