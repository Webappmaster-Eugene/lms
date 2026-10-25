import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "guides" ADD COLUMN "is_public" boolean DEFAULT false;
  ALTER TABLE "_guides_v" ADD COLUMN "version_is_public" boolean DEFAULT false;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "guides" DROP COLUMN "is_public";
  ALTER TABLE "_guides_v" DROP COLUMN "version_is_public";`)
}
