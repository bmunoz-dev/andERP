# Runbook 06 — Alta de una nueva organización

Cada organización tiene sus propios datos (egresos, prestadores, credenciales…). Ninguna ve los de otra.

## Pasos

1. Entra a AndERP como **super admin** (el usuario del seed).
2. Menú **Plataforma → Organizaciones → Nueva organización**:
   - nombre y NIT de la empresa;
   - nombre, apellido y correo del **primer administrador**.
3. Al guardar, AndERP crea la organización con sus departamentos iniciales (Administrativo, Honorarios, Comercial, Jurídico, Tributario, Nómina, Gastos extras) y envía la invitación por correo.
4. El administrador abre el enlace de la invitación, define su contraseña y entra.
5. Desde **Configuración → Usuarios**, ese administrador invita al resto de su equipo, y en **Configuración → Departamentos** ajusta los departamentos.

## Si la invitación no llega

- Revisa la carpeta de spam y el registro del proveedor de correo.
- En **Configuración → Usuarios** de esa organización se puede reenviar la invitación.
- Si el correo de producción no está configurado, ver [runbook 01](01-puesta-en-marcha.md), paso 4.
