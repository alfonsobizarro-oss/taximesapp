# Reservas Especiales — revisión previa a activación

Base histórica: implementado localmente en `feature/reservas-especiales`, partiendo de `main` / `origin/main` en `f7b968a5a31d5faadb0e87d5159545c9a0972ea5` tras `git fetch origin` el 29/09/2026. El árbol inicial estaba limpio en `fix/registro-email`. Las ramas locales `fix/registro-email` (`e50238e`) y `fix/staff-taximes-ui` (`0ab2267`) todavía no estaban fusionadas en main; no se han mezclado en esta rama. No se han hecho push, merge, cambios remotos ni despliegues.

## Arquitectura inspeccionada

- Auth de Supabase identifica la cuenta y exige correo confirmado. `users` dentro de `tx_records` contiene el rol y estado de acceso leídos de servidor en cada petición. `user_metadata` se usa solo para nombre visible.
- `members` es el directorio importado de flota, vehículos y conductores; no es una tabla de cuentas Auth. Sus requisitos/compatibilidades no equivalen a autorización de acceso. Se añade `memberId` a la cuenta autorizada, sin duplicar ese directorio ni SMARTTD.
- Roles existentes: root/admin/delegate. El rol `reservation` restringe la cuenta al módulo. Central (root y admin) puede asignarlo a cuentas no administrativas, vincular asociado activo y conceder MONOVOLUMEN, ADAPTADO o ambas. No puede autoelevarse ni convertir un administrador por esta acción. El flujo root existente puede restaurar otro rol deliberadamente.
- Interfaz → proxy Next → Edge `taximes-api` → funciones SQL invoker con acceso exclusivo service_role. Se conserva ese modelo: RLS activado sin políticas nuevas para navegador; permisos de anon/authenticated revocados. Sin cambios en Storage.
- Se reutiliza el bloqueo de fila y versión de `tx_commit` a través de `tx_commit_coordination`. No se crea un mecanismo paralelo de asignación ni una operación de aceptación confiada al cliente.

## Comportamiento

Administración puede crear, editar, publicar, cancelar con motivo, republicar y marcar realizado. Datos: instante UTC (formulario y calendario en Europe/Madrid), recogida, destino, tipo, observaciones, abonado/particular opcional, requisitos y pasajeros opcionales (1–9). No se añaden nombres ni contactos de pasajeros; los textos libres recuerdan evitar datos personales/médicos.

Una reserva Pendiente puede ser borrador o estar publicada/DISPONIBLE. Solo la publicada y futura puede aceptarse. La aceptación exige segunda confirmación y autorización vigente del tipo, cuenta activa y asociado activo. El servidor registra asignado/aceptado por y fecha; la transacción rechaza la versión perdedora si dos asociados aceptan a la vez.

CONFIRMADO, PENDIENTE DE CONFIRMACIÓN y MODIFICADO · PENDIENTE DE RECONFIRMACIÓN son estados de confirmación separados del estado administrativo. Editar una reserva asignada conserva su asociado y fecha de aceptación. Cambios en fecha/hora, recogida, destino, tipo, requisitos, pasajeros o abonado/particular invalidan la confirmación y exigen CONFIRMAR CAMBIO. Las correcciones menores de observaciones conservan la confirmación; Central debe marcar la opción de reconfirmación si esas observaciones cambian la realización. Todos los cambios reales generan auditoría antes/después y un aviso interno propio. Guardar sin cambios no genera revisión, auditoría, aviso ni correo nuevos. `No puedo realizarlo` exige motivo, mantiene la asignación y alerta a Central; solo Central puede republicar o cancelar. Los servicios realizados no se reabren. Realizada y Cancelada bloquean la edición tanto en UI como en servidor. Republicar sigue siendo una acción explícita y auditada de Central; para una cancelada cuya fecha ya pasó se debe crear una nueva reserva. Un cambio a un tipo para el que el asociado asignado no tenga autorización se rechaza antes de mutar datos y pide republicar/reasignar.

Las cuentas de reservas reciben solo Servicios disponibles, Mis servicios, Avisos y Mi perfil. La respuesta de estado usa una lista explícita de campos/colecciones; no contiene directorio, incidencias, cuadrante, chat, documentos, encuestas ni auditoría. API de archivos e históricos rechazada. Acciones fuera de reservas y lectura de avisos rechazadas. Las asignaciones propias anteriores siguen visibles para seguimiento aunque Central retire una autorización; no permiten aceptar nuevos servicios ni confirmarlos sin autorización.

