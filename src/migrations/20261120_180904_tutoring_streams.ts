import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_tutoring_meetings_program" AS ENUM('nodejs', 'react-next');
  CREATE TYPE "public"."enum_tutoring_streams_program" AS ENUM('nodejs', 'react-next');
  CREATE TYPE "public"."enum_tutoring_streams_status" AS ENUM('draft', 'active', 'archived');
  CREATE TYPE "public"."enum_tutoring_reviews_status" AS ENUM('assigned', 'submitted', 'changes', 'accepted');
  CREATE TABLE "tutoring_meetings_homework" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "stage" numeric NOT NULL,
    "description" varchar NOT NULL,
    "assignment" varchar,
    "practice" varchar
  );

  CREATE TABLE "tutoring_meetings" (
    "id" serial PRIMARY KEY NOT NULL,
    "program" "enum_tutoring_meetings_program" NOT NULL,
    "number" numeric NOT NULL,
    "title" varchar NOT NULL,
    "instructor_notes" varchar,
    "source_digest" varchar,
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

  CREATE TABLE "tutoring_streams" (
    "id" serial PRIMARY KEY NOT NULL,
    "title" varchar NOT NULL,
    "program" "enum_tutoring_streams_program" NOT NULL,
    "starts_at" timestamp(3) with time zone NOT NULL,
    "status" "enum_tutoring_streams_status" DEFAULT 'draft' NOT NULL,
    "current_meeting" numeric DEFAULT 1 NOT NULL,
    "meeting_url" varchar,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "tutoring_participants" (
    "id" serial PRIMARY KEY NOT NULL,
    "stream_id" integer NOT NULL,
    "student_id" integer NOT NULL,
    "paid_at" timestamp(3) with time zone NOT NULL,
    "active" boolean DEFAULT true NOT NULL,
    "current_meeting" numeric DEFAULT 1 NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "tutoring_reviews" (
    "id" serial PRIMARY KEY NOT NULL,
    "participant_id" integer NOT NULL,
    "meeting" numeric NOT NULL,
    "status" "enum_tutoring_reviews_status" DEFAULT 'assigned' NOT NULL,
    "submission_url" varchar,
    "feedback" varchar,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "tutoring_meetings_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "tutoring_streams_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "tutoring_participants_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "tutoring_reviews_id" integer;
  ALTER TABLE "tutoring_meetings_homework" ADD CONSTRAINT "tutoring_meetings_homework_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."tutoring_meetings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "tutoring_participants" ADD CONSTRAINT "tutoring_participants_stream_id_tutoring_streams_id_fk" FOREIGN KEY ("stream_id") REFERENCES "public"."tutoring_streams"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tutoring_participants" ADD CONSTRAINT "tutoring_participants_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tutoring_reviews" ADD CONSTRAINT "tutoring_reviews_participant_id_tutoring_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."tutoring_participants"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "tutoring_meetings_homework_order_idx" ON "tutoring_meetings_homework" USING btree ("_order");
  CREATE INDEX "tutoring_meetings_homework_parent_id_idx" ON "tutoring_meetings_homework" USING btree ("_parent_id");
  CREATE INDEX "tutoring_meetings_updated_at_idx" ON "tutoring_meetings" USING btree ("updated_at");
  CREATE INDEX "tutoring_meetings_created_at_idx" ON "tutoring_meetings" USING btree ("created_at");
  CREATE UNIQUE INDEX "tutoring_meetings_filename_idx" ON "tutoring_meetings" USING btree ("filename");
  CREATE UNIQUE INDEX "program_number_idx" ON "tutoring_meetings" USING btree ("program","number");
  CREATE INDEX "tutoring_streams_updated_at_idx" ON "tutoring_streams" USING btree ("updated_at");
  CREATE INDEX "tutoring_streams_created_at_idx" ON "tutoring_streams" USING btree ("created_at");
  CREATE INDEX "tutoring_participants_stream_idx" ON "tutoring_participants" USING btree ("stream_id");
  CREATE INDEX "tutoring_participants_student_idx" ON "tutoring_participants" USING btree ("student_id");
  CREATE INDEX "tutoring_participants_updated_at_idx" ON "tutoring_participants" USING btree ("updated_at");
  CREATE INDEX "tutoring_participants_created_at_idx" ON "tutoring_participants" USING btree ("created_at");
  CREATE UNIQUE INDEX "stream_student_idx" ON "tutoring_participants" USING btree ("stream_id","student_id");
  CREATE INDEX "student_active_idx" ON "tutoring_participants" USING btree ("student_id","active");
  CREATE INDEX "tutoring_reviews_participant_idx" ON "tutoring_reviews" USING btree ("participant_id");
  CREATE INDEX "tutoring_reviews_updated_at_idx" ON "tutoring_reviews" USING btree ("updated_at");
  CREATE INDEX "tutoring_reviews_created_at_idx" ON "tutoring_reviews" USING btree ("created_at");
  CREATE UNIQUE INDEX "participant_meeting_idx" ON "tutoring_reviews" USING btree ("participant_id","meeting");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_tutoring_meetings_fk" FOREIGN KEY ("tutoring_meetings_id") REFERENCES "public"."tutoring_meetings"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_tutoring_streams_fk" FOREIGN KEY ("tutoring_streams_id") REFERENCES "public"."tutoring_streams"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_tutoring_participants_fk" FOREIGN KEY ("tutoring_participants_id") REFERENCES "public"."tutoring_participants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_tutoring_reviews_fk" FOREIGN KEY ("tutoring_reviews_id") REFERENCES "public"."tutoring_reviews"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_tutoring_meetings_id_idx" ON "payload_locked_documents_rels" USING btree ("tutoring_meetings_id");
  CREATE INDEX "payload_locked_documents_rels_tutoring_streams_id_idx" ON "payload_locked_documents_rels" USING btree ("tutoring_streams_id");
  CREATE INDEX "payload_locked_documents_rels_tutoring_participants_id_idx" ON "payload_locked_documents_rels" USING btree ("tutoring_participants_id");
  CREATE INDEX "payload_locked_documents_rels_tutoring_reviews_id_idx" ON "payload_locked_documents_rels" USING btree ("tutoring_reviews_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "tutoring_meetings_homework" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "tutoring_meetings" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "tutoring_streams" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "tutoring_participants" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "tutoring_reviews" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_tutoring_meetings_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_tutoring_streams_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_tutoring_participants_fk";

  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_tutoring_reviews_fk";

  DROP INDEX "payload_locked_documents_rels_tutoring_meetings_id_idx";
  DROP INDEX "payload_locked_documents_rels_tutoring_streams_id_idx";
  DROP INDEX "payload_locked_documents_rels_tutoring_participants_id_idx";
  DROP INDEX "payload_locked_documents_rels_tutoring_reviews_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "tutoring_meetings_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "tutoring_streams_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "tutoring_participants_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "tutoring_reviews_id";
  DROP TABLE "tutoring_meetings_homework" CASCADE;
  DROP TABLE "tutoring_meetings" CASCADE;
  DROP TABLE "tutoring_streams" CASCADE;
  DROP TABLE "tutoring_participants" CASCADE;
  DROP TABLE "tutoring_reviews" CASCADE;
  DROP TYPE "public"."enum_tutoring_meetings_program";
  DROP TYPE "public"."enum_tutoring_streams_program";
  DROP TYPE "public"."enum_tutoring_streams_status";
  DROP TYPE "public"."enum_tutoring_reviews_status";`)
}
