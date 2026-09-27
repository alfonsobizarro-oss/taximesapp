# Taximés · Asesores Ahora, estados y sustituciones

Desarrollo local del 27 de septiembre de 2026. Rama `feature/asesores-ahora-sustituciones`, basada en el commit `8bbfa36` de `feature/cuadrante-asesores-flexible`, todavía sin integrar en main.

## Qué existía y qué se ha reutilizado

Ya existían los tramos `shifts`, minutos, varios tramos diarios, solapamientos, horarios nocturnos, cálculo de cobertura, avisos manuales, roles root/admin/delegate, autenticación Supabase, proxy y Edge Function, y control de concurrencia mediante versión del estado. La fase anterior había añadido la vista semanal móvil, formularios libres y huecos gráficos. Estaba comprobada y guardada en `8bbfa36`, con edición/eliminación propia pendiente de autorización de backend.

Esta fase reutiliza esos componentes y datos. La opción 2 autorizada añade almacenamiento separado para estados, solicitudes e histórico, siempre relacionado con los mismos shifts. No crea otro sistema de horarios, roles ni autenticación. No incorpora funciones operativas de SMARTTD.

## Funcionamiento para el Asesor

- Inicio muestra **ASESORES AHORA**, obtenido del Cuadrante: personas únicas con tramo activo, fin previsto, próximo inicio/final/cambio y cobertura actual. Horas de Barcelona, incluidas medianoche y minutos.
- Disponible, Ocupado y Ausente temporalmente se cambian con un toque durante el horario propio. Ocupado/Ausente siguen contando como cobertura. El estado deja de aplicarse fuera del horario; no existe desconexión manual. Sin declaración vigente aparece Disponible por horario: no es una comprobación física de presencia.
- **NECESITO SUSTITUTO** permite elegir un tramo propio activo, fecha/hora/minuto y motivo opcional. El motivo solo es visible para el titular y Administración.
- Otro Asesor puede aceptar. El original permanece, termina en el relevo y conserva sus límites originales. Se crea un tramo normal para el sustituto, identificado en el Cuadrante. Se conservan solicitante, momento, aceptación, titular y relación con el tramo original.
- Estados de solicitud: pending, accepted, cancelled. Las pendientes vencidas se muestran al propietario y Administración para cerrarlas; no se inventa otro estado ni se eliminan automáticamente.
- Se permiten los solapamientos que ya admite el Cuadrante; una persona cuenta una sola vez. La aceptación se hace con la cuenta propia. Dos aceptaciones concurrentes no pueden guardarse ambas.
- Si pasó la hora pedida, la aceptación comienza en el siguiente minuto completo; nunca se atribuye al sustituto un periodo anterior a su aceptación.
- **PUEDO CUBRIR** aparece en un hueco actual. Se elige el final y se crea un shift propio normal desde el siguiente minuto completo. La pantalla muestra el inicio y actualiza la cobertura al llegar ese minuto.
- **APUNTARME AL CUADRANTE** abre directamente el formulario libre. Se pueden crear varios tramos, editar los propios y eliminarlos sin aprobación administrativa. Eliminar es cancelar conservando el registro y su auditoría.
- Modificar/cancelar un tramo con una solicitud pendiente cancela esa solicitud y lo registra. Un original con relevo aceptado no puede ampliarse invadiendo la parte entregada; se gestiona el tramo sustituto o se crea uno adicional.

## Administración y seguridad

Administración/Jefes con rol root/admin pueden crear para otros Asesores, editar/cancelar cualquier tramo, solicitar/cancelar sustituciones y consultar el histórico. Aceptar una sustitución siempre compromete a quien acepta, también si es administrador; no suplanta otra cuenta. No se ha creado un rol nuevo.

El servidor obtiene la identidad de Auth y el rol del usuario almacenado, sin confiar en metadatos o campos de autorización del navegador. Comprueba estado activo, titularidad del registro original, reasignaciones, fechas, duración máxima de 24 horas y versión. Se conservan también las solicitudes antiguas de cancelación y su resolución administrativa.

