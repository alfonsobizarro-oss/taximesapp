# Taximés — versión de prueba privada

Aplicación acordada con Alfons: unos 15 usuarios, archivos ocasionales, castellano/catalán, identidad del logo proporcionado (negro/blanco/cian/azul/magenta). Se entrega primero con datos ficticios; Excel actualizado pendiente.

## Funciones implementadas
- Directorio: flota separada de licencia, conductores, teléfonos, modelos y requerimientos. Flota identifica asociado; una venta de licencia se registra con otra flota, sin transferir incidencias.
- Importación XLSX con agrupación por flota, detección de contradicciones y duplicados de conductor, resumen antes de aplicar, conservación manual o Excel por ficha en conflicto, bajas con historial. No activar importaciones de datos reales hasta validar las columnas del nuevo archivo.
- Incidencias con categorías editables, conductor o vehículo/general, urgente con motivo, adjuntos, aportaciones sin editar el original, resolución/anulación solo administración, medidas con fechas, historial, filtros y exportación XLSX y PDF mediante impresión.
- Documentos versionados, confirmaciones de lectura, encuestas de voto único anónimo (identidades no expuestas en respuestas) o identificado, chat general y buzón privado compartido por administradores, archivos/voz en R2.
- Cuadrante semanal con horas libres, intervalos nocturnos, solapamientos permitidos, huecos exactos, mínimo 1 delegado 24/7, cancelación solicitada con aprobación, asignación y edición administrativa, aviso manual y respuestas privadas a administración.
- Registro pendiente de aprobación. Root aprueba/revoca/nombra administradores. Admin importa y modifica fichas. Permisos comprobados en servidor.
- Avisos dentro de la aplicación con actualización cada 20 s. Interfaz responsive, manifest e iconos instalables. Offline informa de falta de conexión sin cachear datos privados.

## Infraestructura de esta prueba
Supabase `nraqlebivwcgsgtveenz`, Frankfurt, organización confirmada por el propietario. Auth con correo/contraseña, PKCE, correo verificado obligatorio. Cuenta inicial reservada mediante tx_workspace.owner_email al correo del propietario obtenido del control de acceso del Site; ningún primer visitante puede hacerse root. El propietario confirma su correo y pulsa Iniciar versión de prueba. Otros usuarios solicitan acceso y esperan aprobación. Roles y estado se leen de la base en cada petición; user_metadata solo aporta nombre visible.

Sites aloja interfaz y proxy HTTP sin secretos. La Edge Function taximes-api valida el token con Auth.getUser antes de toda lectura/escritura; verify_jwt=false porque verifica explícitamente dentro de la función. Su clave de servicio nunca sale del entorno de Supabase. Las tablas tx_workspace/tx_records/tx_files tienen RLS y todos los permisos del cliente revocados; sin políticas de lectura por diseño. Funciones SQL security invoker, solo service_role. Avisos informativos del Advisor sobre ausencia de políticas son intencionados: https://supabase.com/docs/guides/database/database-linter?lint=0008_rls_enabled_no_policy . Archivos en bucket privado, sin políticas para navegador; descargas autorizadas por propietario/referencia visible.

Los registros se almacenan por entidad en tx_records, conservando el contrato del piloto. tx_commit aplica cambios en transacción con versión para impedir sobrescrituras; tx_load devuelve una instantánea coherente. Sigue siendo un piloto con lectura completa y límite de estado 1,8 MB: normalización por dominio y paginación pendientes antes de ampliar. D1/R2 anteriores se conservan, pero las rutas ya no los utilizan; no se han borrado ni migrado cambios de la prueba anterior. El nuevo espacio se inicializa con datos ficticios.

Fuentes de Edge en supabase/functions/taximes-api; model.ts/actions.ts son copias de lib que deben sincronizarse al cambiar reglas. schema.sql documenta la migración remota taximes_private_pilot. No contiene correos ni claves privadas. Clave publishable en lib/supabase-config.ts; no es un secreto. Dependencia supabase-js fijada y lockfile actualizado.

## Puesta en marcha de Auth pendiente
- Configurar Site URL y Redirect URL exactas: https://taximes-delegados.vandikop1.chatgpt.site/ . MCP no expone esta configuración; navegador requiere inicio de sesión en Supabase.
- Configurar SMTP propio antes de abrir registro a delegados: SMTP por defecto restringido a miembros de la organización. No desactivar confirmación de correo como atajo.
- Propietario debe crear personalmente su contraseña y confirmar email. No se crean cuentas ni se envían correos de prueba automáticamente.
- Validar inicio real, recuperación, aprobación de otro usuario y guardado/adjuntos desde teléfonos tras configurar Auth.

## Pendiente antes de uso real
- Excel final y reglas/códigos de requerimientos, revisión de las columnas y precisión de diferencias por campo.
- Acceso de los 15 usuarios mediante Supabase Auth y aprobación manual; configurar correos antes del registro general.
- Activar y probar push en iOS/Android y programador real para viernes 12:00 Europe/Madrid. NO se simulan: la interfaz indica pendiente y permite envío manual.
- Probar cámara/micrófono e instalación en teléfonos reales; plataforma de navegador QA solo comprobó escritorio.
- Copias/restauración de base y adjuntos, política de conservación, revisión de seguridad y capacidad antes de datos reales.
- Verificación de cambios de horario estacional en cálculos de cobertura y cierre de encuestas.

## Verificación
Compilación y TypeScript, revisión visual de escritorio, flujo de formulario y cuadrante, pruebas de dominio para autorizaciones, privacidad de mensajes/votos, correcciones, bajas con historial, turnos nocturnos/solapados y cancelación.

## Verificación de la conexión Supabase
Build y TypeScript correctos. HTTP real rechaza ausencia de token y token inválido con 401; Data API rechaza SELECT anónimo. SQL confirma permisos directos anon/authenticated revocados, RPC de escritura inaccesible a usuarios, bucket privado y CAS con conflicto de versión; prueba transaccional revertida, versión permanece 0. Interfaz de acceso revisada en navegador interno. Prueba autenticada completa pendiente del registro real y configuración de correo.

## Sanciones e incompatibilidades
Apartado propio y vista en cada ficha, consulta para todos los usuarios activos. Admin/root crean, editan y borran; comprobación de rol en apply, no solo botones ocultos. Registros en members[].restrictions (se persisten en tx_records sin cambios de esquema), separados por asociado/flota, con tipo, título/servicio afectado, motivo, inicio y fin opcional en hora de Barcelona. Estado calculado: programada, vigente, finalizada. Borrado lógico excluye a delegados y mantiene historial para admins con autor, fecha y valores previos. Edición no permite trasladar un registro a otro asociado. Las importaciones conservan los registros del asociado anterior; venta de licencia no los transfiere a la nueva flota. Se mantienen las medidas antiguas dentro de las incidencias; no se reclasifican automáticamente. No ejecuta bloqueos en la emisora.
Pruebas: node tests/restrictions.cjs comprueba permisos, fechas, edición, borrado, privacidad del historial, bajas/importación, venta y sincronización de las reglas con Edge.
