import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "auth_session_revocations" (
    "id" serial PRIMARY KEY NOT NULL,
    "user_id" integer NOT NULL,
    "session_hash" varchar NOT NULL,
    "expires_at" timestamp(3) with time zone NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "auth_session_revocations" ADD CONSTRAINT "auth_session_revocations_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "auth_session_revocations_user_idx" ON "auth_session_revocations" USING btree ("user_id");
  CREATE INDEX "auth_session_revocations_expires_at_idx" ON "auth_session_revocations" USING btree ("expires_at");
  CREATE INDEX "auth_session_revocations_updated_at_idx" ON "auth_session_revocations" USING btree ("updated_at");
  CREATE INDEX "auth_session_revocations_created_at_idx" ON "auth_session_revocations" USING btree ("created_at");
  CREATE UNIQUE INDEX "user_sessionHash_idx" ON "auth_session_revocations" USING btree ("user_id","session_hash");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "auth_session_revocations" CASCADE;`)
}
