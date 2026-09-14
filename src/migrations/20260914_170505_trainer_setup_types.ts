import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Объявления типов для преамбулы задачи.
 *
 * Преамбула (`setup_code`) исполняется как JavaScript и общая для обоих языков.
 * Компилятор же проверяет решение в strict-режиме и на её нетипизированных
 * фикстурах выдаёт ложные «implicitly has an any type». Поэтому tsc получает
 * отдельные `declare`-объявления, а не исполняемый код.
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "trainer_tasks" ADD COLUMN "setup_types" varchar;`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "trainer_tasks" DROP COLUMN "setup_types";`)
}
