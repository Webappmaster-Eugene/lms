import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "interview_analysis_usage" (
    "id" serial PRIMARY KEY NOT NULL,
    "owner_id" integer NOT NULL,
    "day" varchar NOT NULL,
    "requests" numeric NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "interview_analysis_usage" ADD CONSTRAINT "interview_analysis_usage_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "interview_analysis_usage_owner_idx" ON "interview_analysis_usage" USING btree ("owner_id");
  CREATE INDEX "interview_analysis_usage_updated_at_idx" ON "interview_analysis_usage" USING btree ("updated_at");
  CREATE INDEX "interview_analysis_usage_created_at_idx" ON "interview_analysis_usage" USING btree ("created_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "interview_analysis_usage" CASCADE;`)
}
