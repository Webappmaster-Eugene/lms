import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * ClientID Яндекс Метрики в заявке на буткемп: лендинг присылает его с анкетой. Колонка без значения
 * по умолчанию, поэтому прежний код, который её не знает, работает с новой схемой без изменений.
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "bootcamp_leads" ADD COLUMN "source_ym_client_id" varchar;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "bootcamp_leads" DROP COLUMN "source_ym_client_id";`)
}
