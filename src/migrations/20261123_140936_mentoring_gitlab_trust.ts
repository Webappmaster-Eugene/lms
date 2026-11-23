import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "bootcamp_programs" ADD COLUMN "mentoring_gitlab_group" varchar;
  ALTER TABLE "bootcamp_programs" ADD COLUMN "mentoring_grader_user_id" numeric;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "bootcamp_programs" DROP COLUMN "mentoring_gitlab_group";
  ALTER TABLE "bootcamp_programs" DROP COLUMN "mentoring_grader_user_id";`)
}
