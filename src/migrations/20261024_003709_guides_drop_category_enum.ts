import { MigrateDownArgs, MigrateUpArgs, sql } from '@payloadcms/db-postgres'

// Фаза contract после guides_categories: категория гайда живёт только в связи category_id,
// прежнюю колонку-перечисление и её тип больше никто не читает.
export async function up({ db }: MigrateUpArgs): Promise<void> {
  // Сначала колонки, потом типы: тип нельзя удалить, пока на него ссылается колонка.
  await db.execute(sql`
  ALTER TABLE "guides" DROP COLUMN IF EXISTS "category";
  ALTER TABLE "_guides_v" DROP COLUMN IF EXISTS "version_category";
  DROP TYPE IF EXISTS "public"."enum_guides_category";
  DROP TYPE IF EXISTS "public"."enum__guides_v_version_category";`)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  // Колонки возвращаются пустыми: значение осталось в связи category_id, перенос обратно не нужен.
  await db.execute(sql`
  CREATE TYPE "public"."enum_guides_category" AS ENUM('career', 'ai', 'business', 'other');
  CREATE TYPE "public"."enum__guides_v_version_category" AS ENUM('career', 'ai', 'business', 'other');
  ALTER TABLE "guides" ADD COLUMN IF NOT EXISTS "category" "enum_guides_category";
  ALTER TABLE "_guides_v" ADD COLUMN IF NOT EXISTS "version_category" "enum__guides_v_version_category";`)
}
