import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  // До этого флага «только по назначению» ставился лишь буткемпу (на проде — методички Node.js):
  // без разметки он после выката остался бы в «Курсах».
  await db.execute(sql`
   ALTER TABLE "courses" ADD COLUMN "is_bootcamp" boolean DEFAULT false;
  UPDATE "courses" SET "is_bootcamp" = true WHERE "assigned_only" = true;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "courses" DROP COLUMN "is_bootcamp";`)
}
