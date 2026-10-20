-- F18 reemplaza a Clic Kiu (F11) sin migrar datos: producción no tenía movimientos (spec F18, CA-34).
-- Segunda barrera tras la consulta previa: si la tabla tiene filas, el despliegue se detiene aquí.
DO $$
BEGIN
  IF EXISTS (SELECT 1 FROM "anderp"."clickiu_movements") THEN
    RAISE EXCEPTION 'clickiu_movements is not empty';
  END IF;
END;
$$;
--> statement-breakpoint
-- La vista está fuera del esquema de Drizzle: se suelta a mano antes de que la 0031 borre la tabla.
DROP VIEW "anderp"."v_clickiu_balance";
