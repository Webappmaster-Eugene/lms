import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_users_learning_catalog_visibility" AS ENUM('assigned', 'catalog');
  CREATE TYPE "public"."enum_users_trainer_access_mode" AS ENUM('assigned', 'all', 'disabled');
  CREATE TYPE "public"."enum_learning_access_policies_catalog_visibility" AS ENUM('catalog', 'assigned');
  CREATE TYPE "public"."enum_learning_access_policies_trainer_mode" AS ENUM('all', 'assigned', 'disabled');
  ALTER TABLE "users" ADD COLUMN "learning_catalog_visibility" "enum_users_learning_catalog_visibility";
  ALTER TABLE "users" ADD COLUMN "trainer_access_mode" "enum_users_trainer_access_mode";
  ALTER TABLE "learning_access_grants_rels" ADD COLUMN "trainer_topics_id" integer;
  ALTER TABLE "learning_access_grants_rels" ADD COLUMN "trainer_tasks_id" integer;
  ALTER TABLE "learning_access_policies" ADD COLUMN "catalog_visibility" "enum_learning_access_policies_catalog_visibility";
  ALTER TABLE "learning_access_policies" ADD COLUMN "trainer_mode" "enum_learning_access_policies_trainer_mode";
  ALTER TABLE "interview_rooms" ADD COLUMN "source_task_id" numeric;
  ALTER TABLE "interview_rooms" ADD COLUMN "source_task_known" boolean;
  ALTER TABLE "learning_access_grants_rels" ADD CONSTRAINT "learning_access_grants_rels_trainer_topics_fk" FOREIGN KEY ("trainer_topics_id") REFERENCES "public"."trainer_topics"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "learning_access_grants_rels" ADD CONSTRAINT "learning_access_grants_rels_trainer_tasks_fk" FOREIGN KEY ("trainer_tasks_id") REFERENCES "public"."trainer_tasks"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "learning_access_grants_rels_trainer_topics_id_idx" ON "learning_access_grants_rels" USING btree ("trainer_topics_id");
  CREATE INDEX "learning_access_grants_rels_trainer_tasks_id_idx" ON "learning_access_grants_rels" USING btree ("trainer_tasks_id");
  CREATE INDEX "interview_rooms_source_task_id_idx" ON "interview_rooms" USING btree ("source_task_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "learning_access_grants_rels" DROP CONSTRAINT "learning_access_grants_rels_trainer_topics_fk";

  ALTER TABLE "learning_access_grants_rels" DROP CONSTRAINT "learning_access_grants_rels_trainer_tasks_fk";

  DROP INDEX "learning_access_grants_rels_trainer_topics_id_idx";
  DROP INDEX "learning_access_grants_rels_trainer_tasks_id_idx";
  DROP INDEX "interview_rooms_source_task_id_idx";
  ALTER TABLE "users" DROP COLUMN "learning_catalog_visibility";
  ALTER TABLE "users" DROP COLUMN "trainer_access_mode";
  ALTER TABLE "learning_access_grants_rels" DROP COLUMN "trainer_topics_id";
  ALTER TABLE "learning_access_grants_rels" DROP COLUMN "trainer_tasks_id";
  ALTER TABLE "learning_access_policies" DROP COLUMN "catalog_visibility";
  ALTER TABLE "learning_access_policies" DROP COLUMN "trainer_mode";
  ALTER TABLE "interview_rooms" DROP COLUMN "source_task_id";
  ALTER TABLE "interview_rooms" DROP COLUMN "source_task_known";
  DROP TYPE "public"."enum_users_learning_catalog_visibility";
  DROP TYPE "public"."enum_users_trainer_access_mode";
  DROP TYPE "public"."enum_learning_access_policies_catalog_visibility";
  DROP TYPE "public"."enum_learning_access_policies_trainer_mode";`)
}
