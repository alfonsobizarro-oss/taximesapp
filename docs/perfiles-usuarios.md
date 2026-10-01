# Integración de perfiles de usuario

Base: `main` en `1d64e67` (OTP y Staff Taximés). Se incorpora el trabajo de
`feature/reservas-especiales` en `d2216a9`, sin merge a main y conservando la
rama original. La integración se entrega en un único commit.

## Comportamiento

- Perfiles visibles: Administrador (`admin`), Asesor de Flota (`delegate`) y
  Asociado (`reservation`). Administrador principal (`root`) se mantiene.
  No se renombran identificadores persistidos ni textos históricos.
- Una cuenta autenticada y con email confirmado se registra en la cola de
  aprobación al consultar por primera vez el espacio: `role=pending`,
  `status=pending`. No recibe datos operativos. Los metadatos del usuario
  solo aportan el nombre, nunca permisos. No hay cambios en el flujo OTP.
- Administración puede aprobar, bloquear y asignar perfiles no administrativos.
  Solo root puede crear/cambiar administradores. Nadie puede alterar root ni
  su propio acceso desde la gestión de usuarios.
- Para activar un Asociado son obligatorias las autorizaciones Monovolumen,
  Adaptado o ambas y la vinculación a un asociado real, activo y no demo.
  Puede prepararse una cuenta pendiente sin vincularla todavía. Se permite
  bloquearla aunque su asociado del directorio haya pasado a inactivo.
- Se reutiliza `reservation.authorize` para validar y auditar la asignación.
  Al pasar a otro perfil se retiran `memberId` y `reservationTypes` de la
  cuenta, sin modificar el directorio ni el histórico de servicios.
- Asociado recibe exclusivamente reservas y avisos propios; la UI muestra
  Servicios disponibles, Mis servicios, Avisos y Mi perfil. Las acciones
  de Staff, archivos e históricos administrativos se rechazan en la API.
  Marcar avisos leídos no modifica avisos de Staff ni de otras cuentas.
  Los Asociados tampoco se ofrecen como asesores del cuadrante ni cuentan como
  cobertura de Staff si conservan turnos históricos.

## Validación local

- `pnpm typecheck`, `pnpm test`, `pnpm build`.
- La suite incluye el contrato OTP y Staff, permisos en las copias local y
  Edge, el handler real con backend simulado, concurrencia y permisos SQL
  con PostgreSQL local (PGlite), y el adaptador de correo sin envío real.
- Prueba de navegador opcional: iniciar
  `pnpm exec vite --config tests/integration-preview/vite.config.mjs` y ejecutar
  `node tests/user-profiles-browser.cjs` con Playwright/Chromium disponibles.
  `CHROME_PATH` permite seleccionar el ejecutable de Chrome. La prueba bloquea
  toda petición fuera de localhost y usa cuentas y directorio ficticios.
- Lint se compara con el mismo `main` y las mismas dependencias, contando
  incidencias por archivo, regla y mensaje (sin depender de números de línea).

## Activación futura, fuera de este trabajo

No se han aplicado migraciones remotas, cambiado Supabase de producción,
activado correos/cron, desplegado Cloudflare ni fusionado a main.

La API integrada usa `tx_load_reservations` y `tx_commit_reservations`: una
activación futura requiere revisar y aplicar primero la migración de Reservas
incluida en su rama, después del esquema de coordinación. El SQL de cron y la
función de recordatorios se conservan como código inactivo; no ejecutarlos como
parte de esta revisión. La puesta en producción queda pendiente de autorización.

Decisiones adoptadas: root conserva la gestión de administradores; el vínculo
real es obligatorio al activar Asociado; se preservan las cuentas existentes,
sus identificadores y el contenido histórico. No hay decisiones funcionales
bloqueantes pendientes. Antes de cambiar el perfil/bloquear a un asociado con
servicios asignados, Central deberá revisar sus servicios y republicarlos cuando
corresponda; el cambio de permisos no cancela ni reasigna servicios automáticamente.

## Resultado de la revisión (30/09/2026)

Typecheck, suite completa y build: correctos. Prueba real de navegador con
Chrome/Playwright: correcta (alta pendiente, aprobación, ambas autorizaciones,
vínculo real, cuatro pestañas exclusivas, vista móvil y ausencia de errores JS).
Lint: 34 errores y 12 avisos tanto en main como en integración; ninguna
incidencia añadida por archivo/regla/mensaje. Son incidencias heredadas y el
comando lint sigue devolviendo código 1. El build conserva los avisos de
clasificación estática de rutas de vinext, pero finaliza correctamente.
Los archivos de OTP, cliente/configuración Supabase, layout, manifiesto PWA y
lockfile son idénticos a main.
