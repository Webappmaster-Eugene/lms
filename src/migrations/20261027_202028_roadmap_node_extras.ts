import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TABLE "roadmap_nodes_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"guides_id" integer,
  	"courses_id" integer
  );
  
  ALTER TABLE "roadmap_nodes_rels" ADD CONSTRAINT "roadmap_nodes_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."roadmap_nodes"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "roadmap_nodes_rels" ADD CONSTRAINT "roadmap_nodes_rels_guides_fk" FOREIGN KEY ("guides_id") REFERENCES "public"."guides"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "roadmap_nodes_rels" ADD CONSTRAINT "roadmap_nodes_rels_courses_fk" FOREIGN KEY ("courses_id") REFERENCES "public"."courses"("id") ON DELETE cascade ON UPDATE no action;
  CREATE INDEX "roadmap_nodes_rels_order_idx" ON "roadmap_nodes_rels" USING btree ("order");
  CREATE INDEX "roadmap_nodes_rels_parent_idx" ON "roadmap_nodes_rels" USING btree ("parent_id");
  CREATE INDEX "roadmap_nodes_rels_path_idx" ON "roadmap_nodes_rels" USING btree ("path");
  CREATE INDEX "roadmap_nodes_rels_guides_id_idx" ON "roadmap_nodes_rels" USING btree ("guides_id");
  CREATE INDEX "roadmap_nodes_rels_courses_id_idx" ON "roadmap_nodes_rels" USING btree ("courses_id");`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "roadmap_nodes_rels" CASCADE;`)
}
