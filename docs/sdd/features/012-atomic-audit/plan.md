# F12 — Auditoría atómica · Plan

- **Estado:** En revisión
- **Spec:** [spec.md](spec.md)

## Interfaz

`AuditLogger.log(entry, db?: DbExecutor)`: el segundo parámetro, opcional, es la transacción en curso. `AuditService` escribe con `(db ?? this.db).insert(auditLogs)`. Las llamadas que no lo pasan (auth, `credential.reveal`) y los dobles de las pruebas unitarias no cambian.

## Regla en los servicios

Toda operación que audita un cambio sigue esta forma:

```ts
return this.db.transaction(async (tx) => {
  const before = await this.get(id, tx);
  const [after] = await tx.update(...)...;
  await this.audit.log({ ... }, tx);
  return after;
});
```

- La lectura del `before`, el cambio y la auditoría van dentro de la transacción. Los `get` aceptan `db: DbExecutor = this.db`, como `fee-payments`.
- Las validaciones previas que solo leen (`assertCategoryActive`, `providers.assertExists`, `assertDateRange`) se quedan fuera.
- Sin una ayuda nueva tipo `auditedTransaction()`: tres líneas repetidas son más claras que otra abstracción.

## Por módulo

| Servicio | Métodos | Cambio |
|---|---|---|
| `clickiu` | create, update, remove | Transacción nueva. El trigger del saldo se revisa al confirmar, después de la auditoría; si falla, se deshacen los dos. |
| `expenses` | create, update, remove | Transacción nueva. |
| `fee-payments` | create, update, remove | La auditoría entra en la transacción de create y update; remove usa una nueva. |
| `contracts` | create, update, remove | Transacción nueva. |
| `organizations` | create, update | La auditoría entra en la transacción de create; update usa una nueva. |
| `members` | invite, resendInvite | La auditoría entra en la transacción que ya existe, después del correo. |
| `members` | setActive | Transacción con la membresía y la auditoría; `revokeAllForUser` después de confirmar (CA-4). |
| `credentials` | update | Transacción nueva. |

## Pruebas

`test/audit-atomicity.test.ts`, contra el Postgres real:

- Para cada operación del CA-2, `withOwnerSql` agrega a `audit_logs` una restricción `CHECK (action <> '<acción>') NOT VALID` que hace fallar solo el insert de esa acción; se quita en `afterEach`.
- La operación se ejecuta por HTTP: responde `500` y el cambio no quedó (la fila no existe, conserva sus valores o sigue sin borrar).
- Primero se escribe la prueba y se ve fallar contra el código actual.

Las pruebas de auditoría de cada módulo y la de concurrencia del CA-9 de F11 siguen en verde (CA-5).

## Notas de implementación

(Se completan durante la implementación.)
