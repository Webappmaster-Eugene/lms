import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_users_role" AS ENUM('admin', 'student');
  CREATE TYPE "public"."enum_lessons_blocks_video_display_mode" AS ENUM('embed', 'link');
  CREATE TYPE "public"."enum_lessons_blocks_link_platform" AS ENUM('boosty', 'telegram', 'youtube', 'github', 'other');
  CREATE TYPE "public"."enum_achievements_criteria_type" AS ENUM('lesson_count', 'course_completion', 'roadmap_completion', 'total_points');
  CREATE TYPE "public"."enum_points_transactions_reason" AS ENUM('lesson_completed', 'course_completed', 'roadmap_completed', 'achievement_unlocked', 'admin_adjustment');
  CREATE TYPE "public"."enum_notifications_type" AS ENUM('info', 'achievement', 'course_completed', 'roadmap_completed', 'comment');
  CREATE TYPE "public"."enum_certificates_type" AS ENUM('course', 'roadmap');
  CREATE TABLE IF NOT EXISTS "users" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"first_name" varchar NOT NULL,
  	"last_name" varchar NOT NULL,
  	"role" "enum_users_role" DEFAULT 'student' NOT NULL,
  	"avatar_id" integer,
  	"bio" varchar,
  	"total_points" numeric DEFAULT 0,
  	"is_active" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"email" varchar NOT NULL,
  	"reset_password_token" varchar,
  	"reset_password_expiration" timestamp(3) with time zone,
  	"salt" varchar,
  	"hash" varchar,
  	"login_attempts" numeric DEFAULT 0,
  	"lock_until" timestamp(3) with time zone
  );
  
  CREATE TABLE IF NOT EXISTS "roadmaps" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"description" jsonb,
  	"cover_image_id" integer,
  	"order" numeric DEFAULT 0,
  	"is_published" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "courses" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"description" jsonb,
  	"cover_image_id" integer,
  	"roadmap_id" integer NOT NULL,
  	"order" numeric DEFAULT 0,
  	"is_published" boolean DEFAULT false,
  	"estimated_hours" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "courses_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"courses_id" integer
  );
  
  CREATE TABLE IF NOT EXISTS "lessons_blocks_text" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"content" jsonb NOT NULL,
  	"block_name" varchar
  );
  
  CREATE TABLE IF NOT EXISTS "lessons_blocks_video" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"video_url" varchar NOT NULL,
  	"display_mode" "enum_lessons_blocks_video_display_mode" DEFAULT 'embed' NOT NULL,
  	"description" varchar,
  	"duration_minutes" numeric,
  	"block_name" varchar
  );
  
  CREATE TABLE IF NOT EXISTS "lessons_blocks_image" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"image_id" integer NOT NULL,
  	"caption" varchar,
  	"alt_text" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE IF NOT EXISTS "lessons_blocks_link" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"url" varchar NOT NULL,
  	"platform" "enum_lessons_blocks_link_platform" DEFAULT 'other',
  	"description" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE IF NOT EXISTS "lessons_blocks_miro" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"embed_url" varchar NOT NULL,
  	"height" numeric DEFAULT 600,
  	"block_name" varchar
  );
  
  CREATE TABLE IF NOT EXISTS "lessons_blocks_file" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"file_id" integer NOT NULL,
  	"description" varchar,
  	"block_name" varchar
  );
  
  CREATE TABLE IF NOT EXISTS "lessons" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"slug" varchar NOT NULL,
  	"description" varchar,
  	"course_id" integer NOT NULL,
  	"order" numeric DEFAULT 0,
  	"is_published" boolean DEFAULT false,
  	"estimated_minutes" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "media" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"alt" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"url" varchar,
  	"thumbnail_u_r_l" varchar,
  	"filename" varchar,
  	"mime_type" varchar,
  	"filesize" numeric,
  	"width" numeric,
  	"height" numeric,
  	"focal_x" numeric,
  	"focal_y" numeric,
  	"sizes_thumbnail_url" varchar,
  	"sizes_thumbnail_width" numeric,
  	"sizes_thumbnail_height" numeric,
  	"sizes_thumbnail_mime_type" varchar,
  	"sizes_thumbnail_filesize" numeric,
  	"sizes_thumbnail_filename" varchar,
  	"sizes_card_url" varchar,
  	"sizes_card_width" numeric,
  	"sizes_card_height" numeric,
  	"sizes_card_mime_type" varchar,
  	"sizes_card_filesize" numeric,
  	"sizes_card_filename" varchar
  );
  
  CREATE TABLE IF NOT EXISTS "user_progress" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer NOT NULL,
  	"lesson_id" integer NOT NULL,
  	"is_completed" boolean DEFAULT false,
  	"completed_at" timestamp(3) with time zone,
  	"last_accessed_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "achievements" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"description" varchar NOT NULL,
  	"icon_id" integer,
  	"points_reward" numeric DEFAULT 0,
  	"criteria_type" "enum_achievements_criteria_type" NOT NULL,
  	"criteria_value" numeric NOT NULL,
  	"criteria_entity_id" varchar,
  	"is_active" boolean DEFAULT true,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "user_achievements" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer NOT NULL,
  	"achievement_id" integer NOT NULL,
  	"unlocked_at" timestamp(3) with time zone NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "points_transactions" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer NOT NULL,
  	"amount" numeric NOT NULL,
  	"reason" "enum_points_transactions_reason" NOT NULL,
  	"related_entity" varchar,
  	"description" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "notes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer NOT NULL,
  	"lesson_id" integer NOT NULL,
  	"content" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "comments" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer NOT NULL,
  	"lesson_id" integer NOT NULL,
  	"content" varchar NOT NULL,
  	"parent_comment_id" integer,
  	"is_resolved" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "notifications" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer NOT NULL,
  	"title" varchar NOT NULL,
  	"message" varchar NOT NULL,
  	"type" "enum_notifications_type" DEFAULT 'info' NOT NULL,
  	"link" varchar,
  	"is_read" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "certificates" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer NOT NULL,
  	"type" "enum_certificates_type" NOT NULL,
  	"title" varchar NOT NULL,
  	"related_entity" varchar NOT NULL,
  	"issued_at" timestamp(3) with time zone NOT NULL,
  	"certificate_number" varchar NOT NULL,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "streaks" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer NOT NULL,
  	"current_streak" numeric DEFAULT 0 NOT NULL,
  	"longest_streak" numeric DEFAULT 0 NOT NULL,
  	"last_activity_date" varchar,
  	"total_active_days" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "payload_locked_documents" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"global_slug" varchar,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "payload_locked_documents_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer,
  	"roadmaps_id" integer,
  	"courses_id" integer,
  	"lessons_id" integer,
  	"media_id" integer,
  	"user_progress_id" integer,
  	"achievements_id" integer,
  	"user_achievements_id" integer,
  	"points_transactions_id" integer,
  	"notes_id" integer,
  	"comments_id" integer,
  	"notifications_id" integer,
  	"certificates_id" integer,
  	"streaks_id" integer
  );
  
  CREATE TABLE IF NOT EXISTS "payload_preferences" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"key" varchar,
  	"value" jsonb,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "payload_preferences_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  CREATE TABLE IF NOT EXISTS "payload_migrations" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"name" varchar,
  	"batch" numeric,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "site_settings" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"platform_name" varchar DEFAULT 'MentorCareer LMS' NOT NULL,
  	"platform_description" varchar,
  	"logo_id" integer,
  	"points_lesson_completed" numeric DEFAULT 10 NOT NULL,
  	"points_course_completed" numeric DEFAULT 50 NOT NULL,
  	"points_roadmap_completed" numeric DEFAULT 200 NOT NULL,
  	"updated_at" timestamp(3) with time zone,
  	"created_at" timestamp(3) with time zone
  );
  
  DO $$ BEGIN
   ALTER TABLE "users" ADD CONSTRAINT "users_avatar_id_media_id_fk" FOREIGN KEY ("avatar_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "roadmaps" ADD CONSTRAINT "roadmaps_cover_image_id_media_id_fk" FOREIGN KEY ("cover_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "courses" ADD CONSTRAINT "courses_cover_image_id_media_id_fk" FOREIGN KEY ("cover_image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "courses" ADD CONSTRAINT "courses_roadmap_id_roadmaps_id_fk" FOREIGN KEY ("roadmap_id") REFERENCES "public"."roadmaps"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "courses_rels" ADD CONSTRAINT "courses_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "courses_rels" ADD CONSTRAINT "courses_rels_courses_fk" FOREIGN KEY ("courses_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "lessons_blocks_text" ADD CONSTRAINT "lessons_blocks_text_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "lessons_blocks_video" ADD CONSTRAINT "lessons_blocks_video_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "lessons_blocks_image" ADD CONSTRAINT "lessons_blocks_image_image_id_media_id_fk" FOREIGN KEY ("image_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "lessons_blocks_image" ADD CONSTRAINT "lessons_blocks_image_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "lessons_blocks_link" ADD CONSTRAINT "lessons_blocks_link_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "lessons_blocks_miro" ADD CONSTRAINT "lessons_blocks_miro_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "lessons_blocks_file" ADD CONSTRAINT "lessons_blocks_file_file_id_media_id_fk" FOREIGN KEY ("file_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "lessons_blocks_file" ADD CONSTRAINT "lessons_blocks_file_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "lessons" ADD CONSTRAINT "lessons_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "user_progress" ADD CONSTRAINT "user_progress_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "user_progress" ADD CONSTRAINT "user_progress_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "achievements" ADD CONSTRAINT "achievements_icon_id_media_id_fk" FOREIGN KEY ("icon_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "user_achievements" ADD CONSTRAINT "user_achievements_achievement_id_achievements_id_fk" FOREIGN KEY ("achievement_id") REFERENCES "public"."achievements"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "points_transactions" ADD CONSTRAINT "points_transactions_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "notes" ADD CONSTRAINT "notes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "notes" ADD CONSTRAINT "notes_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "comments" ADD CONSTRAINT "comments_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "comments" ADD CONSTRAINT "comments_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "comments" ADD CONSTRAINT "comments_parent_comment_id_comments_id_fk" FOREIGN KEY ("parent_comment_id") REFERENCES "public"."comments"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "notifications" ADD CONSTRAINT "notifications_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "certificates" ADD CONSTRAINT "certificates_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "streaks" ADD CONSTRAINT "streaks_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_locked_documents"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_roadmaps_fk" FOREIGN KEY ("roadmaps_id") REFERENCES "public"."roadmaps"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_courses_fk" FOREIGN KEY ("courses_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_lessons_fk" FOREIGN KEY ("lessons_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_media_fk" FOREIGN KEY ("media_id") REFERENCES "public"."media"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_user_progress_fk" FOREIGN KEY ("user_progress_id") REFERENCES "public"."user_progress"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_achievements_fk" FOREIGN KEY ("achievements_id") REFERENCES "public"."achievements"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_user_achievements_fk" FOREIGN KEY ("user_achievements_id") REFERENCES "public"."user_achievements"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_points_transactions_fk" FOREIGN KEY ("points_transactions_id") REFERENCES "public"."points_transactions"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_notes_fk" FOREIGN KEY ("notes_id") REFERENCES "public"."notes"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_comments_fk" FOREIGN KEY ("comments_id") REFERENCES "public"."comments"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_notifications_fk" FOREIGN KEY ("notifications_id") REFERENCES "public"."notifications"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_certificates_fk" FOREIGN KEY ("certificates_id") REFERENCES "public"."certificates"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_streaks_fk" FOREIGN KEY ("streaks_id") REFERENCES "public"."streaks"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."payload_preferences"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "payload_preferences_rels" ADD CONSTRAINT "payload_preferences_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "site_settings" ADD CONSTRAINT "site_settings_logo_id_media_id_fk" FOREIGN KEY ("logo_id") REFERENCES "public"."media"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  CREATE INDEX IF NOT EXISTS "users_avatar_idx" ON "users" USING btree ("avatar_id");
  CREATE INDEX IF NOT EXISTS "users_updated_at_idx" ON "users" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "users_created_at_idx" ON "users" USING btree ("created_at");
  CREATE UNIQUE INDEX IF NOT EXISTS "users_email_idx" ON "users" USING btree ("email");
  CREATE UNIQUE INDEX IF NOT EXISTS "roadmaps_slug_idx" ON "roadmaps" USING btree ("slug");
  CREATE INDEX IF NOT EXISTS "roadmaps_cover_image_idx" ON "roadmaps" USING btree ("cover_image_id");
  CREATE INDEX IF NOT EXISTS "roadmaps_updated_at_idx" ON "roadmaps" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "roadmaps_created_at_idx" ON "roadmaps" USING btree ("created_at");
  CREATE UNIQUE INDEX IF NOT EXISTS "courses_slug_idx" ON "courses" USING btree ("slug");
  CREATE INDEX IF NOT EXISTS "courses_cover_image_idx" ON "courses" USING btree ("cover_image_id");
  CREATE INDEX IF NOT EXISTS "courses_roadmap_idx" ON "courses" USING btree ("roadmap_id");
  CREATE INDEX IF NOT EXISTS "courses_updated_at_idx" ON "courses" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "courses_created_at_idx" ON "courses" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "courses_rels_order_idx" ON "courses_rels" USING btree ("order");
  CREATE INDEX IF NOT EXISTS "courses_rels_parent_idx" ON "courses_rels" USING btree ("parent_id");
  CREATE INDEX IF NOT EXISTS "courses_rels_path_idx" ON "courses_rels" USING btree ("path");
  CREATE INDEX IF NOT EXISTS "courses_rels_courses_id_idx" ON "courses_rels" USING btree ("courses_id");
  CREATE INDEX IF NOT EXISTS "lessons_blocks_text_order_idx" ON "lessons_blocks_text" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "lessons_blocks_text_parent_id_idx" ON "lessons_blocks_text" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "lessons_blocks_text_path_idx" ON "lessons_blocks_text" USING btree ("_path");
  CREATE INDEX IF NOT EXISTS "lessons_blocks_video_order_idx" ON "lessons_blocks_video" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "lessons_blocks_video_parent_id_idx" ON "lessons_blocks_video" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "lessons_blocks_video_path_idx" ON "lessons_blocks_video" USING btree ("_path");
  CREATE INDEX IF NOT EXISTS "lessons_blocks_image_order_idx" ON "lessons_blocks_image" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "lessons_blocks_image_parent_id_idx" ON "lessons_blocks_image" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "lessons_blocks_image_path_idx" ON "lessons_blocks_image" USING btree ("_path");
  CREATE INDEX IF NOT EXISTS "lessons_blocks_image_image_idx" ON "lessons_blocks_image" USING btree ("image_id");
  CREATE INDEX IF NOT EXISTS "lessons_blocks_link_order_idx" ON "lessons_blocks_link" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "lessons_blocks_link_parent_id_idx" ON "lessons_blocks_link" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "lessons_blocks_link_path_idx" ON "lessons_blocks_link" USING btree ("_path");
  CREATE INDEX IF NOT EXISTS "lessons_blocks_miro_order_idx" ON "lessons_blocks_miro" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "lessons_blocks_miro_parent_id_idx" ON "lessons_blocks_miro" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "lessons_blocks_miro_path_idx" ON "lessons_blocks_miro" USING btree ("_path");
  CREATE INDEX IF NOT EXISTS "lessons_blocks_file_order_idx" ON "lessons_blocks_file" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "lessons_blocks_file_parent_id_idx" ON "lessons_blocks_file" USING btree ("_parent_id");
  CREATE INDEX IF NOT EXISTS "lessons_blocks_file_path_idx" ON "lessons_blocks_file" USING btree ("_path");
  CREATE INDEX IF NOT EXISTS "lessons_blocks_file_file_idx" ON "lessons_blocks_file" USING btree ("file_id");
  CREATE UNIQUE INDEX IF NOT EXISTS "lessons_slug_idx" ON "lessons" USING btree ("slug");
  CREATE INDEX IF NOT EXISTS "lessons_course_idx" ON "lessons" USING btree ("course_id");
  CREATE INDEX IF NOT EXISTS "lessons_updated_at_idx" ON "lessons" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "lessons_created_at_idx" ON "lessons" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "media_updated_at_idx" ON "media" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "media_created_at_idx" ON "media" USING btree ("created_at");
  CREATE UNIQUE INDEX IF NOT EXISTS "media_filename_idx" ON "media" USING btree ("filename");
  CREATE INDEX IF NOT EXISTS "media_sizes_thumbnail_sizes_thumbnail_filename_idx" ON "media" USING btree ("sizes_thumbnail_filename");
  CREATE INDEX IF NOT EXISTS "media_sizes_card_sizes_card_filename_idx" ON "media" USING btree ("sizes_card_filename");
  CREATE INDEX IF NOT EXISTS "user_progress_user_idx" ON "user_progress" USING btree ("user_id");
  CREATE INDEX IF NOT EXISTS "user_progress_lesson_idx" ON "user_progress" USING btree ("lesson_id");
  CREATE INDEX IF NOT EXISTS "user_progress_updated_at_idx" ON "user_progress" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "user_progress_created_at_idx" ON "user_progress" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "achievements_icon_idx" ON "achievements" USING btree ("icon_id");
  CREATE INDEX IF NOT EXISTS "achievements_updated_at_idx" ON "achievements" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "achievements_created_at_idx" ON "achievements" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "user_achievements_user_idx" ON "user_achievements" USING btree ("user_id");
  CREATE INDEX IF NOT EXISTS "user_achievements_achievement_idx" ON "user_achievements" USING btree ("achievement_id");
  CREATE INDEX IF NOT EXISTS "user_achievements_updated_at_idx" ON "user_achievements" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "user_achievements_created_at_idx" ON "user_achievements" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "points_transactions_user_idx" ON "points_transactions" USING btree ("user_id");
  CREATE INDEX IF NOT EXISTS "points_transactions_updated_at_idx" ON "points_transactions" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "points_transactions_created_at_idx" ON "points_transactions" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "notes_user_idx" ON "notes" USING btree ("user_id");
  CREATE INDEX IF NOT EXISTS "notes_lesson_idx" ON "notes" USING btree ("lesson_id");
  CREATE INDEX IF NOT EXISTS "notes_updated_at_idx" ON "notes" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "notes_created_at_idx" ON "notes" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "comments_user_idx" ON "comments" USING btree ("user_id");
  CREATE INDEX IF NOT EXISTS "comments_lesson_idx" ON "comments" USING btree ("lesson_id");
  CREATE INDEX IF NOT EXISTS "comments_parent_comment_idx" ON "comments" USING btree ("parent_comment_id");
  CREATE INDEX IF NOT EXISTS "comments_updated_at_idx" ON "comments" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "comments_created_at_idx" ON "comments" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "notifications_user_idx" ON "notifications" USING btree ("user_id");
  CREATE INDEX IF NOT EXISTS "notifications_updated_at_idx" ON "notifications" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "notifications_created_at_idx" ON "notifications" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "certificates_user_idx" ON "certificates" USING btree ("user_id");
  CREATE UNIQUE INDEX IF NOT EXISTS "certificates_certificate_number_idx" ON "certificates" USING btree ("certificate_number");
  CREATE INDEX IF NOT EXISTS "certificates_updated_at_idx" ON "certificates" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "certificates_created_at_idx" ON "certificates" USING btree ("created_at");
  CREATE UNIQUE INDEX IF NOT EXISTS "streaks_user_idx" ON "streaks" USING btree ("user_id");
  CREATE INDEX IF NOT EXISTS "streaks_updated_at_idx" ON "streaks" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "streaks_created_at_idx" ON "streaks" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_global_slug_idx" ON "payload_locked_documents" USING btree ("global_slug");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_updated_at_idx" ON "payload_locked_documents" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_created_at_idx" ON "payload_locked_documents" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_order_idx" ON "payload_locked_documents_rels" USING btree ("order");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_parent_idx" ON "payload_locked_documents_rels" USING btree ("parent_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_path_idx" ON "payload_locked_documents_rels" USING btree ("path");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_users_id_idx" ON "payload_locked_documents_rels" USING btree ("users_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_roadmaps_id_idx" ON "payload_locked_documents_rels" USING btree ("roadmaps_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_courses_id_idx" ON "payload_locked_documents_rels" USING btree ("courses_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_lessons_id_idx" ON "payload_locked_documents_rels" USING btree ("lessons_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_media_id_idx" ON "payload_locked_documents_rels" USING btree ("media_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_user_progress_id_idx" ON "payload_locked_documents_rels" USING btree ("user_progress_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_achievements_id_idx" ON "payload_locked_documents_rels" USING btree ("achievements_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_user_achievements_id_idx" ON "payload_locked_documents_rels" USING btree ("user_achievements_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_points_transactions_id_idx" ON "payload_locked_documents_rels" USING btree ("points_transactions_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_notes_id_idx" ON "payload_locked_documents_rels" USING btree ("notes_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_comments_id_idx" ON "payload_locked_documents_rels" USING btree ("comments_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_notifications_id_idx" ON "payload_locked_documents_rels" USING btree ("notifications_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_certificates_id_idx" ON "payload_locked_documents_rels" USING btree ("certificates_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_streaks_id_idx" ON "payload_locked_documents_rels" USING btree ("streaks_id");
  CREATE INDEX IF NOT EXISTS "payload_preferences_key_idx" ON "payload_preferences" USING btree ("key");
  CREATE INDEX IF NOT EXISTS "payload_preferences_updated_at_idx" ON "payload_preferences" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "payload_preferences_created_at_idx" ON "payload_preferences" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "payload_preferences_rels_order_idx" ON "payload_preferences_rels" USING btree ("order");
  CREATE INDEX IF NOT EXISTS "payload_preferences_rels_parent_idx" ON "payload_preferences_rels" USING btree ("parent_id");
  CREATE INDEX IF NOT EXISTS "payload_preferences_rels_path_idx" ON "payload_preferences_rels" USING btree ("path");
  CREATE INDEX IF NOT EXISTS "payload_preferences_rels_users_id_idx" ON "payload_preferences_rels" USING btree ("users_id");
  CREATE INDEX IF NOT EXISTS "payload_migrations_updated_at_idx" ON "payload_migrations" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "payload_migrations_created_at_idx" ON "payload_migrations" USING btree ("created_at");
  CREATE INDEX IF NOT EXISTS "site_settings_logo_idx" ON "site_settings" USING btree ("logo_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "users" CASCADE;
  DROP TABLE "roadmaps" CASCADE;
  DROP TABLE "courses" CASCADE;
  DROP TABLE "courses_rels" CASCADE;
  DROP TABLE "lessons_blocks_text" CASCADE;
  DROP TABLE "lessons_blocks_video" CASCADE;
  DROP TABLE "lessons_blocks_image" CASCADE;
  DROP TABLE "lessons_blocks_link" CASCADE;
  DROP TABLE "lessons_blocks_miro" CASCADE;
  DROP TABLE "lessons_blocks_file" CASCADE;
  DROP TABLE "lessons" CASCADE;
  DROP TABLE "media" CASCADE;
  DROP TABLE "user_progress" CASCADE;
  DROP TABLE "achievements" CASCADE;
  DROP TABLE "user_achievements" CASCADE;
  DROP TABLE "points_transactions" CASCADE;
  DROP TABLE "notes" CASCADE;
  DROP TABLE "comments" CASCADE;
  DROP TABLE "notifications" CASCADE;
  DROP TABLE "certificates" CASCADE;
  DROP TABLE "streaks" CASCADE;
  DROP TABLE "payload_locked_documents" CASCADE;
  DROP TABLE "payload_locked_documents_rels" CASCADE;
  DROP TABLE "payload_preferences" CASCADE;
  DROP TABLE "payload_preferences_rels" CASCADE;
  DROP TABLE "payload_migrations" CASCADE;
  DROP TABLE "site_settings" CASCADE;
  DROP TYPE "public"."enum_users_role";
  DROP TYPE "public"."enum_lessons_blocks_video_display_mode";
  DROP TYPE "public"."enum_lessons_blocks_link_platform";
  DROP TYPE "public"."enum_achievements_criteria_type";
  DROP TYPE "public"."enum_points_transactions_reason";
  DROP TYPE "public"."enum_notifications_type";
  DROP TYPE "public"."enum_certificates_type";`)
}
