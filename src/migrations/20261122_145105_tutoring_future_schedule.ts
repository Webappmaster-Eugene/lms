import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "tutoring_streams_schedule_dates" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "meeting" numeric NOT NULL,
    "starts_at" timestamp(3) with time zone NOT NULL
  );

  ALTER TABLE "tutoring_streams_schedule_dates" ADD CONSTRAINT "tutoring_streams_schedule_dates_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."tutoring_streams"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "tutoring_streams_schedule_dates_order_idx" ON "tutoring_streams_schedule_dates" USING btree ("_order");
  CREATE INDEX "tutoring_streams_schedule_dates_parent_id_idx" ON "tutoring_streams_schedule_dates" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "tutoring_streams_schedule_dates" CASCADE;`)
}
