CREATE TABLE "anderp"."entity_credentials" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"responsible_person_id" uuid,
	"entity_name" varchar(100) NOT NULL,
	"username" varchar(254) NOT NULL,
	"url" text,
	"contact_1" varchar(50),
	"contact_2" varchar(50),
	"notes" text,
	"password_ciphertext" "bytea" NOT NULL,
	"password_iv" "bytea" NOT NULL,
	"password_auth_tag" "bytea" NOT NULL,
	"key_version" smallint NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "entity_credentials_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "entity_credentials_url_length_ck" CHECK (char_length("anderp"."entity_credentials"."url") <= 2048)
);
--> statement-breakpoint
CREATE TABLE "anderp"."responsible_persons" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"first_name" varchar(30) NOT NULL,
	"last_name" varchar(30) NOT NULL,
	"email" "extensions"."citext",
	"phone" varchar(20),
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "responsible_persons_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "responsible_persons_contact_ck" CHECK ("anderp"."responsible_persons"."email" is not null or "anderp"."responsible_persons"."phone" is not null)
);
--> statement-breakpoint
ALTER TABLE "anderp"."entity_credentials" ADD CONSTRAINT "entity_credentials_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "anderp"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anderp"."entity_credentials" ADD CONSTRAINT "entity_credentials_responsible_fk" FOREIGN KEY ("organization_id","responsible_person_id") REFERENCES "anderp"."responsible_persons"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anderp"."responsible_persons" ADD CONSTRAINT "responsible_persons_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "anderp"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "entity_credentials_uq" ON "anderp"."entity_credentials" USING btree ("organization_id","entity_name","username") WHERE "anderp"."entity_credentials"."deleted_at" is null;