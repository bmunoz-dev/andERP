---
paths:
  - "apps/api/src/**"
  - "apps/web/src/**"
  - "packages/shared/src/**"
---

# Seguridad y secretos

- La organización activa sale de la sesión. Un `organization_id` enviado por el cliente nunca se usa sin validarlo contra las membresías del usuario. Cada módulo tiene una prueba de que una organización no ve ni toca datos de otra.
- Contraseñas con argon2id; tokens solo como hash. Ningún secreto aparece en logs ni en respuestas (constitución VII).
- No debilites permisos, validaciones, restricciones ni aislamiento para que pase una prueba.
- Las credenciales del seed están en `apps/api/.env` (`SEED_SUPERADMIN_EMAIL`, `SEED_SUPERADMIN_PASSWORD`). No copies sus valores al chat ni a documentos versionados; indica el archivo.
