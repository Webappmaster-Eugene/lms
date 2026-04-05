import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_roadmap_nodes_stage" AS ENUM('start', 'base', 'stage1', 'stage2', 'practice', 'advanced', 'growth');
  CREATE TYPE "public"."enum_roadmap_nodes_color" AS ENUM('yellow', 'lime', 'white', 'gray', 'pink', 'blue', 'red');
  CREATE TABLE IF NOT EXISTS "roadmap_nodes_bullets" (
  	"_order" integer NOT NULL,
  	"_parent_id" integer NOT NULL,
  	"id" varchar PRIMARY KEY NOT NULL,
  	"text" varchar NOT NULL
  );
  
  ALTER TABLE "roadmap_nodes" ADD COLUMN "stage" "enum_roadmap_nodes_stage";
  ALTER TABLE "roadmap_nodes" ADD COLUMN "color" "enum_roadmap_nodes_color";
  DO $$ BEGIN
   ALTER TABLE "roadmap_nodes_bullets" ADD CONSTRAINT "roadmap_nodes_bullets_parent_id_fk" FOREIGN KEY ("_parent_id") REFERENCES "public"."roadmap_nodes"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  CREATE INDEX IF NOT EXISTS "roadmap_nodes_bullets_order_idx" ON "roadmap_nodes_bullets" USING btree ("_order");
  CREATE INDEX IF NOT EXISTS "roadmap_nodes_bullets_parent_id_idx" ON "roadmap_nodes_bullets" USING btree ("_parent_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "roadmap_nodes_bullets" CASCADE;
  ALTER TABLE "roadmap_nodes" DROP COLUMN IF EXISTS "stage";
  ALTER TABLE "roadmap_nodes" DROP COLUMN IF EXISTS "color";
  DROP TYPE "public"."enum_roadmap_nodes_stage";
  DROP TYPE "public"."enum_roadmap_nodes_color";`)
}
