import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "lessons_blocks_slides_items" (
  	"_order" integer NOT NULL,
  	"_parent_id" varchar NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"url" varchar NOT NULL,
  	"file_name" varchar,
  	"caption" varchar
  );
  
  CREATE TABLE "lessons_blocks_slides" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"_path" text NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"title" varchar NOT NULL,
  	"description" varchar,
  	"folder_url" varchar,
  	"block_name" varchar
  );
  
  ALTER TABLE "lessons_blocks_slides_items" ADD CONSTRAINT "lessons_blocks_slides_items_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."lessons_blocks_slides"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "lessons_blocks_slides" ADD CONSTRAINT "lessons_blocks_slides_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."lessons"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "lessons_blocks_slides_items_order_idx" ON "lessons_blocks_slides_items" USING btree ("_order");
  CREATE INDEX "lessons_blocks_slides_items_parent_id_idx" ON "lessons_blocks_slides_items" USING btree ("_parent_id");
  CREATE INDEX "lessons_blocks_slides_order_idx" ON "lessons_blocks_slides" USING btree ("_order");
  CREATE INDEX "lessons_blocks_slides_parent_id_idx" ON "lessons_blocks_slides" USING btree ("_parent_id");
  CREATE INDEX "lessons_blocks_slides_path_idx" ON "lessons_blocks_slides" USING btree ("_path");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "lessons_blocks_slides_items" CASCADE;
  DROP TABLE "lessons_blocks_slides" CASCADE;`)
}
