import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "lesson_learning_states" (
    "id" serial PRIMARY KEY NOT NULL,
    "user_id" integer NOT NULL,
    "lesson_id" integer NOT NULL,
    "last_viewed_at" timestamp(3) with time zone NOT NULL,
    "last_video_id" varchar,
    "positions" jsonb DEFAULT '{}'::jsonb,
    "updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
    "created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );

  ALTER TABLE "lesson_learning_states" ADD CONSTRAINT "lesson_learning_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "lesson_learning_states" ADD CONSTRAINT "lesson_learning_states_lesson_id_lessons_id_fk" FOREIGN KEY ("lesson_id") REFERENCES "public"."lessons"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "lesson_learning_states_user_idx" ON "lesson_learning_states" USING btree ("user_id");
  CREATE INDEX "lesson_learning_states_lesson_idx" ON "lesson_learning_states" USING btree ("lesson_id");
  CREATE INDEX "lesson_learning_states_last_viewed_at_idx" ON "lesson_learning_states" USING btree ("last_viewed_at");
  CREATE INDEX "lesson_learning_states_updated_at_idx" ON "lesson_learning_states" USING btree ("updated_at");
  CREATE INDEX "lesson_learning_states_created_at_idx" ON "lesson_learning_states" USING btree ("created_at");
  CREATE UNIQUE INDEX "lesson_user_idx" ON "lesson_learning_states" USING btree ("lesson_id","user_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "lesson_learning_states" CASCADE;`)
}
