import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_tutoring_calendars_status" AS ENUM('connected', 'reconnect', 'disconnected');
  CREATE TYPE "public"."enum_tutoring_calendars_last_error" AS ENUM('temporary', 'calendar', 'authorization');
  CREATE TABLE "tutoring_streams_schedule_overrides" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "meeting" numeric NOT NULL,
    "starts_at" timestamp(3) with time zone NOT NULL
  );

  CREATE TABLE "tutoring_calendars_streams" (
    "_order" integer NOT NULL,
    "_parent_id" integer NOT NULL,
    "id" varchar PRIMARY KEY NOT NULL,
    "stream_id" numeric NOT NULL
  );

  CREATE TABLE "tutoring_calendars" (
    "id" serial PRIMARY KEY NOT NULL,
    "owner_id" integer,
    "google_subject" varchar NOT NULL,
    "google_email" varchar NOT NULL,
    "calendar_id" varchar,
    "encrypted_refresh_token" varchar,
    "status" "enum_tutoring_calendars_status" NOT NULL,
    "next_sync_at" timestamp(3) with time zone,
    "last_synced_at" timestamp(3) with time zone,
    "last_error" "enum_tutoring_calendars_last_error",
    "failures" numeric DEFAULT 0 NOT NULL,
    "schedule_digest" varchar,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "tutoring_streams_schedule_overrides" ADD CONSTRAINT "tutoring_streams_schedule_overrides_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."tutoring_streams"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "tutoring_calendars_streams" ADD CONSTRAINT "tutoring_calendars_streams_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."tutoring_calendars"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "tutoring_calendars" ADD CONSTRAINT "tutoring_calendars_owner_id_users_id_fk" FOREIGN KEY ("owner_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "tutoring_streams_schedule_overrides_order_idx" ON "tutoring_streams_schedule_overrides" USING btree ("_order");
  CREATE INDEX "tutoring_streams_schedule_overrides_parent_id_idx" ON "tutoring_streams_schedule_overrides" USING btree ("_parent_id");
  CREATE INDEX "tutoring_calendars_streams_order_idx" ON "tutoring_calendars_streams" USING btree ("_order");
  CREATE INDEX "tutoring_calendars_streams_parent_id_idx" ON "tutoring_calendars_streams" USING btree ("_parent_id");
  CREATE UNIQUE INDEX "tutoring_calendars_owner_idx" ON "tutoring_calendars" USING btree ("owner_id");
  CREATE INDEX "tutoring_calendars_next_sync_at_idx" ON "tutoring_calendars" USING btree ("next_sync_at");
  CREATE INDEX "tutoring_calendars_updated_at_idx" ON "tutoring_calendars" USING btree ("updated_at");
  CREATE INDEX "tutoring_calendars_created_at_idx" ON "tutoring_calendars" USING btree ("created_at");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "tutoring_streams_schedule_overrides" CASCADE;
  DROP TABLE "tutoring_calendars_streams" CASCADE;
  DROP TABLE "tutoring_calendars" CASCADE;
  DROP TYPE "public"."enum_tutoring_calendars_status";
  DROP TYPE "public"."enum_tutoring_calendars_last_error";`)
}
