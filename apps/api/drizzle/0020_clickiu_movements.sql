CREATE TYPE "anderp"."clickiu_movement_type" AS ENUM('recharge', 'sale');--> statement-breakpoint
CREATE TYPE "anderp"."clickiu_sale_status" AS ENUM('credit', 'completed');--> statement-breakpoint
CREATE TABLE "anderp"."clickiu_movements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"type" "anderp"."clickiu_movement_type" NOT NULL,
	"status" "anderp"."clickiu_sale_status",
	"movement_date" date NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"description" varchar(500),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "clickiu_movements_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "clickiu_movements_status_ck" CHECK (("anderp"."clickiu_movements"."type" = 'sale') = ("anderp"."clickiu_movements"."status" is not null)),
	CONSTRAINT "clickiu_movements_amount_ck" CHECK ("anderp"."clickiu_movements"."amount" > 0)
);
--> statement-breakpoint
ALTER TABLE "anderp"."clickiu_movements" ADD CONSTRAINT "clickiu_movements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "anderp"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE INDEX "clickiu_movements_org_date_idx" ON "anderp"."clickiu_movements" USING btree ("organization_id","movement_date") WHERE "anderp"."clickiu_movements"."deleted_at" is null;