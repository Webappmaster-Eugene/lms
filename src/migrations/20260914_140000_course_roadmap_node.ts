import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Привязка курса к теме роадмапа.
 *
 * Узел карты рассчитан ровно на один курс, а в библиотеке по одной теме их
 * несколько: по React — четыре курса, по TypeScript — три. Из-за этого 21 курс
 * из 47 не был связан ни с одним узлом и находился только через каталог.
 *
 * Курс теперь сам указывает свою тему, а узел собирает все курсы темы: так
 * карта остаётся читаемой и ни один курс не теряется. Связь необязательная —
 * курс без темы просто не попадает на карту, как и раньше.
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    ALTER TABLE "courses" ADD COLUMN IF NOT EXISTS "roadmap_node_id" integer;

    DO $$ BEGIN
      ALTER TABLE "courses" ADD CONSTRAINT "courses_roadmap_node_id_roadmap_nodes_id_fk"
        FOREIGN KEY ("roadmap_node_id") REFERENCES "public"."roadmap_nodes"("id")
        ON DELETE set null ON UPDATE no action;
    EXCEPTION
      WHEN duplicate_object THEN null;
    END $$;

    CREATE INDEX IF NOT EXISTS "courses_roadmap_node_idx" ON "courses" USING btree ("roadmap_node_id");
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    DROP INDEX IF EXISTS "courses_roadmap_node_idx";
    ALTER TABLE "courses" DROP CONSTRAINT IF EXISTS "courses_roadmap_node_id_roadmap_nodes_id_fk";
    ALTER TABLE "courses" DROP COLUMN IF EXISTS "roadmap_node_id";
  `)
}
