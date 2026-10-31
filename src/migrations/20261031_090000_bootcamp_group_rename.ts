import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

/**
 * Группа учеников в GitLab переименована 31.10.2026: nodejs-test стала nodejs-bootcamp.
 * Форма зачисления берёт группу из последнего зачисления, поэтому старые записи
 * переводятся на новый путь, иначе следующего ученика заведут в несуществующую группу.
 */

export async function up({ db }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
    UPDATE "bootcamp_enrollments"
    SET "stream_group" = 'nodejs-bootcamp',
        "gitlab_project_url" = replace("gitlab_project_url", '/nodejs-test/', '/nodejs-bootcamp/')
    WHERE "stream_group" = 'nodejs-test';
  `)
}

export async function down({ db }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
    UPDATE "bootcamp_enrollments"
    SET "stream_group" = 'nodejs-test',
        "gitlab_project_url" = replace("gitlab_project_url", '/nodejs-bootcamp/', '/nodejs-test/')
    WHERE "stream_group" = 'nodejs-bootcamp';
  `)
}
