import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
    await db.execute(sql`
      with matched as (
        select e.id, min(c.id) as course_id
        from bootcamp_enrollments e
        join learning_access_grants g on g.user_id = e.lms_user_id and g.effect = 'allow'
          and g.note = concat('Буткемп: поток ', e.stream_group, ', логин GitLab ', e.gitlab_username)
        join courses c on c.is_bootcamp and g.rule_key = concat(e.lms_user_id, ':courses:', c.id)
        where e.manuals_course_id is null
        group by e.id having count(*) = 1
      )
      update bootcamp_enrollments e set manuals_course_id = m.course_id
      from matched m where e.id = m.id and e.manuals_course_id is null
    `)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
    // Сопоставление не меняет права и остается действительным при откате приложения.
}
