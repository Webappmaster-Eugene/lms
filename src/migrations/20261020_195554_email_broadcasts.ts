import { MigrateUpArgs, MigrateDownArgs, sql } from '@payloadcms/db-postgres'

export async function up({ db, payload, req }: MigrateUpArgs): Promise<void> {
  await db.execute(sql`
   CREATE TYPE "public"."enum_email_broadcasts_audience" AS ENUM('all', 'selected');
  CREATE TYPE "public"."enum_email_broadcasts_status" AS ENUM('draft', 'sending', 'sent', 'cancelled', 'failed');
  CREATE TYPE "public"."enum_email_broadcast_deliveries_status" AS ENUM('pending', 'processing', 'sent', 'failed', 'cancelled', 'skipped');
  CREATE TABLE "email_broadcasts" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"subject" varchar NOT NULL,
  	"body" varchar NOT NULL,
  	"cta_label" varchar,
  	"cta_url" varchar,
  	"audience" "enum_email_broadcasts_audience" DEFAULT 'all' NOT NULL,
  	"status" "enum_email_broadcasts_status" DEFAULT 'draft' NOT NULL,
  	"created_by_id" integer,
  	"queued_at" timestamp(3) with time zone,
  	"completed_at" timestamp(3) with time zone,
  	"recipients_total" numeric DEFAULT 0,
  	"excluded_count" numeric DEFAULT 0,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  CREATE TABLE "email_broadcasts_rels" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"order" integer,
  	"parent_id" integer NOT NULL,
  	"path" varchar NOT NULL,
  	"users_id" integer
  );
  
  CREATE TABLE "email_broadcast_deliveries" (
  	"id" serial PRIMARY KEY NOT NULL,
  	"broadcast_id" integer NOT NULL,
  	"user_id" integer NOT NULL,
  	"status" "enum_email_broadcast_deliveries_status" DEFAULT 'pending' NOT NULL,
  	"attempts" numeric DEFAULT 0 NOT NULL,
  	"next_attempt_at" timestamp(3) with time zone NOT NULL,
  	"claim_token" varchar,
  	"last_error" varchar,
  	"sent_at" timestamp(3) with time zone,
  	"updated_at" timestamp(3) with time zone DEFAULT now() NOT NULL,
  	"created_at" timestamp(3) with time zone DEFAULT now() NOT NULL
  );
  
  ALTER TABLE "notification_preferences" ADD COLUMN "email_broadcasts_enabled" boolean DEFAULT true;
  ALTER TABLE "email_broadcasts" ADD CONSTRAINT "email_broadcasts_created_by_id_users_id_fk" FOREIGN KEY ("created_by_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "email_broadcasts_rels" ADD CONSTRAINT "email_broadcasts_rels_parent_fk" FOREIGN KEY ("parent_id") REFERENCES "public"."email_broadcasts"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "email_broadcasts_rels" ADD CONSTRAINT "email_broadcasts_rels_users_fk" FOREIGN KEY ("users_id") REFERENCES "public"."users"("id") ON DELETE cascade ON UPDATE no action;
  ALTER TABLE "email_broadcast_deliveries" ADD CONSTRAINT "email_broadcast_deliveries_broadcast_id_email_broadcasts_id_fk" FOREIGN KEY ("broadcast_id") REFERENCES "public"."email_broadcasts"("id") ON DELETE set null ON UPDATE no action;
  ALTER TABLE "email_broadcast_deliveries" ADD CONSTRAINT "email_broadcast_deliveries_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "public"."users"("id") ON DELETE set null ON UPDATE no action;
  CREATE INDEX "email_broadcasts_status_idx" ON "email_broadcasts" USING btree ("status");
  CREATE INDEX "email_broadcasts_created_by_idx" ON "email_broadcasts" USING btree ("created_by_id");
  CREATE INDEX "email_broadcasts_updated_at_idx" ON "email_broadcasts" USING btree ("updated_at");
  CREATE INDEX "email_broadcasts_created_at_idx" ON "email_broadcasts" USING btree ("created_at");
  CREATE INDEX "email_broadcasts_rels_order_idx" ON "email_broadcasts_rels" USING btree ("order");
  CREATE INDEX "email_broadcasts_rels_parent_idx" ON "email_broadcasts_rels" USING btree ("parent_id");
  CREATE INDEX "email_broadcasts_rels_path_idx" ON "email_broadcasts_rels" USING btree ("path");
  CREATE INDEX "email_broadcasts_rels_users_id_idx" ON "email_broadcasts_rels" USING btree ("users_id");
  CREATE INDEX "email_broadcast_deliveries_user_idx" ON "email_broadcast_deliveries" USING btree ("user_id");
  CREATE INDEX "email_broadcast_deliveries_status_idx" ON "email_broadcast_deliveries" USING btree ("status");
  CREATE INDEX "email_broadcast_deliveries_next_attempt_at_idx" ON "email_broadcast_deliveries" USING btree ("next_attempt_at");
  CREATE INDEX "email_broadcast_deliveries_updated_at_idx" ON "email_broadcast_deliveries" USING btree ("updated_at");
  CREATE INDEX "email_broadcast_deliveries_created_at_idx" ON "email_broadcast_deliveries" USING btree ("created_at");
  CREATE INDEX "email_broadcast_deliveries_broadcast_idx" ON "email_broadcast_deliveries" USING btree ("broadcast_id");
  CREATE UNIQUE INDEX "broadcast_user_idx" ON "email_broadcast_deliveries" USING btree ("broadcast_id","user_id");`)
}

// Откат удаляет и отписки учеников (email_broadcasts_enabled): после повторного up
// все снова станут подписанными. Перед ручным откатом выгрузите отписавшихся.
export async function down({ db, payload, req }: MigrateDownArgs): Promise<void> {
  await db.execute(sql`
   DROP TABLE "email_broadcasts" CASCADE;
  DROP TABLE "email_broadcasts_rels" CASCADE;
  DROP TABLE "email_broadcast_deliveries" CASCADE;
  ALTER TABLE "notification_preferences" DROP COLUMN "email_broadcasts_enabled";
  DROP TYPE "public"."enum_email_broadcasts_audience";
  DROP TYPE "public"."enum_email_broadcasts_status";
  DROP TYPE "public"."enum_email_broadcast_deliveries_status";`)
}
