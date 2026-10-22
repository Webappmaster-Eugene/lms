import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_users_guides_access_mode" AS ENUM('assigned', 'all');
  CREATE TYPE "public"."enum_learning_access_policies_guides_mode" AS ENUM('all', 'assigned');
  ALTER TABLE "users" ADD COLUMN "guides_access_mode" "enum_users_guides_access_mode";
  ALTER TABLE "learning_access_grants_rels" ADD COLUMN "guides_id" integer;
  ALTER TABLE "learning_access_policies" ADD COLUMN "guides_mode" "enum_learning_access_policies_guides_mode";
  ALTER TABLE "learning_access_grants_rels" ADD CONSTRAINT "learning_access_grants_rels_guides_fk" FOREIGN KEY ("guides_id") REFERENCES "public"."guides"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "learning_access_grants_rels_guides_id_idx" ON "learning_access_grants_rels" USING btree ("guides_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "learning_access_grants_rels" DROP CONSTRAINT "learning_access_grants_rels_guides_fk";
  
  DROP INDEX "learning_access_grants_rels_guides_id_idx";
  ALTER TABLE "users" DROP COLUMN "guides_access_mode";
  ALTER TABLE "learning_access_grants_rels" DROP COLUMN "guides_id";
  ALTER TABLE "learning_access_policies" DROP COLUMN "guides_mode";
  DROP TYPE "public"."enum_users_guides_access_mode";
  DROP TYPE "public"."enum_learning_access_policies_guides_mode";`)
}
