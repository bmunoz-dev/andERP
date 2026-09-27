-- Generada por drizzle-kit y completada a mano (F00-T017).

-- Extensiones en el esquema `extensions`, igual que en Supabase.
CREATE SCHEMA IF NOT EXISTS "extensions";
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS "citext" WITH SCHEMA "extensions";
--> statement-breakpoint
CREATE EXTENSION IF NOT EXISTS "btree_gist" WITH SCHEMA "extensions";
--> statement-breakpoint
CREATE SCHEMA "anderp";
--> statement-breakpoint
CREATE TYPE "anderp"."member_role" AS ENUM('admin');--> statement-breakpoint
CREATE TYPE "anderp"."organization_status" AS ENUM('active', 'suspended');--> statement-breakpoint
CREATE TYPE "anderp"."payment_frequency" AS ENUM('weekly', 'biweekly', 'monthly', 'bimonthly');--> statement-breakpoint
CREATE TYPE "anderp"."user_status" AS ENUM('active', 'locked', 'inactive');--> statement-breakpoint

-- Privilegios del rol de la API (creado por db/bootstrap.sql). Los objetos que creen las
-- migraciones siguientes heredan estos permisos; nunca puede crear ni alterar objetos.
GRANT USAGE ON SCHEMA "extensions" TO app_runtime;--> statement-breakpoint
GRANT USAGE ON SCHEMA "anderp" TO app_runtime;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA "anderp" GRANT SELECT, INSERT, UPDATE, DELETE ON TABLES TO app_runtime;--> statement-breakpoint
ALTER DEFAULT PRIVILEGES IN SCHEMA "anderp" GRANT EXECUTE ON FUNCTIONS TO app_runtime;
