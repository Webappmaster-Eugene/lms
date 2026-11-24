import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "tutoring_participants" ADD COLUMN "gitlab_invite_email" varchar;
  ALTER TABLE "tutoring_projects" ADD COLUMN "gitlab_email" varchar;`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   ALTER TABLE "tutoring_participants" DROP COLUMN "gitlab_invite_email";
  ALTER TABLE "tutoring_projects" DROP COLUMN "gitlab_email";`)
}
