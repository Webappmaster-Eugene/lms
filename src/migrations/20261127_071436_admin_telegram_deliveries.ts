import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "admin_telegram_deliveries" (
    "id" serial PRIMARY KEY NOT NULL,
    "chat" varchar NOT NULL,
    "message" varchar NOT NULL,
    "next_attempt_at" timestamp(3) with time zone NOT NULL,
    "attempts" numeric DEFAULT 0 NOT NULL,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE INDEX "admin_telegram_deliveries_next_attempt_at_idx" ON "admin_telegram_deliveries" USING btree ("next_attempt_at");
  CREATE INDEX "admin_telegram_deliveries_updated_at_idx" ON "admin_telegram_deliveries" USING btree ("updated_at");
  CREATE INDEX "admin_telegram_deliveries_created_at_idx" ON "admin_telegram_deliveries" USING btree ("created_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "admin_telegram_deliveries" CASCADE;`)
}
