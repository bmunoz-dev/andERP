CREATE TYPE "anderp"."air_collection_status" AS ENUM('pending', 'collected');--> statement-breakpoint
CREATE TYPE "anderp"."air_movement_type" AS ENUM('opening_balance', 'recharge', 'payment', 'refund', 'issue');--> statement-breakpoint
CREATE TABLE "anderp"."air_account_movements" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"account_id" uuid NOT NULL,
	"type" "anderp"."air_movement_type" NOT NULL,
	"movement_date" date NOT NULL,
	"amount" numeric(14, 2) NOT NULL,
	"description" varchar(500),
	"pnr" varchar(6),
	"ticket_number" varchar(13),
	"passenger" varchar(120),
	"net_fare" numeric(14, 2),
	"taxes" numeric(14, 2),
	"collection_status" "anderp"."air_collection_status",
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "air_account_movements_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "air_account_movements_ticket_ck" CHECK (num_nonnulls("anderp"."air_account_movements"."pnr", "anderp"."air_account_movements"."ticket_number", "anderp"."air_account_movements"."passenger", "anderp"."air_account_movements"."net_fare", "anderp"."air_account_movements"."taxes", "anderp"."air_account_movements"."collection_status")
        = case when "anderp"."air_account_movements"."type" = 'issue' then 6 else 0 end),
	CONSTRAINT "air_account_movements_amount_ck" CHECK ("anderp"."air_account_movements"."amount" <> 0
        and ("anderp"."air_account_movements"."type" = 'opening_balance' or "anderp"."air_account_movements"."amount" > 0)
        and ("anderp"."air_account_movements"."type" <> 'issue' or "anderp"."air_account_movements"."amount" = "anderp"."air_account_movements"."net_fare" + "anderp"."air_account_movements"."taxes")),
	CONSTRAINT "air_account_movements_fare_ck" CHECK ("anderp"."air_account_movements"."net_fare" >= 0 and "anderp"."air_account_movements"."taxes" >= 0),
	CONSTRAINT "air_account_movements_pnr_ck" CHECK ("anderp"."air_account_movements"."pnr" ~ '^[A-Z0-9]{6}$'),
	CONSTRAINT "air_account_movements_ticket_number_ck" CHECK ("anderp"."air_account_movements"."ticket_number" ~ '^[0-9]{13}$')
);
--> statement-breakpoint
CREATE TABLE "anderp"."air_accounts" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"operator_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"credit_limit" numeric(14, 2) DEFAULT '0' NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "air_accounts_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "air_accounts_credit_limit_ck" CHECK ("anderp"."air_accounts"."credit_limit" >= 0)
);
--> statement-breakpoint
CREATE TABLE "anderp"."air_operators" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(120) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "air_operators_org_id_uq" UNIQUE("organization_id","id")
);
--> statement-breakpoint
ALTER TABLE "anderp"."air_account_movements" ADD CONSTRAINT "air_account_movements_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "anderp"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anderp"."air_account_movements" ADD CONSTRAINT "air_account_movements_account_fk" FOREIGN KEY ("organization_id","account_id") REFERENCES "anderp"."air_accounts"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anderp"."air_accounts" ADD CONSTRAINT "air_accounts_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "anderp"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anderp"."air_accounts" ADD CONSTRAINT "air_accounts_operator_fk" FOREIGN KEY ("organization_id","operator_id") REFERENCES "anderp"."air_operators"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anderp"."air_operators" ADD CONSTRAINT "air_operators_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "anderp"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "air_account_movements_ticket_number_uq" ON "anderp"."air_account_movements" USING btree ("organization_id","ticket_number") WHERE "anderp"."air_account_movements"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "air_account_movements_opening_uq" ON "anderp"."air_account_movements" USING btree ("account_id") WHERE "anderp"."air_account_movements"."type" = 'opening_balance' and "anderp"."air_account_movements"."deleted_at" is null;--> statement-breakpoint
CREATE INDEX "air_account_movements_account_date_idx" ON "anderp"."air_account_movements" USING btree ("organization_id","account_id","movement_date") WHERE "anderp"."air_account_movements"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "air_accounts_name_uq" ON "anderp"."air_accounts" USING btree ("organization_id","operator_id",lower("name")) WHERE "anderp"."air_accounts"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "air_operators_name_uq" ON "anderp"."air_operators" USING btree ("organization_id",lower("name")) WHERE "anderp"."air_operators"."deleted_at" is null;