import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_account_freezes_reason" AS ENUM('vacation', 'left', 'no-contact', 'term', 'other');
  CREATE TABLE "account_freezes" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"user_id" integer NOT NULL,
  	"starts_at" timestamp(3) with time zone NOT NULL,
  	"ends_at" timestamp(3) with time zone,
  	"reason" "enum_account_freezes_reason" NOT NULL,
  	"automatic" boolean DEFAULT false,
  	"note" varchar,
  	"created_by_id" integer,
  	"ended_by_id" integer,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "users" ADD COLUMN "is_test_student" boolean DEFAULT false;
  ALTER TABLE "account_freezes" ADD CONSTRAINT "account_freezes_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "account_freezes" ADD CONSTRAINT "account_freezes_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "account_freezes" ADD CONSTRAINT "account_freezes_ended_by_id_users_id_fk" FOREIGN KEY ("ended_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "account_freezes_user_idx" ON "account_freezes" USING btree ("user_id");
  CREATE INDEX "account_freezes_starts_at_idx" ON "account_freezes" USING btree ("starts_at");
  CREATE INDEX "account_freezes_ends_at_idx" ON "account_freezes" USING btree ("ends_at");
  CREATE INDEX "account_freezes_created_by_idx" ON "account_freezes" USING btree ("created_by_id");
  CREATE INDEX "account_freezes_ended_by_idx" ON "account_freezes" USING btree ("ended_by_id");
  CREATE INDEX "account_freezes_updated_at_idx" ON "account_freezes" USING btree ("updated_at");
  CREATE INDEX "account_freezes_created_at_idx" ON "account_freezes" USING btree ("created_at");`)

  // Данные: тестовый ученик - учётка, зачисленная по заявке «Тестовая заявка».
  await db.execute(sql`
  UPDATE "users" SET "is_test_student" = true
  WHERE "id" IN (
    SELECT e."lms_user_id" FROM "bootcamp_enrollments" e
    JOIN "bootcamp_leads" l ON l."id" = e."lead_id"
    WHERE l."is_test" = true AND e."lms_user_id" IS NOT NULL
  );`)

  // Решение владельца 12.11.2026: каждый ученик замерзает через 6 месяцев после создания учётки,
  // чтобы вышел на связь за продлением. У кого полгода уже прошли, замерзает в момент выката.
  // Месяцы считаются по московскому календарю, как addMoscowMonths. Роль - из политики доступа.
  await db.execute(sql`
  INSERT INTO "account_freezes" ("user_id", "starts_at", "reason", "automatic")
  SELECT u."id",
    greatest((((u."created_at" AT TIME ZONE 'Europe/Moscow') + interval '6 months') AT TIME ZONE 'Europe/Moscow'), now()),
    'term', true
  FROM "users" u
  LEFT JOIN "learning_access_policies" p ON p."user_id" = u."id"
  WHERE coalesce(p."role"::text, u."role"::text) = 'student'
    AND NOT coalesce(u."is_test_student", false);`)
}

export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "account_freezes" CASCADE;
  ALTER TABLE "users" DROP COLUMN "is_test_student";
  DROP TYPE "public"."enum_account_freezes_reason";`)
}
