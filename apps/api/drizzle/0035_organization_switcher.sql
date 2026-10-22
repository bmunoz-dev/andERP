ALTER TABLE "anderp"."organization_members" ADD COLUMN "last_selected_at" timestamp with time zone;--> statement-breakpoint
ALTER TABLE "anderp"."sessions" ADD COLUMN "organization_id" uuid;--> statement-breakpoint
UPDATE anderp.sessions s SET organization_id = COALESCE((SELECT m.organization_id FROM anderp.organization_members m JOIN anderp.organizations o ON o.id = m.organization_id WHERE m.user_id = s.user_id AND m.is_active AND m.deleted_at IS NULL AND o.deleted_at IS NULL ORDER BY m.created_at LIMIT 1), (SELECT m.organization_id FROM anderp.organization_members m WHERE m.user_id = s.user_id ORDER BY m.created_at LIMIT 1));--> statement-breakpoint
DELETE FROM anderp.sessions WHERE organization_id IS NULL;--> statement-breakpoint
ALTER TABLE "anderp"."sessions" ALTER COLUMN "organization_id" SET NOT NULL;--> statement-breakpoint
ALTER TABLE "anderp"."sessions" ADD CONSTRAINT "sessions_membership_fk" FOREIGN KEY ("user_id","organization_id") REFERENCES "anderp"."organization_members"("user_id","organization_id") ON DELETE no action ON UPDATE no action;
