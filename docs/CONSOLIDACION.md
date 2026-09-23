# Consolidación — 22 de septiembre de 2026

## Origen y protección del trabajo

Origen: proyecto actual Taximés · Delegados, commit `cc27a54735706bb45b24cde07e5036a16b397f01`. Se exportaron los archivos versionados a una copia independiente. No se modificó el proyecto alojado ni se publicaron cambios en Cloudflare o Supabase.

GitHub `alfonsobizarro-oss/taximesapp` conserva únicamente el README inicial. Se inspeccionó antes de cualquier intento de escritura y se incluyó una copia de ese README en `docs/README-original-github.md`. El intento de crear un objeto de archivo devolvió HTTP 403 `Resource not accessible by integration`. No se creó ningún commit ni se cambió ninguna rama.

## Cambios preparados

- Nombre de paquete Taximés y comandos portables de desarrollo, compilación, comprobación y arranque.
- Node 24 y pnpm 11.19.0 (versión efectivamente probada).
- Vite/Cloudflare sin dependencia del plugin de Sites ni bindings de D1/R2 del alojamiento anterior.
- Generación de configuración Worker `taximesapp` en cada build.
- Arranque del Worker con inspector desactivado y ajustes locales del entorno. El primer arranque con inspector por defecto falló al enumerar interfaces en este entorno; la configuración final pasó la prueba HTTP.
- `.gitignore` ampliado para secretos, datos personales y artefactos temporales.
- README, instrucciones futuras de Cloudflare e historial conservado.
- Lockfile y lógica funcional sin cambios. No se añadieron funcionalidades.

## Verificación realizada

- Instalación en copia limpia, sin `node_modules`: `pnpm install --frozen-lockfile --offline`, correcta, 715 paquetes restaurados de la caché disponible. No certifica una descarga desde cero con un registro externo ni una máquina distinta.
- `pnpm typecheck`: correcto.
- `pnpm test`: correctas las pruebas existentes de permisos, restricciones, auditoría, importación e identidad por flota.
- `pnpm build`: correcto. Advertencia no bloqueante sobre tamaño de un chunk; se conserva la dependencia Excel existente.
- `pnpm dev`: respuesta HTTP 200 de `/`, con Taximés en el contenido.
- `pnpm start`: Worker compilado responde HTTP 200 en `/` y manifiesto PWA.
- `/api/state` sin autenticación: HTTP 401. `/api/files` con GET: 405 (método no implementado).
- Revisión de patrones de claves privadas, tokens GitHub, claves Supabase secret y JWT: sin coincidencias en los archivos incluidos. La clave publishable se conserva por ser configuración pública del cliente.

No se ha realizado un recorrido visual completo ni una prueba autenticada con cuentas reales. No se han ejecutado migraciones, modificado usuarios o revisado SMTP remoto en esta tarea.

## Pendiente y siguiente paso

1. Resolver el permiso de escritura de la integración GitHub para este repositorio, o subir esta copia mediante una sesión del propietario con permisos.
2. Volver a leer la rama remota y comparar cambios antes de subir. Preferir una rama de consolidación para revisión, evitando activar accidentalmente el despliegue automático de `main`.
3. Publicar el código fuente excluyendo `dist/`, dependencias y archivos temporales. Integrar manteniendo el historial remoto.
4. Clonar el commit resultante y repetir instalación, compilación y arranque desde GitHub.
5. Solo en una tarea posterior: configurar Cloudflare y verificar registro, correo, aprobación y roles con cuentas reales.
