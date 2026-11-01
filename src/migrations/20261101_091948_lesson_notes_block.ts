import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_lessons_blocks_lesson_notes_source" AS ENUM('author', 'transcript', 'outline', 'topic');
  CREATE TABLE "lessons_blocks_lesson_notes" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"markdown" varchar NOT NULL,
  	"source" "enum_lessons_blocks_lesson_notes_source" DEFAULT 'topic' NOT NULL,
  	"source_ref" varchar,
  	"block_name" varchar
  );
  
  ALTER TABLE "lessons_blocks_lesson_notes" ADD CONSTRAINT "lessons_blocks_lesson_notes_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "lessons_blocks_lesson_notes_order_idx" ON "lessons_blocks_lesson_notes" USING btree ("_order");
  CREATE INDEX "lessons_blocks_lesson_notes_parent_id_idx" ON "lessons_blocks_lesson_notes" USING btree ("_parent_id");
  CREATE INDEX "lessons_blocks_lesson_notes_path_idx" ON "lessons_blocks_lesson_notes" USING btree ("_path");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "lessons_blocks_lesson_notes" CASCADE;
  DROP TYPE "public"."enum_lessons_blocks_lesson_notes_source";`)
}
