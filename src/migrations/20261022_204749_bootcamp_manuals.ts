import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "lessons_blocks_markdown" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"markdown" varchar NOT NULL,
  	"source" varchar,
  	"block_name" varchar
  );
  
  ALTER TABLE "courses" ADD COLUMN "assigned_only" boolean DEFAULT false;
  ALTER TABLE "lessons_blocks_markdown" ADD CONSTRAINT "lessons_blocks_markdown_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "lessons_blocks_markdown_order_idx" ON "lessons_blocks_markdown" USING btree ("_order");
  CREATE INDEX "lessons_blocks_markdown_parent_id_idx" ON "lessons_blocks_markdown" USING btree ("_parent_id");
  CREATE INDEX "lessons_blocks_markdown_path_idx" ON "lessons_blocks_markdown" USING btree ("_path");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "lessons_blocks_markdown" CASCADE;
  ALTER TABLE "courses" DROP COLUMN "assigned_only";`)
}
