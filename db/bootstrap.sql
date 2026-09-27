-- Bootstrap de AndERP: se ejecuta UNA vez por entorno, como superusuario o dueño de la base.
-- Crea el rol de privilegios mínimos con el que se conecta la API (constitución, principio XII).
-- Requiere la variable de psql `app_runtime_password`:
--   psql -v app_runtime_password='...' -f db/bootstrap.sql

SELECT 'CREATE ROLE app_runtime LOGIN'
WHERE NOT EXISTS (SELECT FROM pg_roles WHERE rolname = 'app_runtime')
\gexec

ALTER ROLE app_runtime WITH LOGIN NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION
  PASSWORD :'app_runtime_password';

-- Las tablas viven en `anderp` y las extensiones en `extensions` (igual que en Supabase).
-- `extensions` debe estar en el search_path para que los operadores de citext se resuelvan.
ALTER ROLE app_runtime SET search_path = anderp, extensions;

-- En Postgres 15+ PUBLIC ya no puede crear en `public`; se deja explícito.
REVOKE CREATE ON SCHEMA public FROM PUBLIC;
