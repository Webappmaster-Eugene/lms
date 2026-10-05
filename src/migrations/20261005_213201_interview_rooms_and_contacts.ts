import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_interview_rooms_language" AS ENUM('js', 'ts');
  CREATE TABLE "interview_rooms" (
    "id" serial PRIMARY KEY NOT NULL,
    "token" varchar NOT NULL,
    "owner_id" integer NOT NULL,
    "presence" jsonb,
    "title" varchar NOT NULL,
    "description_md" varchar,
    "setup_code" varchar,
    "setup_types" varchar,
    "code" varchar,
    "language" "enum_interview_rooms_language" DEFAULT 'js' NOT NULL,
    "version" numeric DEFAULT 1 NOT NULL,
    "ended_at" timestamp(3) with time zone,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "interview_rooms_rels" (
    "id" serial PRIMARY KEY NOT NULL,
    "order" integer,
    "parent_id" integer NOT NULL,
    "path" varchar NOT NULL,
    "users_id" integer
  );

  CREATE TABLE "site_settings_contacts_links" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "title" varchar NOT NULL,
    "description" varchar,
    "url" varchar NOT NULL
  );

  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "interview_rooms_id" integer;
  ALTER TABLE "interview_rooms" ADD CONSTRAINT "interview_rooms_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "interview_rooms_rels" ADD CONSTRAINT "interview_rooms_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."interview_rooms"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "interview_rooms_rels" ADD CONSTRAINT "interview_rooms_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "site_settings_contacts_links" ADD CONSTRAINT "site_settings_contacts_links_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."site_settings"("id") ON DELETE cascade ON UPDATE no action;
  CREATE UNIQUE INDEX "interview_rooms_token_idx" ON "interview_rooms" USING btree ("token");
  CREATE INDEX "interview_rooms_owner_idx" ON "interview_rooms" USING btree ("owner_id");
  CREATE INDEX "interview_rooms_updated_at_idx" ON "interview_rooms" USING btree ("updated_at");
  CREATE INDEX "interview_rooms_created_at_idx" ON "interview_rooms" USING btree ("created_at");
  CREATE INDEX "interview_rooms_rels_order_idx" ON "interview_rooms_rels" USING btree ("order");
  CREATE INDEX "interview_rooms_rels_parent_idx" ON "interview_rooms_rels" USING btree ("parent_id");
  CREATE INDEX "interview_rooms_rels_path_idx" ON "interview_rooms_rels" USING btree ("path");
  CREATE INDEX "interview_rooms_rels_users_id_idx" ON "interview_rooms_rels" USING btree ("users_id");
  CREATE INDEX "site_settings_contacts_links_order_idx" ON "site_settings_contacts_links" USING btree ("_order");
  CREATE INDEX "site_settings_contacts_links_parent_id_idx" ON "site_settings_contacts_links" USING btree ("_parent_id");
  ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_interview_rooms_fk" FOREIGN KEY ("interview_rooms_id") REFERENCES "public"."interview_rooms"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "payload_locked_documents_rels_interview_rooms_id_idx" ON "payload_locked_documents_rels" USING btree ("interview_rooms_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "interview_rooms" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "interview_rooms_rels" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "site_settings_contacts_links" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "interview_rooms" CASCADE;
  DROP TABLE "interview_rooms_rels" CASCADE;
  DROP TABLE "site_settings_contacts_links" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_interview_rooms_fk";

  DROP INDEX "payload_locked_documents_rels_interview_rooms_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN "interview_rooms_id";
  DROP TYPE "public"."enum_interview_rooms_language";`)
}
