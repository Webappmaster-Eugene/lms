import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Поток буткемпа nodejs проходит 20 учебных недель за 12 календарных (решение владельца 09.11.2026):
 * новая редакция оферты и название позиции в чеке. LMS сохраняет редакцию вместе с оплатой, поэтому
 * она должна совпасть с OFFER_VERSION лендинга. Поле, которое после прежней редакции правили в CMS
 * руками, не трогаем.
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    UPDATE "bootcamp_programs" SET "offer_version" = '2026-11-09', "updated_at" = now()
    WHERE "key" = 'nodejs' AND "offer_version" = '2026-10-31';
    UPDATE "bootcamp_programs"
    SET "receipt_item_name" = 'Буткемп Node.js: онлайн-обучение backend-разработке, 12 недель', "updated_at" = now()
    WHERE "key" = 'nodejs' AND "receipt_item_name" = 'Буткемп Node.js: онлайн-обучение backend-разработке, 20 недель';
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    UPDATE "bootcamp_programs" SET "offer_version" = '2026-10-31', "updated_at" = now()
    WHERE "key" = 'nodejs' AND "offer_version" = '2026-11-09';
    UPDATE "bootcamp_programs"
    SET "receipt_item_name" = 'Буткемп Node.js: онлайн-обучение backend-разработке, 20 недель', "updated_at" = now()
    WHERE "key" = 'nodejs' AND "receipt_item_name" = 'Буткемп Node.js: онлайн-обучение backend-разработке, 12 недель';
  `)
}
