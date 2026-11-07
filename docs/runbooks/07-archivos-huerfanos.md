# Runbook 07 — Archivos huérfanos del bucket de contratos

Un archivo queda huérfano cuando se subió al bucket `contract-documents` pero la transacción que lo registra en la base falló (F17 CA-7). La app nunca borra objetos del bucket: así se acota la falta de respaldo de Supabase Free. Por eso los huérfanos solo ocupan espacio, y no cuentan en el límite de 20 subidas por hora, que cuenta filas.

Revisa el bucket si *Settings → Usage* de Supabase se acerca a 1 GB: al pasarlo se restringe todo el proyecto, base de datos incluida.

## Listar los huérfanos

En el **SQL Editor** de Supabase:

```sql
select o.name, o.created_at
  from storage.objects o
 where o.bucket_id = 'contract-documents'
   and not exists (select 1 from anderp.contract_documents d where d.storage_key = o.name)
 order by o.created_at;
```

Cada fila es un objeto sin registro en la app. La ruta empieza por el id de la organización.

## Qué hacer con ellos

- **Pocos y pequeños:** déjalos. No los ve nadie ni ocupan espacio relevante.
- **Hay que liberar espacio:** bórralos desde *Storage → contract-documents* en Supabase, uno por uno, después de comprobar con la consulta que siguen sin registro. Es una acción irreversible y sin respaldo.
- **Aparecen muchos seguidos:** algo falla al registrar subidas. Revisa los logs de la API en Render (`Unhandled error` en la ruta `POST /contracts/:id/document`).
