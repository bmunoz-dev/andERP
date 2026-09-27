#!/bin/sh
# Lo ejecuta la imagen oficial de Postgres solo al crear el volumen por primera vez.
set -e
psql -v ON_ERROR_STOP=1 \
  -v app_runtime_password="$APP_RUNTIME_PASSWORD" \
  --username "$POSTGRES_USER" --dbname "$POSTGRES_DB" \
  -f /anderp/bootstrap.sql
