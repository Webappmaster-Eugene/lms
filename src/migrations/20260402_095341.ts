import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_trainer_tasks_difficulty" AS ENUM('easy', 'medium', 'hard');
  CREATE TYPE "public"."enum_yandex_disk_imports_status" AS ENUM('pending', 'processing', 'completed', 'failed');
  ALTER TYPE "public"."enum_achievements_criteria_type" ADD VALUE 'trainer_task_count';
  ALTER TYPE "public"."enum_points_transactions_reason" ADD VALUE 'trainer_task_completed';
  ALTER TYPE "public"."enum_notifications_type" ADD VALUE 'trainer_task';
  ALTER TYPE "public"."enum_notifications_type" ADD VALUE 'support_message';
  CREATE TABLE IF NOT EXISTS "sections" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"course_id" integer NOT NULL,
  	"order" numeric DEFAULT 0,
  	"is_published" boolean DEFAULT false,
  	"description" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "trainer_topics" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"description" varchar,
  	"icon" varchar,
  	"order" numeric DEFAULT 0,
  	"is_published" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "trainer_tasks_hints" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"hint" varchar NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "trainer_tasks" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"topic_id" integer NOT NULL,
  	"order" numeric DEFAULT 0,
  	"difficulty" "enum_trainer_tasks_difficulty" DEFAULT 'easy' NOT NULL,
  	"description" jsonb NOT NULL,
  	"starter_code" varchar NOT NULL,
  	"expected_output" varchar NOT NULL,
  	"solution_code" varchar,
  	"points_reward" numeric DEFAULT 10,
  	"is_published" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "user_trainer_progress" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer NOT NULL,
  	"task_id" integer NOT NULL,
  	"is_completed" boolean DEFAULT false,
  	"user_code" varchar,
  	"completed_at" timestamp(3) with time zone,
  	"attempts" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "faq_items" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"question" varchar NOT NULL,
  	"answer" jsonb NOT NULL,
  	"order" numeric DEFAULT 0,
  	"is_published" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "yandex_disk_imports" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"public_url" varchar NOT NULL,
  	"status" "enum_yandex_disk_imports_status" DEFAULT 'pending' NOT NULL,
  	"course_id" integer NOT NULL,
  	"sections_created" numeric DEFAULT 0,
  	"lessons_created" numeric DEFAULT 0,
  	"error_log" varchar,
  	"imported_by_id" integer NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "roadmaps" ADD COLUMN "miro_embed_url" varchar;
  ALTER TABLE "lessons" ADD COLUMN "section_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "sections_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "trainer_topics_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "trainer_tasks_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "user_trainer_progress_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "faq_items_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "yandex_disk_imports_id" integer;
  ALTER TABLE "site_settings" ADD COLUMN "points_trainer_task_completed" numeric DEFAULT 10 NOT NULL;
  ALTER TABLE "site_settings" ADD COLUMN "contacts_telegram_channel" varchar;
  ALTER TABLE "site_settings" ADD COLUMN "contacts_telegram_group" varchar;
  ALTER TABLE "site_settings" ADD COLUMN "contacts_website" varchar;
  ALTER TABLE "site_settings" ADD COLUMN "contacts_email" varchar;
  DO $$ BEGIN
   ALTER TABLE "sections" ADD CONSTRAINT "sections_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "trainer_tasks_hints" ADD CONSTRAINT "trainer_tasks_hints_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."trainer_tasks"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "trainer_tasks" ADD CONSTRAINT "trainer_tasks_topic_id_trainer_topics_id_fk" FOREIGN KEY ("topic_id") REFERENCES "public"."trainer_topics"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "user_trainer_progress" ADD CONSTRAINT "user_trainer_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "user_trainer_progress" ADD CONSTRAINT "user_trainer_progress_task_id_trainer_tasks_id_fk" FOREIGN KEY ("task_id") REFERENCES "public"."trainer_tasks"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "yandex_disk_imports" ADD CONSTRAINT "yandex_disk_imports_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "yandex_disk_imports" ADD CONSTRAINT "yandex_disk_imports_imported_by_id_users_id_fk" FOREIGN KEY ("imported_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  CREATE UNIQUE INDEX IF NOT EXISTS "sections_slug_idx" ON "sections" USING btree ("slug");
  CREATE INDEX IF NOT EXISTS "sections_course_idx" ON "sections" USING btree ("course_id");
  CREATE INDEX IF NOT EXISTS "sections_updated_at_idx" ON "sections" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "sections_created_at_idx" ON "sections" USING btree ("created_at");
  CREATE UNIQUE INDEX IF NOT EXISTS "trainer_topics_slug_idx" ON "trainer_topics" USING btree ("slug");
  CREATE INDEX IF NOT EXISTS "trainer_topics_updated_at_idx" ON "trainer_topics" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "trainer_topics_created_at_idx" ON "trainer_topics" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "trainer_tasks_hints_order_idx" ON "trainer_tasks_hints" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "trainer_tasks_hints_parent_id_idx" ON "trainer_tasks_hints" USING btree ("_parent_id");
  CREATE UNIQUE INDEX IF NOT EXISTS "trainer_tasks_slug_idx" ON "trainer_tasks" USING btree ("slug");
  CREATE INDEX IF NOT EXISTS "trainer_tasks_topic_idx" ON "trainer_tasks" USING btree ("topic_id");
  CREATE INDEX IF NOT EXISTS "trainer_tasks_updated_at_idx" ON "trainer_tasks" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "trainer_tasks_created_at_idx" ON "trainer_tasks" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "user_trainer_progress_user_idx" ON "user_trainer_progress" USING btree ("user_id");
  CREATE INDEX IF NOT EXISTS "user_trainer_progress_task_idx" ON "user_trainer_progress" USING btree ("task_id");
  CREATE INDEX IF NOT EXISTS "user_trainer_progress_updated_at_idx" ON "user_trainer_progress" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "user_trainer_progress_created_at_idx" ON "user_trainer_progress" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "faq_items_updated_at_idx" ON "faq_items" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "faq_items_created_at_idx" ON "faq_items" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "yandex_disk_imports_course_idx" ON "yandex_disk_imports" USING btree ("course_id");
  CREATE INDEX IF NOT EXISTS "yandex_disk_imports_imported_by_idx" ON "yandex_disk_imports" USING btree ("imported_by_id");
  CREATE INDEX IF NOT EXISTS "yandex_disk_imports_updated_at_idx" ON "yandex_disk_imports" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "yandex_disk_imports_created_at_idx" ON "yandex_disk_imports" USING btree ("created_at");
  DO $$ BEGIN
   ALTER TABLE "lessons" ADD CONSTRAINT "lessons_section_id_sections_id_fk" FOREIGN KEY ("section_id") REFERENCES "public"."sections"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_sections_fk" FOREIGN KEY ("sections_id") REFERENCES "public"."sections"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_trainer_topics_fk" FOREIGN KEY ("trainer_topics_id") REFERENCES "public"."trainer_topics"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_trainer_tasks_fk" FOREIGN KEY ("trainer_tasks_id") REFERENCES "public"."trainer_tasks"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_user_trainer_progress_fk" FOREIGN KEY ("user_trainer_progress_id") REFERENCES "public"."user_trainer_progress"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_faq_items_fk" FOREIGN KEY ("faq_items_id") REFERENCES "public"."faq_items"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_yandex_disk_imports_fk" FOREIGN KEY ("yandex_disk_imports_id") REFERENCES "public"."yandex_disk_imports"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  CREATE INDEX IF NOT EXISTS "lessons_section_idx" ON "lessons" USING btree ("section_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_sections_id_idx" ON "payload_locked_documents_rels" USING btree ("sections_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_trainer_topics_id_idx" ON "payload_locked_documents_rels" USING btree ("trainer_topics_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_trainer_tasks_id_idx" ON "payload_locked_documents_rels" USING btree ("trainer_tasks_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_user_trainer_progress_id_idx" ON "payload_locked_documents_rels" USING btree ("user_trainer_progress_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_faq_items_id_idx" ON "payload_locked_documents_rels" USING btree ("faq_items_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_yandex_disk_imports_id_idx" ON "payload_locked_documents_rels" USING btree ("yandex_disk_imports_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "sections" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "trainer_topics" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "trainer_tasks_hints" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "trainer_tasks" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "user_trainer_progress" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "faq_items" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "yandex_disk_imports" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "sections" CASCADE;
  DROP TABLE "trainer_topics" CASCADE;
  DROP TABLE "trainer_tasks_hints" CASCADE;
  DROP TABLE "trainer_tasks" CASCADE;
  DROP TABLE "user_trainer_progress" CASCADE;
  DROP TABLE "faq_items" CASCADE;
  DROP TABLE "yandex_disk_imports" CASCADE;
  ALTER TABLE "lessons" DROP CONSTRAINT "lessons_section_id_sections_id_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_sections_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_trainer_topics_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_trainer_tasks_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_user_trainer_progress_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_faq_items_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_yandex_disk_imports_fk";
  
  DROP INDEX IF EXISTS "lessons_section_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_sections_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_trainer_topics_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_trainer_tasks_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_user_trainer_progress_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_faq_items_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_yandex_disk_imports_id_idx";
  ALTER TABLE "roadmaps" DROP COLUMN IF EXISTS "miro_embed_url";
  ALTER TABLE "lessons" DROP COLUMN IF EXISTS "section_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "sections_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "trainer_topics_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "trainer_tasks_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "user_trainer_progress_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "faq_items_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "yandex_disk_imports_id";
  ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "points_trainer_task_completed";
  ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "contacts_telegram_channel";
  ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "contacts_telegram_group";
  ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "contacts_website";
  ALTER TABLE "site_settings" DROP COLUMN IF EXISTS "contacts_email";
  ALTER TABLE "public"."achievements" ALTER COLUMN "criteria_type" SET DATA TYPE text;
  DROP TYPE "public"."enum_achievements_criteria_type";
  CREATE TYPE "public"."enum_achievements_criteria_type" AS ENUM('lesson_count', 'course_completion', 'roadmap_completion', 'total_points');
  ALTER TABLE "public"."achievements" ALTER COLUMN "criteria_type" SET DATA TYPE "public"."enum_achievements_criteria_type" USING "criteria_type"::"public"."enum_achievements_criteria_type";
  ALTER TABLE "public"."points_transactions" ALTER COLUMN "reason" SET DATA TYPE text;
  DROP TYPE "public"."enum_points_transactions_reason";
  CREATE TYPE "public"."enum_points_transactions_reason" AS ENUM('lesson_completed', 'course_completed', 'roadmap_completed', 'achievement_unlocked', 'admin_adjustment');
  ALTER TABLE "public"."points_transactions" ALTER COLUMN "reason" SET DATA TYPE "public"."enum_points_transactions_reason" USING "reason"::"public"."enum_points_transactions_reason";
  ALTER TABLE "public"."notifications" ALTER COLUMN "type" SET DATA TYPE text;
  DROP TYPE "public"."enum_notifications_type";
  CREATE TYPE "public"."enum_notifications_type" AS ENUM('info', 'achievement', 'course_completed', 'roadmap_completed', 'comment');
  ALTER TABLE "public"."notifications" ALTER COLUMN "type" SET DATA TYPE "public"."enum_notifications_type" USING "type"::"public"."enum_notifications_type";
  DROP TYPE "public"."enum_trainer_tasks_difficulty";
  DROP TYPE "public"."enum_yandex_disk_imports_status";`)
}
