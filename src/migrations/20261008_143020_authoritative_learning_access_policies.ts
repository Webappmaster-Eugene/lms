import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_learning_access_policies_mode" AS ENUM('all', 'assigned');
  CREATE TYPE "public"."enum_learning_access_policies_role" AS ENUM('admin', 'student');
  CREATE TABLE "learning_access_policies" (
    "id" serial PRIMARY KEY NOT NULL,
    "user_id" integer NOT NULL,
    "mode" "enum_learning_access_policies_mode" NOT NULL,
    "role" "enum_learning_access_policies_role" NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "learning_access_policies" ADD CONSTRAINT "learning_access_policies_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "learning_access_policies_user_idx" ON "learning_access_policies" USING btree ("user_id");
  CREATE INDEX "learning_access_policies_updated_at_idx" ON "learning_access_policies" USING btree ("updated_at");
  CREATE INDEX "learning_access_policies_created_at_idx" ON "learning_access_policies" USING btree ("created_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "learning_access_policies" CASCADE;
  DROP TYPE "public"."enum_learning_access_policies_mode";
  DROP TYPE "public"."enum_learning_access_policies_role";`)
}