Las tablas nuevas mantienen el acceso exclusivo por servidor. RLS se habilita sin añadir políticas; se revoca acceso a PUBLIC/anon/authenticated. Las funciones usan SECURITY INVOKER y ejecución solo para service_role. El histórico solo permite INSERT/SELECT al rol del servidor, sin UPDATE/DELETE. El endpoint de consulta exige Administración y pagina de 50 en 50.

## Cobertura e histórico

Se dividen los intervalos en cada inicio/final y se calcula el conjunto de Asesores activos. Un conjunto vacío es un hueco; se identifica con icono y texto además del color. No cuentan tramos cancelados ni usuarios desactivados; los horarios de estos últimos siguen visibles como tales. Los avisos manuales usan el mismo criterio.

Administración ve las próximas seis horas y pendientes. El histórico conserva antes/después, actor, fecha, creación, modificación, cancelación y relevo. La migración añade una fotografía de los shifts anteriores, sin inventar cambios históricos que no estaban registrados. El histórico duradero no utiliza el límite de 3.000 registros de la antigua lista de actividad.

Preparados los eventos substitution_requested, substitution_accepted, adviser_status_changed, coverage_gap y eventos internos de edición/cancelación. coverage_gap se registra cuando una acción de coordinación deja la cobertura actual vacía. Los huecos causados solo por el paso del reloj se calculan en pantalla: su emisión persistente con la app cerrada requeriría un proceso programado posterior. No hay integración push, WhatsApp ni servicios externos nuevos.

La cobertura temporal se recalcula en la pantalla abierta; los datos remotos se refrescan cada 20 segundos y al volver a la pestaña. Se usa la hora del servidor como referencia y se evita que una respuesta antigua sobrescriba una versión más nueva.

## Archivos

Interfaz y API:
- app/advisers-now.tsx
- app/schedule.tsx
- app/workspace.tsx
- app/globals.css
- app/api/coordination-history/route.ts

Lógica y servidor:
- lib/advisers.ts, lib/coordination.ts, lib/schedule.ts
- lib/actions.ts, lib/model.ts
- supabase/functions/taximes-api/index.ts
- supabase/functions/taximes-api/{actions,model,schedule,advisers,coordination}.ts (copias comprobadas)
- supabase/migrations/20260927111530_adviser_coordination.sql

Pruebas y documentación:
- tests/coordination.cjs, tests/coordination-db.cjs, tests/coordination-api.cjs, tests/load.cjs
- tests/schedule.cjs, tests/restrictions.cjs, tests/preview/main.tsx
- package.json, pnpm-lock.yaml (PGlite 0.5.8, solo herramienta de pruebas)
- docs/asesores-ahora-sustituciones.md y nota de continuidad en docs/cuadrante-flexible.md

## Migración preparada y aplicación futura

No se ha ejecutado nada sobre Supabase remoto. El archivo fue generado con la CLI y comprobado en PostgreSQL efímero local mediante PGlite, con los prerrequisitos de Auth/Storage simulados.

Añade tx_adviser_status, tx_substitutions y tx_coordination_events, y las funciones tx_load_coordination / tx_commit_coordination. Reutiliza tx_commit y su bloqueo/versionado; horario, solicitud, estado e histórico se guardan dentro de una sola transacción. Las solicitudes cerradas no pueden reescribirse por el flujo de guardado. Los registros antiguos omitidos de la lectura reciente no se borran.

Para activar posteriormente, con autorización independiente:
1. Revisar copia de seguridad y compatibilidad del esquema real con supabase/schema.sql en un entorno de pruebas. La migración presupone el esquema del piloto; no debe ejecutarse a ciegas ni repetirse manualmente.
2. Aplicar la migración aditiva, después actualizar la Edge Function taximes-api con sus archivos asociados.
3. Verificar con cuentas reales de prueba los permisos y la operación completa; publicar el frontend solo cuando ese recorrido esté comprobado.

Hasta disponer de la capacidad coordinationV1 anunciada por el backend, el frontend deja estados/sustituciones deshabilitados y conserva la edición/cancelación compatible con el servidor anterior. No publicar solo la Edge Function sin la migración, porque requiere las nuevas funciones SQL.

## Pruebas y resultado

