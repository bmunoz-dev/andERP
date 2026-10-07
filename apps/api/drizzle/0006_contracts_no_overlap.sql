-- F03 CA-7: un prestador no puede tener dos contratos vigentes con fechas que se crucen.
-- daterange con fin NULL es un rango abierto ("sin fecha de fin"); '[]' incluye ambos extremos.
-- btree_gist (en el esquema `extensions`) permite combinar `=` sobre uuid con `&&` sobre rangos.
ALTER TABLE "anderp"."provider_contracts"
  ADD CONSTRAINT "provider_contracts_no_overlap"
  EXCLUDE USING gist (
    "service_provider_id" WITH =,
    daterange("start_date", "end_date", '[]') WITH &&
  ) WHERE ("deleted_at" IS NULL);
