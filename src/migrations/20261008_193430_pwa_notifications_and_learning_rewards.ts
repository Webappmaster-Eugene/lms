import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_notification_deliveries_status" AS ENUM('pending', 'processing', 'sent', 'failed', 'cancelled');
  ALTER TYPE "public"."enum_achievements_criteria_type" ADD VALUE 'streak_days';
  ALTER TYPE "public"."enum_notifications_type" ADD VALUE 'learning_reminder';
  CREATE TABLE "notification_preferences" (
    "id" serial PRIMARY KEY NOT NULL,
    "user_id" integer NOT NULL,
    "push_enabled" boolean DEFAULT false,
    "reminders_enabled" boolean DEFAULT true,
    "timezone" varchar DEFAULT 'Europe/Moscow' NOT NULL,
    "reminder_hour" numeric DEFAULT 18 NOT NULL,
    "last_learning_at" timestamp(3) with time zone,
    "reminder_stage" numeric DEFAULT 0,
    "last_reminder_at" timestamp(3) with time zone,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "push_subscriptions" (
    "id" serial PRIMARY KEY NOT NULL,
    "user_id" integer NOT NULL,
    "endpoint_hash" varchar NOT NULL,
    "endpoint" varchar NOT NULL,
    "p256dh" varchar NOT NULL,
    "auth" varchar NOT NULL,
    "session_hash" varchar NOT NULL,
    "enabled" boolean DEFAULT true,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "notification_deliveries" (
    "id" serial PRIMARY KEY NOT NULL,
    "user_id" integer NOT NULL,
    "notification_id" integer NOT NULL,
    "subscription_id" integer NOT NULL,
    "status" "enum_notification_deliveries_status" DEFAULT 'pending' NOT NULL,
    "attempts" numeric DEFAULT 0 NOT NULL,
    "next_attempt_at" timestamp(3) with time zone NOT NULL,
    "claim_token" varchar,
    "last_status_code" numeric,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  CREATE TABLE "notification_job_state" (
    "id" serial PRIMARY KEY NOT NULL,
    "key" varchar NOT NULL,
    "lease_until" timestamp(3) with time zone NOT NULL,
    "claim_token" varchar NOT NULL,
    "user_cursor" numeric DEFAULT 0,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "achievements" ADD COLUMN "slug" varchar;
  ALTER TABLE "notification_preferences" ADD CONSTRAINT "notification_preferences_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "push_subscriptions" ADD CONSTRAINT "push_subscriptions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_notification_id_notifications_id_fk" FOREIGN KEY ("notification_id") REFERENCES "public"."notifications"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "notification_deliveries" ADD CONSTRAINT "notification_deliveries_subscription_id_push_subscriptions_id_fk" FOREIGN KEY ("subscription_id") REFERENCES "public"."push_subscriptions"("id") ON DELETE set null ON UPDATE no action;
  CREATE UNIQUE INDEX "notification_preferences_user_idx" ON "notification_preferences" USING btree ("user_id");
  CREATE INDEX "notification_preferences_last_learning_at_idx" ON "notification_preferences" USING btree ("last_learning_at");
  CREATE INDEX "notification_preferences_updated_at_idx" ON "notification_preferences" USING btree ("updated_at");
  CREATE INDEX "notification_preferences_created_at_idx" ON "notification_preferences" USING btree ("created_at");
  CREATE INDEX "push_subscriptions_user_idx" ON "push_subscriptions" USING btree ("user_id");
  CREATE UNIQUE INDEX "push_subscriptions_endpoint_hash_idx" ON "push_subscriptions" USING btree ("endpoint_hash");
  CREATE INDEX "push_subscriptions_enabled_idx" ON "push_subscriptions" USING btree ("enabled");
  CREATE INDEX "push_subscriptions_updated_at_idx" ON "push_subscriptions" USING btree ("updated_at");
  CREATE INDEX "push_subscriptions_created_at_idx" ON "push_subscriptions" USING btree ("created_at");
  CREATE INDEX "notification_deliveries_user_idx" ON "notification_deliveries" USING btree ("user_id");
  CREATE INDEX "notification_deliveries_notification_idx" ON "notification_deliveries" USING btree ("notification_id");
  CREATE INDEX "notification_deliveries_subscription_idx" ON "notification_deliveries" USING btree ("subscription_id");
  CREATE INDEX "notification_deliveries_status_idx" ON "notification_deliveries" USING btree ("status");
  CREATE INDEX "notification_deliveries_next_attempt_at_idx" ON "notification_deliveries" USING btree ("next_attempt_at");
  CREATE INDEX "notification_deliveries_updated_at_idx" ON "notification_deliveries" USING btree ("updated_at");
  CREATE INDEX "notification_deliveries_created_at_idx" ON "notification_deliveries" USING btree ("created_at");
  CREATE UNIQUE INDEX "notification_subscription_idx" ON "notification_deliveries" USING btree ("notification_id","subscription_id");
  CREATE UNIQUE INDEX "notification_job_state_key_idx" ON "notification_job_state" USING btree ("key");
  CREATE INDEX "notification_job_state_updated_at_idx" ON "notification_job_state" USING btree ("updated_at");
  CREATE INDEX "notification_job_state_created_at_idx" ON "notification_job_state" USING btree ("created_at");
  CREATE UNIQUE INDEX "achievements_slug_idx" ON "achievements" USING btree ("slug");
  CREATE UNIQUE INDEX "user_achievement_idx" ON "user_achievements" USING btree ("user_id","achievement_id");
  CREATE UNIQUE INDEX "user_type_relatedEntity_idx" ON "certificates" USING btree ("user_id","type","related_entity");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "notification_preferences" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "push_subscriptions" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "notification_deliveries" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "notification_job_state" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "notification_preferences" CASCADE;
  DROP TABLE "push_subscriptions" CASCADE;
  DROP TABLE "notification_deliveries" CASCADE;
  DROP TABLE "notification_job_state" CASCADE;
  ALTER TABLE "achievements" ALTER COLUMN "criteria_type" SET DATA TYPE text;
  DROP TYPE "public"."enum_achievements_criteria_type";
  CREATE TYPE "public"."enum_achievements_criteria_type" AS ENUM('lesson_count', 'course_completion', 'roadmap_completion', 'total_points', 'trainer_task_count');
  ALTER TABLE "achievements" ALTER COLUMN "criteria_type" SET DATA TYPE "public"."enum_achievements_criteria_type" USING "criteria_type"::"public"."enum_achievements_criteria_type";
  ALTER TABLE "notifications" ALTER COLUMN "type" SET DATA TYPE text;
  ALTER TABLE "notifications" ALTER COLUMN "type" SET DEFAULT 'info'::text;
  DROP TYPE "public"."enum_notifications_type";
  CREATE TYPE "public"."enum_notifications_type" AS ENUM('info', 'achievement', 'course_completed', 'roadmap_completed', 'comment', 'trainer_task', 'support_message');
  ALTER TABLE "notifications" ALTER COLUMN "type" SET DEFAULT 'info'::"public"."enum_notifications_type";
  ALTER TABLE "notifications" ALTER COLUMN "type" SET DATA TYPE "public"."enum_notifications_type" USING "type"::"public"."enum_notifications_type";
  DROP INDEX "achievements_slug_idx";
  DROP INDEX "user_achievement_idx";
  DROP INDEX "user_type_relatedEntity_idx";
  ALTER TABLE "achievements" DROP COLUMN "slug";
  DROP TYPE "public"."enum_notification_deliveries_status";`)
}
