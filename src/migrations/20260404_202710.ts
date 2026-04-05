import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_roadmap_nodes_node_type" AS ENUM('category', 'topic', 'subtopic');
  CREATE TYPE "public"."enum_roadmap_edges_edge_type" AS ENUM('smoothstep', 'default', 'straight');
  CREATE TABLE IF NOT EXISTS "roadmap_nodes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"node_id" varchar NOT NULL,
  	"label" varchar NOT NULL,
  	"node_type" "enum_roadmap_nodes_node_type" DEFAULT 'topic' NOT NULL,
  	"roadmap_id" integer NOT NULL,
  	"course_id" integer,
  	"position_x" numeric DEFAULT 0 NOT NULL,
  	"position_y" numeric DEFAULT 0 NOT NULL,
  	"description" varchar,
  	"icon" varchar,
  	"order" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE IF NOT EXISTS "roadmap_edges" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"edge_id" varchar NOT NULL,
  	"roadmap_id" integer NOT NULL,
  	"source_id" integer NOT NULL,
  	"target_id" integer NOT NULL,
  	"edge_type" "enum_roadmap_edges_edge_type" DEFAULT 'smoothstep',
  	"animated" boolean DEFAULT false,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "roadmap_nodes_id" integer;
  ALTER TABLE "payload_locked_documents_rels" ADD COLUMN "roadmap_edges_id" integer;
  DO $$ BEGIN
   ALTER TABLE "roadmap_nodes" ADD CONSTRAINT "roadmap_nodes_roadmap_id_roadmaps_id_fk" FOREIGN KEY ("roadmap_id") REFERENCES "public"."roadmaps"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "roadmap_nodes" ADD CONSTRAINT "roadmap_nodes_course_id_courses_id_fk" FOREIGN KEY ("course_id") REFERENCES "public"."courses"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "roadmap_edges" ADD CONSTRAINT "roadmap_edges_roadmap_id_roadmaps_id_fk" FOREIGN KEY ("roadmap_id") REFERENCES "public"."roadmaps"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "roadmap_edges" ADD CONSTRAINT "roadmap_edges_source_id_roadmap_nodes_id_fk" FOREIGN KEY ("source_id") REFERENCES "public"."roadmap_nodes"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "roadmap_edges" ADD CONSTRAINT "roadmap_edges_target_id_roadmap_nodes_id_fk" FOREIGN KEY ("target_id") REFERENCES "public"."roadmap_nodes"("id") ON DELETE set null ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  CREATE UNIQUE INDEX IF NOT EXISTS "roadmap_nodes_node_id_idx" ON "roadmap_nodes" USING btree ("node_id");
  CREATE INDEX IF NOT EXISTS "roadmap_nodes_roadmap_idx" ON "roadmap_nodes" USING btree ("roadmap_id");
  CREATE INDEX IF NOT EXISTS "roadmap_nodes_course_idx" ON "roadmap_nodes" USING btree ("course_id");
  CREATE INDEX IF NOT EXISTS "roadmap_nodes_updated_at_idx" ON "roadmap_nodes" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "roadmap_nodes_created_at_idx" ON "roadmap_nodes" USING btree ("created_at");
  CREATE UNIQUE INDEX IF NOT EXISTS "roadmap_edges_edge_id_idx" ON "roadmap_edges" USING btree ("edge_id");
  CREATE INDEX IF NOT EXISTS "roadmap_edges_roadmap_idx" ON "roadmap_edges" USING btree ("roadmap_id");
  CREATE INDEX IF NOT EXISTS "roadmap_edges_source_idx" ON "roadmap_edges" USING btree ("source_id");
  CREATE INDEX IF NOT EXISTS "roadmap_edges_target_idx" ON "roadmap_edges" USING btree ("target_id");
  CREATE INDEX IF NOT EXISTS "roadmap_edges_updated_at_idx" ON "roadmap_edges" USING btree ("updated_at");
  CREATE INDEX IF NOT EXISTS "roadmap_edges_created_at_idx" ON "roadmap_edges" USING btree ("created_at");
  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_roadmap_nodes_fk" FOREIGN KEY ("roadmap_nodes_id") REFERENCES "public"."roadmap_nodes"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  DO $$ BEGIN
   ALTER TABLE "payload_locked_documents_rels" ADD CONSTRAINT "payload_locked_documents_rels_roadmap_edges_fk" FOREIGN KEY ("roadmap_edges_id") REFERENCES "public"."roadmap_edges"("id") ON DELETE cascade ON UPDATE no action;
  EXCEPTION
   WHEN duplicate_object THEN null;
  END $$;
  
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_roadmap_nodes_id_idx" ON "payload_locked_documents_rels" USING btree ("roadmap_nodes_id");
  CREATE INDEX IF NOT EXISTS "payload_locked_documents_rels_roadmap_edges_id_idx" ON "payload_locked_documents_rels" USING btree ("roadmap_edges_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "roadmap_nodes" DISABLE ROW LEVEL SECURITY;
  ALTER TABLE "roadmap_edges" DISABLE ROW LEVEL SECURITY;
  DROP TABLE "roadmap_nodes" CASCADE;
  DROP TABLE "roadmap_edges" CASCADE;
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_roadmap_nodes_fk";
  
  ALTER TABLE "payload_locked_documents_rels" DROP CONSTRAINT "payload_locked_documents_rels_roadmap_edges_fk";
  
  DROP INDEX IF EXISTS "payload_locked_documents_rels_roadmap_nodes_id_idx";
  DROP INDEX IF EXISTS "payload_locked_documents_rels_roadmap_edges_id_idx";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "roadmap_nodes_id";
  ALTER TABLE "payload_locked_documents_rels" DROP COLUMN IF EXISTS "roadmap_edges_id";
  DROP TYPE "public"."enum_roadmap_nodes_node_type";
  DROP TYPE "public"."enum_roadmap_edges_edge_type";`)
}
