import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_tutoring_charges_status" AS ENUM('due', 'paid', 'cancelled');
  CREATE TYPE "public"."enum_tutoring_projects_program" AS ENUM('nodejs', 'react-next');
  CREATE TYPE "public"."enum_tutoring_projects_state" AS ENUM('queued', 'running', 'ready', 'failed', 'revoking', 'revoked', 'revoke_failed');
  CREATE TABLE "tutoring_charges" (
    "id" serial PRIMARY KEY NOT NULL,
    "participant_id" integer NOT NULL,
    "meeting" numeric NOT NULL,
    "minutes" numeric NOT NULL,
    "hourly_kopecks" numeric NOT NULL,
    "amount_kopecks" numeric NOT NULL,
    "status" "enum_tutoring_charges_status" NOT NULL,
    "paid_at" timestamp(3) with time zone,
    "updated_by_id" integer NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "tutoring_projects" (
    "id" serial PRIMARY KEY NOT NULL,
    "student_id" integer NOT NULL,
    "program" "enum_tutoring_projects_program" NOT NULL,
    "username" varchar NOT NULL,
    "group" varchar NOT NULL,
    "course_project" varchar NOT NULL,
    "grading_project" varchar NOT NULL,
    "project_id" numeric,
    "project_url" varchar,
    "gitlab_user_id" numeric,
    "state" "enum_tutoring_projects_state" DEFAULT 'queued' NOT NULL,
    "lease" varchar,
    "leased_at" timestamp(3) with time zone,
    "attempts" numeric DEFAULT 0 NOT NULL,
    "error" varchar,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "tutoring_checks" (
    "id" serial PRIMARY KEY NOT NULL,
    "project_id" integer NOT NULL,
    "mr_iid" numeric NOT NULL,
    "stage" numeric NOT NULL,
    "verdict" varchar NOT NULL,
    "passed" numeric,
    "total" numeric,
    "reported_at" timestamp(3) with time zone NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "tutoring_participants" ALTER COLUMN "paid_at" DROP NOT NULL;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "tutoring_charges_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "tutoring_projects_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "tutoring_checks_id" integer;
  ALTER TABLE "tutoring_charges" ADD CONSTRAINT "tutoring_charges_participant_id_tutoring_participants_id_fk" FOREIGN KEY ("participant_id") REFERENCES "public"."tutoring_participants"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tutoring_charges" ADD CONSTRAINT "tutoring_charges_updated_by_id_users_id_fk" FOREIGN KEY ("updated_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tutoring_projects" ADD CONSTRAINT "tutoring_projects_student_id_users_id_fk" FOREIGN KEY ("student_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "tutoring_checks" ADD CONSTRAINT "tutoring_checks_project_id_tutoring_projects_id_fk" FOREIGN KEY ("project_id") REFERENCES "public"."tutoring_projects"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "tutoring_charges_participant_idx" ON "tutoring_charges" USING btree ("participant_id");
  CREATE INDEX "tutoring_charges_updated_by_idx" ON "tutoring_charges" USING btree ("updated_by_id");
  CREATE INDEX "tutoring_charges_updated_at_idx" ON "tutoring_charges" USING btree ("updated_at");
  CREATE INDEX "tutoring_charges_created_at_idx" ON "tutoring_charges" USING btree ("created_at");
  CREATE UNIQUE INDEX "participant_meeting_1_idx" ON "tutoring_charges" USING btree ("participant_id","meeting");
  CREATE INDEX "tutoring_projects_student_idx" ON "tutoring_projects" USING btree ("student_id");
  CREATE UNIQUE INDEX "tutoring_projects_project_id_idx" ON "tutoring_projects" USING btree ("project_id");
  CREATE INDEX "tutoring_projects_state_idx" ON "tutoring_projects" USING btree ("state");
  CREATE INDEX "tutoring_projects_updated_at_idx" ON "tutoring_projects" USING btree ("updated_at");
  CREATE INDEX "tutoring_projects_created_at_idx" ON "tutoring_projects" USING btree ("created_at");
  CREATE UNIQUE INDEX "student_program_idx" ON "tutoring_projects" USING btree ("student_id","program");
  CREATE UNIQUE INDEX "group_username_idx" ON "tutoring_projects" USING btree ("group","username");
  CREATE INDEX "tutoring_checks_project_idx" ON "tutoring_checks" USING btree ("project_id");
  CREATE INDEX "tutoring_checks_updated_at_idx" ON "tutoring_checks" USING btree ("updated_at");
  CREATE INDEX "tutoring_checks_created_at_idx" ON "tutoring_checks" USING btree ("created_at");
  CREATE UNIQUE INDEX "project_mrIid_idx" ON "tutoring_checks" USING btree ("project_id","mr_iid");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_tutoring_charges_fk" FOREIGN KEY ("tutoring_charges_id") REFERENCES "public"."tutoring_charges"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_tutoring_projects_fk" FOREIGN KEY ("tutoring_projects_id") REFERENCES "public"."tutoring_projects"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_tutoring_checks_fk" FOREIGN KEY ("tutoring_checks_id") REFERENCES "public"."tutoring_checks"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_tutoring_charges_id_idx" ON "payload_locked_documents_rels" USING btree ("tutoring_charges_id");
  CREATE INDEX "payload_locked_documents_rels_tutoring_projects_id_idx" ON "payload_locked_documents_rels" USING btree ("tutoring_projects_id");
  CREATE INDEX "payload_locked_documents_rels_tutoring_checks_id_idx" ON "payload_locked_documents_rels" USING btree ("tutoring_checks_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  // После добавления учеников без предоплаты откатывается приложение поверх новой схемы.
  // Восстановление старого ограничения должно завершиться ошибкой, если в базе есть такие ученики.
  await db.execute(sql`
   ALTER TABLE "tutoring_participants" ALTER COLUMN "paid_at" SET NOT NULL;

   ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_tutoring_charges_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_tutoring_projects_fk";
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_tutoring_checks_fk";
  DROP TABLE "tutoring_checks";
  DROP TABLE "tutoring_charges";
  DROP TABLE "tutoring_projects";
  DROP INDEX "payload_locked_documents_rels_tutoring_charges_id_idx";
  DROP INDEX "payload_locked_documents_rels_tutoring_projects_id_idx";
  DROP INDEX "payload_locked_documents_rels_tutoring_checks_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "tutoring_charges_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "tutoring_projects_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "tutoring_checks_id";
  DROP TYPE "public"."enum_tutoring_charges_status";
  DROP TYPE "public"."enum_tutoring_projects_program";
  DROP TYPE "public"."enum_tutoring_projects_state";`)
}
