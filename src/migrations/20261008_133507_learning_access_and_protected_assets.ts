import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_users_learning_access_mode" AS ENUM('all', 'assigned');
  CREATE TYPE "public"."enum_learning_access_grants_effect" AS ENUM('allow', 'deny');
  CREATE TYPE "public"."enum_learning_access_audit_operation" AS ENUM('create', 'update', 'delete', 'mode');
  CREATE TYPE "public"."enum_learning_access_audit_effect" AS ENUM('allow', 'deny');
  CREATE TABLE "lessons_rels" (
    "id" serial PRIMARY KEY NOT NULL,
    "order" integer,
    "parent_id" integer NOT NULL,
    "path" varchar NOT NULL,
    "media_id" integer
  );

  CREATE TABLE "learning_access_grants" (
    "id" serial PRIMARY KEY NOT NULL,
    "user_id" integer NOT NULL,
    "effect" "enum_learning_access_grants_effect" DEFAULT 'allow' NOT NULL,
    "starts_at" timestamp(3) with time zone,
    "expires_at" timestamp(3) with time zone,
    "note" varchar,
    "rule_key" varchar NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "learning_access_grants_rels" (
    "id" serial PRIMARY KEY NOT NULL,
    "order" integer,
    "parent_id" integer NOT NULL,
    "path" varchar NOT NULL,
    "roadmaps_id" integer,
    "roadmap_nodes_id" integer,
    "courses_id" integer,
    "sections_id" integer,
    "lessons_id" integer
  );

  CREATE TABLE "learning_access_audit" (
    "id" serial PRIMARY KEY NOT NULL,
    "actor_id" numeric NOT NULL,
    "user_id" numeric NOT NULL,
    "grant_id" numeric,
    "operation" "enum_learning_access_audit_operation" NOT NULL,
    "target_type" varchar NOT NULL,
    "target_id" numeric NOT NULL,
    "effect" "enum_learning_access_audit_effect" NOT NULL,
    "previous" jsonb,
    "current" jsonb,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "users" ADD COLUMN "learning_access_mode" "enum_users_learning_access_mode" DEFAULT 'all';
  ALTER TABLE "lessons" ADD COLUMN "media_references_resolved" boolean DEFAULT false;
  ALTER TABLE "media" ADD COLUMN "uploaded_by_id" integer;
  ALTER TABLE "lessons_rels" ADD CONSTRAINT "lessons_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "lessons_rels" ADD CONSTRAINT "lessons_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "learning_access_grants" ADD CONSTRAINT "learning_access_grants_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "learning_access_grants_rels" ADD CONSTRAINT "learning_access_grants_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."learning_access_grants"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "learning_access_grants_rels" ADD CONSTRAINT "learning_access_grants_rels_roadmaps_fk" FOREIGN KEY ("roadmaps_id") REFERENCES "public"."roadmaps"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "learning_access_grants_rels" ADD CONSTRAINT "learning_access_grants_rels_roadmap_nodes_fk" FOREIGN KEY ("roadmap_nodes_id") REFERENCES "public"."roadmap_nodes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "learning_access_grants_rels" ADD CONSTRAINT "learning_access_grants_rels_courses_fk" FOREIGN KEY ("courses_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "learning_access_grants_rels" ADD CONSTRAINT "learning_access_grants_rels_sections_fk" FOREIGN KEY ("sections_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "learning_access_grants_rels" ADD CONSTRAINT "learning_access_grants_rels_lessons_fk" FOREIGN KEY ("lessons_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "lessons_rels_order_idx" ON "lessons_rels" USING btree ("order");
  CREATE INDEX "lessons_rels_parent_idx" ON "lessons_rels" USING btree ("parent_id");
  CREATE INDEX "lessons_rels_path_idx" ON "lessons_rels" USING btree ("path");
  CREATE INDEX "lessons_rels_media_id_idx" ON "lessons_rels" USING btree ("media_id");
  CREATE INDEX "learning_access_grants_user_idx" ON "learning_access_grants" USING btree ("user_id");
  CREATE UNIQUE INDEX "learning_access_grants_rule_key_idx" ON "learning_access_grants" USING btree ("rule_key");
  CREATE INDEX "learning_access_grants_updated_at_idx" ON "learning_access_grants" USING btree ("updated_at");
  CREATE INDEX "learning_access_grants_created_at_idx" ON "learning_access_grants" USING btree ("created_at");
  CREATE INDEX "learning_access_grants_rels_order_idx" ON "learning_access_grants_rels" USING btree ("order");
  CREATE INDEX "learning_access_grants_rels_parent_idx" ON "learning_access_grants_rels" USING btree ("parent_id");
  CREATE INDEX "learning_access_grants_rels_path_idx" ON "learning_access_grants_rels" USING btree ("path");
  CREATE INDEX "learning_access_grants_rels_roadmaps_id_idx" ON "learning_access_grants_rels" USING btree ("roadmaps_id");
  CREATE INDEX "learning_access_grants_rels_roadmap_nodes_id_idx" ON "learning_access_grants_rels" USING btree ("roadmap_nodes_id");
  CREATE INDEX "learning_access_grants_rels_courses_id_idx" ON "learning_access_grants_rels" USING btree ("courses_id");
  CREATE INDEX "learning_access_grants_rels_sections_id_idx" ON "learning_access_grants_rels" USING btree ("sections_id");
  CREATE INDEX "learning_access_grants_rels_lessons_id_idx" ON "learning_access_grants_rels" USING btree ("lessons_id");
  CREATE INDEX "learning_access_audit_user_id_idx" ON "learning_access_audit" USING btree ("user_id");
  CREATE INDEX "learning_access_audit_updated_at_idx" ON "learning_access_audit" USING btree ("updated_at");
  CREATE INDEX "learning_access_audit_created_at_idx" ON "learning_access_audit" USING btree ("created_at");
  ALTER TABLE "media" ADD CONSTRAINT "media_uploaded_by_id_users_id_fk" FOREIGN KEY ("uploaded_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "lessons_blocks_video_video_url_idx" ON "lessons_blocks_video" USING btree ("video_url");
  CREATE INDEX "lessons_blocks_link_url_idx" ON "lessons_blocks_link" USING btree ("url");
  CREATE INDEX "media_uploaded_by_idx" ON "media" USING btree ("uploaded_by_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "lessons_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "learning_access_grants" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "learning_access_grants_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "learning_access_audit" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "lessons_rels" CASCADE;
  DROP TABLE "learning_access_grants" CASCADE;
  DROP TABLE "learning_access_grants_rels" CASCADE;
  DROP TABLE "learning_access_audit" CASCADE;
  ALTER TABLE "media" DROP CONSTRAINT "media_uploaded_by_id_users_id_fk";

  DROP INDEX "lessons_blocks_video_video_url_idx";
  DROP INDEX "lessons_blocks_link_url_idx";
  DROP INDEX "media_uploaded_by_idx";
  ALTER TABLE "users" DROP COLUMN "learning_access_mode";
  ALTER TABLE "lessons" DROP COLUMN "media_references_resolved";
  ALTER TABLE "media" DROP COLUMN "uploaded_by_id";
  DROP TYPE "public"."enum_users_learning_access_mode";
  DROP TYPE "public"."enum_learning_access_grants_effect";
  DROP TYPE "public"."enum_learning_access_audit_operation";
  DROP TYPE "public"."enum_learning_access_audit_effect";`)
}