Hay calendario semanal y mensual, selección de día y filtro por estado. En móvil el mes muestra días y número de servicios, con detalle de estados al seleccionar el día; la semana muestra los estados completos. Diálogos accesibles con foco y Escape. La vista está preparada en español; no se incluye traducción catalana de este módulo en esta entrega.

La auditoría separada conserva antes/después, actor e instante de publicar, aceptar, confirmar, renunciar, republicar, cancelar, completar, editar y autorizar. Solo append/select para service_role y consulta paginada para Administración. La interfaz permite revisar los datos antes/después.

## Migración y funciones

Migración base: `supabase/migrations/20260929152057_reservas_especiales.sql`, creado con Supabase CLI y verificado en PostgreSQL local (PGlite). Depende del esquema base y de `20260927111530_adviser_coordination.sql`; comprobar su presencia real antes de activar. Crea `tx_reservations`, `tx_reservation_events`, `tx_reservation_mail`, `tx_load_reservations`, `tx_commit_reservations` y `tx_claim_reservation_mail`. No borra ni reescribe el esquema anterior ni altera políticas existentes. La migración adicional `20261001160059_reservation_changes.sql`, creada con CLI, añade `kind` y `context` a la cola y reemplaza las funciones de carga/commit. Mantiene RLS, permisos exclusivos de service_role y las funciones invoker. Se valida aplicando toda la cadena en PostgreSQL local (PGlite); no se ha aplicado en remoto ni se han ejecutado advisors remotos.

`taximes-api` anuncia `reservationChangesV1` en esta versión, además de `reservationsV1`. La pantalla de Reservas Especiales (Administración y Asociado) exige la capacidad nueva para habilitar escrituras. Se restituye el renderizado del módulo en la sección de Administración, cuyo menú estaba presente pero no mostraba contenido en la base de integración. La interfaz deshabilita las escrituras si el backend no anuncia soporte. El nuevo backend requiere la migración; no desplegarlo antes de revisarla y aplicarla en un entorno de prueba. No regresar al backend antiguo dejando cuentas `reservation` activas: su código antiguo no conoce esta restricción. Para rollback, mantener el backend con controles nuevos y deshabilitar el módulo; una reversión completa exige revisar/bloquear antes esas cuentas.

## Correo: implementado, no activado

La inspección del repositorio y su documentación encontró correo de Supabase Auth, sin proveedor operativo ni scheduler para reservas. No se ha leído ni modificado SMTP privado ni se presupone que sirva para correo de negocio. El adaptador nuevo usa Resend explícitamente, pendiente de revisión/aprobación del proveedor. No se ha enviado ningún correo real.

La misma transacción de asignación genera un aviso interno propio y un correo de tipo `assignment` listo de inmediato. Si hay al menos 24 horas de margen también crea `reminder` con vencimiento `start - 24 hours`; si hay menos, solo necesita el aviso/correo inmediato de asignación. No se crea un recordatorio retrospectivo imposible.

Una edición real asignada crea correo `change` inmediato, independiente del recordatorio. Incluye instantánea del cambio, campos anteriores → nuevos y si exige reconfirmación. Una edición menor mantiene `confirmedAt` y `reminderRevision`, por lo que no reenvía el recordatorio ya enviado. Una relevante pone `confirmedAt=null`, `reconfirmationRequired=true`, actualiza `reminderRevision` y reprograma el recordatorio solo si quedan al menos 24 horas. La confirmación exige la revisión exacta que vio el asociado: refrescar el estado global mientras un diálogo antiguo sigue abierto no permite confirmar condiciones antiguas.

Cola única por reserva/revisión/tipo (los identificadores antiguos de recordatorio se mantienen). La revisión de asignación identifica el período de titularidad, para que una republicación/reasignación invalide correos anteriores incluso si vuelve al mismo asociado. Los cambios sucesivos conservan sus propios avisos fechados y apuntan siempre al estado actual de la app. Cancelación, republicación o retirada de permisos vuelven obsoletos los trabajos pendientes correspondientes. La renuncia detiene asignaciones/recordatorios pendientes, pero admite avisar de modificaciones mientras Central decide. Los cambios de servicios ya iniciados siguen siendo notificables y reconfirmables mientras estén asignados y no haya renuncia; los recordatorios/asignaciones vencen al inicio. Un correo ya en vuelo no puede retirarse; se mantiene la comprobación de estado previa al envío.

