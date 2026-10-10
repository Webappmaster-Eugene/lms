import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_interview_recordings_category" AS ENUM('mentor', 'community', 'personal');
  CREATE TYPE "public"."enum_interview_recordings_status" AS ENUM('uploading', 'ready', 'failed');
  CREATE TYPE "public"."enum_interview_recordings_analysis_status" AS ENUM('idle', 'queued', 'processing', 'completed', 'failed');
  CREATE TABLE "interview_directions" (
    "id" serial PRIMARY KEY NOT NULL,
    "title" varchar NOT NULL,
    "slug" varchar NOT NULL,
    "description" varchar,
    "order" numeric DEFAULT 0,
    "criteria" jsonb,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "interview_recordings" (
    "id" serial PRIMARY KEY NOT NULL,
    "title" varchar NOT NULL,
    "description" varchar,
    "direction_id" integer NOT NULL,
    "category" "enum_interview_recordings_category" NOT NULL,
    "owner_id" integer,
    "status" "enum_interview_recordings_status" DEFAULT 'uploading' NOT NULL,
    "size" numeric NOT NULL,
    "mime_type" varchar,
    "public_key" varchar,
    "public_path" varchar,
    "source_key" varchar,
    "disk_path" varchar,
    "upload_claim" varchar,
    "upload_lease_until" timestamp(3) with time zone,
    "analysis_status" "enum_interview_recordings_analysis_status" DEFAULT 'idle' NOT NULL,
    "analysis_progress" varchar,
    "analysis_error" varchar,
    "analysis_input" jsonb,
    "analysis_report" jsonb,
    "analysis_score" jsonb,
    "analysis_criteria" jsonb,
    "analysis_transcript" varchar,
    "analysis_model" varchar,
    "analysis_claim" varchar,
    "analysis_lease_until" timestamp(3) with time zone,
    "analysis_attempts" numeric DEFAULT 0,
    "analysis_requested_at" timestamp(3) with time zone,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "interview_directions_id" integer;
  ALTER TABLE "interview_recordings" ADD CONSTRAINT "interview_recordings_direction_id_interview_directions_id_fk" FOREIGN KEY ("direction_id") REFERENCES "public"."interview_directions"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "interview_recordings" ADD CONSTRAINT "interview_recordings_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "interview_directions_slug_idx" ON "interview_directions" USING btree ("slug");
  CREATE INDEX "interview_directions_updated_at_idx" ON "interview_directions" USING btree ("updated_at");
  CREATE INDEX "interview_directions_created_at_idx" ON "interview_directions" USING btree ("created_at");
  CREATE INDEX "interview_recordings_direction_idx" ON "interview_recordings" USING btree ("direction_id");
  CREATE INDEX "interview_recordings_owner_idx" ON "interview_recordings" USING btree ("owner_id");
  CREATE INDEX "interview_recordings_status_idx" ON "interview_recordings" USING btree ("status");
  CREATE UNIQUE INDEX "interview_recordings_source_key_idx" ON "interview_recordings" USING btree ("source_key");
  CREATE INDEX "interview_recordings_analysis_status_idx" ON "interview_recordings" USING btree ("analysis_status");
  CREATE INDEX "interview_recordings_analysis_lease_until_idx" ON "interview_recordings" USING btree ("analysis_lease_until");
  CREATE INDEX "interview_recordings_updated_at_idx" ON "interview_recordings" USING btree ("updated_at");
  CREATE INDEX "interview_recordings_created_at_idx" ON "interview_recordings" USING btree ("created_at");
  CREATE INDEX "direction_category_status_idx" ON "interview_recordings" USING btree ("direction_id","category","status");
  CREATE INDEX "owner_category_idx" ON "interview_recordings" USING btree ("owner_id","category");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_interview_directions_fk" FOREIGN KEY ("interview_directions_id") REFERENCES "public"."interview_directions"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_interview_directions_id_idx" ON "payload_locked_documents_rels" USING btree ("interview_directions_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "interview_directions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "interview_recordings" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "interview_directions" CASCADE;
  DROP TABLE "interview_recordings" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_interview_directions_fk";

  DROP INDEX "payload_locked_documents_rels_interview_directions_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "interview_directions_id";
  DROP TYPE "public"."enum_interview_recordings_category";
  DROP TYPE "public"."enum_interview_recordings_status";
  DROP TYPE "public"."enum_interview_recordings_analysis_status";`)
}
