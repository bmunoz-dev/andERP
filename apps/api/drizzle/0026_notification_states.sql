CREATE TYPE "anderp"."notification_kind" AS ENUM('obligation_upcoming', 'obligation_overdue');--> statement-breakpoint
CREATE TABLE "anderp"."notification_states" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"user_id" uuid NOT NULL,
	"due_date_id" uuid NOT NULL,
	"kind" "anderp"."notification_kind" NOT NULL,
	"seen_at" timestamp with time zone,
	"dismissed_at" timestamp with time zone,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	CONSTRAINT "notification_states_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "notification_states_key_uq" UNIQUE("user_id","due_date_id","kind")
);
--> statement-breakpoint
ALTER TABLE "anderp"."notification_states" ADD CONSTRAINT "notification_states_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "anderp"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anderp"."notification_states" ADD CONSTRAINT "notification_states_user_id_users_id_fk" FOREIGN KEY ("user_id") REFERENCES "anderp"."users"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anderp"."notification_states" ADD CONSTRAINT "notification_states_due_date_fk" FOREIGN KEY ("organization_id","due_date_id") REFERENCES "anderp"."obligation_due_dates"("organization_id","id") ON DELETE no action ON UPDATE no action;