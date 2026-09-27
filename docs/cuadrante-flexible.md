# Cuadrante flexible: avance local y límite de backend

> Informe histórico del commit 8bbfa36. La fase posterior autorizada resuelve localmente la edición/eliminación propia y añade estados/sustituciones. Véase [Asesores Ahora](asesores-ahora-sustituciones.md). El backend remoto sigue pendiente de actualización autorizada.

Rama: `feature/cuadrante-asesores-flexible`.
Base: `7d40a5c07fe9a05a9a07c4668fb15671d82147f8`.

## Alcance implementado

La aplicación ya almacenaba tramos con inicio y fin, admitía minutos, varios tramos por persona, cruce de medianoche, avisos de cobertura y auditoría de acciones. El backend permite editar únicamente a root/admin y exige aprobación administrativa para las cancelaciones.

Se reutilizan esos datos, roles, acciones, autenticación, control de versiones y proxy hacia la Edge Function. No se han cambiado lib/actions.ts, lib/model.ts, la Edge Function, el esquema, RLS ni configuración de Cloudflare.

La nueva interfaz ofrece:

- Botones grandes APUNTARME AL CUADRANTE y CONFIRMAR HORARIO.
- Día y horas libres, sin un turno predeterminado; precisión de minutos.
- Varios tramos diarios y casilla explícita para terminar al día siguiente, hasta 24 horas.
- Resumen semanal de siete días con duración sin cobertura por día.
- Detalle diario cronológico: nombres de Asesores, coincidencias y huecos SIN ASESOR, con iconos y texto además de color.
- Acceso Cubrir desde cada hueco, que propone sus límites editables.
- Detalle de los tramos propios y ajenos; edición por Administración.
- Conservación de las solicitudes y decisiones de cancelación existentes, y de los avisos/respuestas de cobertura.
- Español y catalán, respetando la identidad visual existente.

## Límite importante: el objetivo completo sigue pendiente

El Asesor puede crear sus horarios, pero todavía NO puede editar ni eliminar directamente sus tramos. El servidor actual lo impide. Se muestra la limitación y se conserva el proceso de solicitud de cancelación. No se ha simulado un éxito ni utilizado una operación privilegiada desde el navegador.

Administración puede editar cualquier tramo activo y aprobar o rechazar cancelaciones. La eliminación directa tampoco existe como acción en el backend. Los Jefes de Servicio deben tener el rol administrativo existente; no se ha inventado un nuevo rol.

Para completar el objetivo será necesario autorizar un cambio local en lib/actions.ts y su copia de la Edge Function, seguido de un despliegue remoto separado y expresamente autorizado:

1. En shift.edit, comprobar al propietario del registro original; permitir al propio Asesor o root/admin. Un Asesor no podrá reasignar userId ni editar horarios ajenos.
2. Incorporar una cancelación directa autorizada para propietario/root/admin, conservando el registro con estado cancelled en vez de borrarlo.
3. Conservar autor, fecha y valores anteriores para reconstruir modificaciones y cancelaciones; definir cómo tratar solicitudes de cancelación anteriores.
4. Validar fechas/horas y duración también en servidor; mantener bloqueo de usuarios inactivos y control de concurrencia por versión.
5. Añadir pruebas de servidor de edición propia, cancelación directa, rechazo de reasignaciones y registros ajenos.
6. Habilitar las nuevas acciones en la interfaz solo junto con un backend compatible.

No se requiere necesariamente una tabla nueva para el cuadrante básico: los tramos ya existen en el estado de la aplicación. Esta nota no autoriza migraciones ni despliegues.

## Cálculo de cobertura

Cada día se divide en los instantes de inicio y fin de sus tramos, recortados a 00:00–24:00. Cada intervalo enumera los usuarios únicos que lo cubren; si no hay ninguno, es un hueco. Los solapamientos de una misma persona no cuentan como dos Asesores. Los tramos cancelados se excluyen; los pendientes de cancelación siguen cubriendo, según la regla actual del backend.

Se conserva la convención existente de horas locales de Barcelona sin zona en el dato y semana de 10.080 minutos. No se ha migrado el significado de los horarios en cambios de hora. Si se necesitan duraciones físicas de 23/25 horas o distinguir la hora repetida de otoño, se necesita una decisión de datos independiente.

## Validación

- Pruebas existentes de restricciones: correctas, incluida la igualdad entre las copias locales y de Edge Function.
- Nuevas pruebas de cuadrante: minutos, varios tramos, medianoche, año nuevo, intervalos adyacentes, solapamientos, usuarios únicos, cancelaciones, fechas inválidas, permisos y auditoría actual.
- Consistencia de huecos diarios frente al cálculo semanal existente y ejecución en zonas UTC, Madrid y Los Ángeles.
- TypeScript sin emisión y compilación completa de la aplicación.
- Revisión en navegador de una vista aislada a 390 y 320 px, sin desbordamiento horizontal; revisión de escritorio a 1280 px y textos en catalán.
- Interacciones locales: alta 07:30–11:00, solicitud de cancelación propia, ausencia de controles ajenos para Asesor, aprobación administrativa y edición de un horario ajeno hasta 16:15.
- Sin errores ni advertencias de consola durante esa revisión.
- Los archivos nuevos pasan ESLint. El análisis global mantiene 36 errores y 13 advertencias preexistentes; comparación contra main sin diagnósticos nuevos. No se cambió configuración para ocultarlos.
- La compilación advierte de paquetes grandes y clasificación estática de rutas de Vinext; no impide compilar.

No se certifica un recorrido autenticado remoto: la prueba visual usa datos ficticios y el mismo reductor de acciones en memoria, sin solicitudes a Supabase. Las pruebas confirman explícitamente que la edición propia y la eliminación directa aún son rechazadas por el backend actual.

Entorno de comprobación: Node 24.19.0 y pnpm 11.25.0 disponible en la sesión, dependencias del lockfile congelado. El proyecto declara pnpm 11.19.0; conviene repetir en el entorno de CI fijado antes de publicar.

## Repetir la revisión local

Desde la raíz del repositorio:

```sh
pnpm test
pnpm exec tsc --noEmit --incremental false
pnpm build
pnpm exec vite --config tests/preview/vite.config.mjs
```

La última orden sirve únicamente la prueba en http://127.0.0.1:4174/. Permite alternar Asesor/Administración y español/catalán. No es una ruta de producción, no importa el cliente de autenticación y no persiste datos. Detener con Ctrl+C.

## Archivos

- app/schedule.tsx: interfaz y formularios del cuadrante.
- lib/schedule.ts: intervalos diarios, validación local y controles compatibles con el backend.
- app/workspace.tsx: integración y retirada del formulario anterior del cuadrante.
- app/globals.css: estilos acotados al módulo.
- tests/schedule.cjs y package.json: ejecución de las pruebas nuevas junto a las existentes.
- tests/preview/: vista aislada para revisión visual.
- docs/cuadrante-flexible.md: este informe y requisitos pendientes.

No se ha hecho push, merge, despliegue ni cambios en Supabase remoto o Cloudflare. main se conserva en su commit inicial.