`reservation-reminders` reclama un trabajo con lease de cinco minutos. Verifica reserva y permisos actuales; obtiene el correo confirmado desde Auth Admin y persiste el mensaje antes de enviarlo. Los recordatorios y las asignaciones incluyen tipo, hora y enlace a la app. El correo de modificación incluye los campos operativos que cambiaron, incluidos recogida/destino si procede, con antes → después. Es texto plano, con hora Europe/Madrid y enlace a la app; no incluye credenciales ni enlaces de confirmación automática. Mantener la advertencia de no introducir datos personales/médicos en campos libres. La clave Resend es estable por trabajo y el payload se mantiene idéntico en reintentos. Un fallo tras enviar y antes de guardar recibo se reintenta con la misma clave. Tras 23 horas desde el primer intento ambiguo se exige revisión, para no reintentar fuera de la ventana de deduplicación de Resend de 24 horas. `sent` significa aceptado por el proveedor, no entrega en bandeja; no hay webhook de rebotes en esta fase.

Estados de cola visibles a Administración: pending, sending, sent, obsolete, review. Los trabajos en review requieren comprobar el recibo en el proveedor antes de cualquier intervención; no hay botón de reenvío que pueda duplicar un correo incierto. El proceso consume un trabajo por ejecución; programación sugerida cada minuto (latencia habitual de hasta un minuto, mayor si hay cola). Antes de ampliar volumen, dimensionar el procesamiento y alertas. Un cambio concurrente después de la última comprobación y durante una llamada al proveedor puede dejar un aviso ya en vuelo; el mensaje siempre exige revisar el estado actual en la app.

Preparado `docs/reservas-especiales-cron.sql` como plantilla manual para pg_cron + pg_net + Vault. NO es migración ni se ha ejecutado. Requiere secretos revisados y proveedor listo:

- `RESERVATION_CRON_SECRET`: token aleatorio independiente, compartido únicamente por scheduler y función.
- `RESEND_API_KEY`: clave privada del proveedor.
- `RESERVATION_EMAIL_FROM`: remitente de dominio verificado.
- `RESERVATION_APP_URL`: URL HTTPS canónica de la aplicación.

Configurar invocación de `reservation-reminders` sin verificación JWT de gateway, ya que exige su propio token de scheduler; `taximes-api` mantiene su verificación explícita con Auth.getUser. Probar que GET retorna 405, token incorrecto 401 y configuración ausente 503. Nunca exponer service_role ni estos secretos en la interfaz. No activar cron hasta completar una prueba de envío autorizada y revisar el recibo. Push queda fuera de esta fase.

## Validación local

- Typecheck TypeScript: pasa.
- Deno check: pasa en las dos funciones Edge, incluyendo imports npm fijados de Supabase.
- Suite completa existente y nueva: pasa. Incluye dos aceptaciones concurrentes reales contra PostgreSQL local, un solo ganador, rollback de auditoría inválida, permisos anon/authenticated, auditoría inmutable, idempotencia de cola, claims concurrentes, recuperación de lease, expiración segura y renuncia sin desasignar.
- Handler Edge real con backend simulado: autenticación, correo confirmado, metadatos sin autoridad, roles actuales, acceso restringido, archivos e históricos bloqueados.
- Adaptador de correo con proveedor simulado: fallo de confirmación de base tras envío produce el mismo payload y clave al reintentar; no se llama a Resend en las pruebas.
- Compilación de producción: pasa; advertencias de tamaño de bundles y clasificación de rutas del framework.
- Lint de todos los archivos nuevos: pasa. Lint global conserva errores preexistentes de tipos `any`, imports CommonJS y efectos React; comparar con main. No se ha hecho una limpieza ajena al módulo.
- Navegador local con datos ficticios: selección MONOVOLUMEN, aceptación con segunda confirmación, Mis servicios, confirmación, motivo de renuncia y asignación retenida. Calendario mensual revisado en viewport móvil efectivo de 325 px sin desbordamiento horizontal, además de revisión de escritorio. No se ha probado contra producción.

## Pendiente antes de producción

