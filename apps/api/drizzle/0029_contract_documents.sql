CREATE TABLE "anderp"."contract_documents" (
	"id" uuid PRIMARY KEY NOT NULL,
	"organization_id" uuid NOT NULL,
	"contract_id" uuid NOT NULL,
	"storage_key" text NOT NULL,
	"file_name" varchar(255) NOT NULL,
	"content_type" varchar(100) NOT NULL,
	"size_bytes" integer NOT NULL,
	"sha256" char(64) NOT NULL,
	"created_at" timestamp with time zone DEFAULT now() NOT NULL,
	"created_by" uuid,
	"updated_at" timestamp with time zone DEFAULT now() NOT NULL,
	"updated_by" uuid,
	"deleted_at" timestamp with time zone,
	"deleted_by" uuid,
	CONSTRAINT "contract_documents_org_id_uq" UNIQUE("organization_id","id"),
	CONSTRAINT "contract_documents_storage_key_uq" UNIQUE("storage_key"),
	CONSTRAINT "contract_documents_type_ck" CHECK ("anderp"."contract_documents"."content_type" in ('application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document')),
	CONSTRAINT "contract_documents_size_ck" CHECK ("anderp"."contract_documents"."size_bytes" between 1 and 10485760),
	CONSTRAINT "contract_documents_sha256_ck" CHECK ("anderp"."contract_documents"."sha256" ~ '^[0-9a-f]{64}$')
);
--> statement-breakpoint
ALTER TABLE "anderp"."contract_documents" ADD CONSTRAINT "contract_documents_organization_id_organizations_id_fk" FOREIGN KEY ("organization_id") REFERENCES "anderp"."organizations"("id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
ALTER TABLE "anderp"."contract_documents" ADD CONSTRAINT "contract_documents_contract_fk" FOREIGN KEY ("organization_id","contract_id") REFERENCES "anderp"."provider_contracts"("organization_id","id") ON DELETE no action ON UPDATE no action;--> statement-breakpoint
CREATE UNIQUE INDEX "contract_documents_active_uq" ON "anderp"."contract_documents" USING btree ("contract_id") WHERE "anderp"."contract_documents"."deleted_at" is null;