- Suite previa de restricciones: pasa; incluye roles, privacidad, histórico, importación y paridad de fuentes Edge.
- Cuadrante: pasa; minutos, varios tramos, medianoche, año nuevo, días completos, solapamientos, huecos, fechas inválidas, propios/ajenos y cancelación lógica.
- Coordinación: pasa; cobertura actual/futura, hueco previo, estados y caducidad, adyacencia, solicitudes propias/admin, duplicados, motivos privados, aceptación normal/tardía/vencida, conservación del original, permisos y cobertura tras relevo. Incluye estado ocupado hasta relevo futuro y aviso de huecos con usuario inactivo.
- PostgreSQL local real (PGlite): pasa; migración sin cambios en registros anteriores, dos aceptaciones con la misma versión y solo una confirmada, rollback íntegro, permisos de tablas/RPC, histórico sin edición/borrado, más de 3.000 eventos y paginación sin duplicados.
- Handler real de Edge con backend simulado local: pasa; autenticación, correo confirmado, metadatos no usados para permisos, roles del servidor, versionado, privacidad y consulta administrativa.
- TypeScript de aplicación: pasa. TypeScript de Edge: pasa con tipos del paquete local Supabase y declaración mínima del entorno Deno; no equivale a un despliegue Deno remoto.
- Build completo: pasa. Permanecen advertencias preexistentes de paquetes grandes y clasificación estática de rutas de Vinext.
- ESLint de archivos nuevos/componentes modificados de coordinación: pasa. Lint global: 35 errores y 13 advertencias, sin diagnósticos nuevos respecto a la fase anterior (36/13). No se han ocultado reglas ni reconstruido módulos ajenos para corregir deuda previa.
- Navegador: revisión móvil 390 px, móvil pequeño 320 px y escritorio 1280 px sin desbordamiento horizontal. Botones de coordinación de al menos 48 px; español/catalán. Comprobadas solicitud, motivo privado al cambiar de Asesor, aceptación con solapamiento, histórico administrativo legible, cubrir hueco, editar inicio a 10:45, eliminar propio, ausencia de controles ajenos y compatibilidad con backend antiguo. Consola sin errores/avisos en el recorrido final desde una página nueva. Durante recargas en caliente anteriores, la prueba aislada emitió avisos de doble montaje de React; no se reprodujeron en la carga nueva y no se ha certificado ese mecanismo de recarga como parte de la aplicación.
- No se ha probado autenticación ni persistencia sobre el proyecto remoto: toda la revisión ha sido local con datos ficticios.

Entorno: Node 24.19.0, pnpm 11.25.0 disponible. El repositorio declara pnpm 11.19.0: repetir en el CI fijado antes de publicar.

## Pendientes y límites antes de producción

- Aplicar y comprobar migración/Edge/frontend en un entorno autorizado: está preparado, no activado.
- El dato horario existente sigue siendo hora local de Barcelona sin offset. No se ha cambiado el significado de los datos para distinguir la hora repetida de otoño ni duraciones físicas de 23/25 horas. Esa migración temporal requiere una decisión independiente; aquí se conserva la convención existente.
- La arquitectura del piloto continúa leyendo el estado global y tiene límite de 1,8 MB. El histórico nuevo está separado/paginado, pero no se ha cambiado ese límite ni el almacenamiento de los módulos existentes.
- El cálculo indica cobertura prevista por horario y estado declarado, no presencia física comprobada.
- Consultas a Central y Estadísticas no tienen módulos reales que se puedan enlazar; no se han inventado destinos ni backends. Se mantienen Chat, Avisos, Incidencias, Cuadrante y Documentos.
- No se han incorporado notificaciones con la aplicación cerrada, automatización externa ni clasificación/ranking de Asesores.

## Git y alcance

main permanece en `7d40a5c07fe9a05a9a07c4668fb15671d82147f8`. El Cuadrante previo está en `8bbfa36`. Los commits de esta fase se consultan con `git log main..feature/asesores-ahora-sustituciones --oneline`.

No se ha hecho push, merge ni despliegue. No se ha modificado Cloudflare ni Supabase remoto. Los cambios de backend y migración son archivos locales para revisión.
