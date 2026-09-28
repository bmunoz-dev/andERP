CREATE TABLE "anderp"."account_types" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(30) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid
);
--> statement-breakpoint
CREATE TABLE "anderp"."banks" (
	"id" uuid PRIMARY KEY NOT NULL,
	"name" varchar(60) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid
);
--> statement-breakpoint
CREATE TABLE "anderp"."document_types" (
	"id" uuid PRIMARY KEY NOT NULL,
	"code" varchar(5) NOT NULL,
	"name" varchar(40) NOT NULL,
	"is_active" boolean DEFAULT true NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid
);
--> statement-breakpoint
CREATE TABLE "anderp"."expense_categories" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"name" varchar(40) NOT NULL,
	"system_code" varchar(20),
	"is_active" boolean DEFAULT true NOT NULL,
	"sort_order" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "expense_categories_org_id_uq" UNIQUE("organization_id","id")
);
--> statement-breakpoint
ALTER TABLE "anderp"."organization_members" ADD COLUMN "is_active" boolean DEFAULT true NOT NULL;--> statement-breakpoint
ALTER TABLE "anderp"."expense_categories" ADD CONSTRAINT "expense_categories_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "anderp"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "account_types_name_uq" ON "anderp"."account_types" USING btree ("name") WHERE "anderp"."account_types"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "banks_name_uq" ON "anderp"."banks" USING btree ("name") WHERE "anderp"."banks"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "document_types_code_uq" ON "anderp"."document_types" USING btree ("code") WHERE "anderp"."document_types"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "expense_categories_name_uq" ON "anderp"."expense_categories" USING btree ("organization_id","name") WHERE "anderp"."expense_categories"."deleted_at" is null;--> statement-breakpoint
CREATE UNIQUE INDEX "expense_categories_system_code_uq" ON "anderp"."expense_categories" USING btree ("organization_id","system_code") WHERE "anderp"."expense_categories"."deleted_at" is null;