1. Revisar esta rama y decidir por separado la incorporación de registro/Staff Taximés cuando estén fusionados.
2. Comparar esquema remoto con el esquema base y la cadena completa de migraciones. Revisar migración, grants, funciones y asesor de seguridad en entorno de prueba. Esta entrega no certifica el esquema remoto ni ejecuta advisors remotos.
3. Aprobar/aplicar migración en pruebas, desplegar allí el backend nuevo, comprobar dos cuentas reales con autorizaciones diferentes y aceptación concurrente. Autorizar cuentas de reservas únicamente después de actualizar el backend.
4. Aprobar proveedor y configurar dominio/remitente/secretos; probar envío real, fallo ambiguo, reintento, cambio de fecha, cancelación y revisión manual. Activar scheduler revisado después.
5. Revisar volumen/retención: se conserva el estado agregado del piloto y su límite de tamaño (1,8 MB), con reservas cargadas completas. Antes de uso masivo, paginar lecturas y sacar mutaciones de reservas del snapshot global. El histórico persistente ya se pagina.
6. Revisar interfaz con Central, traducción catalana si se necesita y política de conservación de datos. Push y confirmaciones por email con enlaces firmados no están implementados: la confirmación requiere iniciar sesión en la app.
7. Solo tras confirmación explícita: push/PR, merge y despliegue. Nada de ello se ha realizado.

Fuentes técnicas consultadas: [Funciones y permisos SQL](https://supabase.com/docs/guides/database/functions), [programar Edge Functions](https://supabase.com/docs/guides/functions/schedule-functions), [idempotencia Resend](https://resend.com/docs/dashboard/emails/idempotency-keys), [cambio Postgres 15.19/17.11](https://supabase.com/changelog/postgres-15-19-17-11-breaking-changes). La migración no utiliza ltree, btree_gist, cifrado pgcrypto ni operadores personalizados afectados por ese cambio.

## Revisión de cambios de reservas — 01/10/2026

Trabajo local en `integration/perfiles-reservas-cambios`, creada exactamente desde `integration/perfiles-usuarios` / `8e441372dbd77a4973726a33d73befb5e22a6282`, verificados existencia y árbol limpio. Sin push, merge, despliegue, migraciones remotas, secretos ni activación de proveedor/cron. OTP y Staff Taximés conservan su implementación y pruebas; el único ajuste de integración de pantalla conecta Reservas Especiales y su nueva capacidad de servidor.

Antes de activar: revisar/aplicar la migración en un entorno autorizado, actualizar Edge/API e interfaz compatibles y revisar los correos con Central. El worker reutiliza proveedor, secretos y scheduler existentes como preparación; no añade ni ejecuta configuración de envío. La entrega `sent` sigue significando aceptación por proveedor, no recepción en bandeja. El histórico de trabajos ya existentes mantiene la semántica de recordatorio; no se inventan asignaciones o cambios históricos al migrar.

Pruebas añadidas: edición asignada conserva titularidad; matriz de campos operativos; corrección menor; observaciones operativas explícitas; tipo incompatible sin mutación; canceladas/realizadas bloqueadas; confirmación obsoleta rechazada; no-op y reintentos sin duplicar aviso/auditoría/cola; cambios en <24h; programación 24h; caducidad y arrendamientos concurrentes; rollback completo; mensajes antes → después y proveedor simulado con payload y clave inmutables. La suite API ejerce también las restricciones de Asociado y los cambios mediante el handler autenticado real con backend simulado.

Validación final de esta revisión: `pnpm typecheck`, `pnpm test`, `pnpm build` y `deno check` de ambas funciones Edge pasan. Lint se ha ejecutado contra esta rama y la referencia local `origin/main` (`1d64e670d9431d4c11ab32158735d3e3db63564d`): 34 errores y 12 advertencias en ambos, sin diferencias por archivo/regla/mensaje/severidad. No se ha actualizado esa referencia remota mediante fetch. Build conserva los avisos conocidos de bundles y clasificación de rutas de Vinext.

Prueba de navegador local con proveedor/backend ficticios: Administración abre la sección y edita una reserva asignada; corrección de observaciones mantiene CONFIRMADO; nueva recogida conserva asociado y muestra MODIFICADO · PENDIENTE DE RECONFIRMACIÓN; cambio a ADAPTADO incompatible se rechaza con explicación; Asociado ve únicamente su área, los avisos correspondientes y CONFIRMAR CAMBIO; al confirmar vuelve a CONFIRMADO. El formulario conserva el instante original (incluidos segundos) cuando no se modifica la hora visible, evitando convertir una corrección menor en un cambio de horario. El servidor de prueba admite `TAXIMES_PREVIEW_PORT` para aislarlo de otras previsualizaciones locales; su Auth ficticio usa el mismo origen y la CSP solo admite conexiones propias/locales. No se han enviado correos reales.
