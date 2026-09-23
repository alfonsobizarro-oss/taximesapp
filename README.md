# Taximés · Delegados

Código de la aplicación interna actual. Interfaz React 19 con rutas compatibles con Next.js, compiladas mediante Vinext y Vite para Cloudflare Workers. Supabase gestiona la autenticación, los datos y los archivos privados.

## Requisitos e instalación

- Node.js 24 LTS (`.nvmrc`).
- pnpm 11.19.0, la versión probada y fijada en `package.json`.

```sh
npm install --global pnpm@11.19.0
pnpm install --frozen-lockfile
pnpm dev
```

Abrir http://localhost:5173. El acceso requiere una cuenta real de Supabase confirmada y autorizada. No existe una contraseña de demostración ni un acceso automático como administrador.

## Verificación y arranque de la compilación

```sh
pnpm typecheck
pnpm test
pnpm build
pnpm start
```

`pnpm start` ejecuta localmente el Worker compilado en http://localhost:5173. Detener antes `pnpm dev`, pues usan el mismo puerto. El build genera `dist/`, que no se debe versionar.

## Estructura

- `app/`: pantallas, autenticación y rutas API.
- `components/`, `hooks/`: componentes reutilizables.
- `lib/`: modelo, permisos, acciones y clientes/proxy de Supabase.
- `public/`: logo, iconos y archivos de la PWA.
- `supabase/schema.sql`: esquema SQL existente, sin datos ni contraseñas.
- `supabase/functions/taximes-api/`: backend con validación de usuario y permisos.
- `tests/`: pruebas existentes de permisos y restricciones.
- `scripts/prepare-cloudflare.mjs`: configuración de despliegue generada por el build.
- `docs/`: historial y resultados de consolidación.

Se conservan `db/`, `drizzle/`, `build/`, `.openai/`, `app/chatgpt-auth.ts`, `lib/server.ts` y los scripts antiguos de instalación para mantener el historial técnico. Corresponden al alojamiento anterior y no se utilizan en el nuevo flujo normal de desarrollo o publicación. No ejecutar sus migraciones sobre Supabase.

`scripts/sites-env.mjs` sigue utilizándose al arrancar el Worker: configura rutas temporales locales y desactiva la telemetría; no requiere una cuenta de Sites.

## Supabase y secretos

`lib/supabase-config.ts` conserva únicamente la URL del proyecto y una clave **publishable**, destinada al navegador. La clave privada `service_role` no está en este proyecto: el backend remoto la obtiene de su entorno de Supabase.

No añadir `.env`, `.dev.vars`, tokens, contraseñas, exportaciones de asociados ni copias de bases de datos. `.gitignore` los excluye. El SQL no debe aplicarse de nuevo al proyecto existente sin revisar su estado; esta consolidación no ejecuta migraciones ni despliega la Edge Function.

La función comprueba el token del usuario y aplica los permisos en servidor. Los archivos de acciones y modelo del backend son copias de `lib/`; las pruebas existentes verifican que coincidan.

## Estado de la aplicación

Se conservan las funcionalidades existentes, incluidas las restricciones ya implementadas. No se han añadido funciones en esta consolidación.

El arranque local no certifica un recorrido autenticado completo. Quedan por verificar con cuentas reales: alta, correo de confirmación, recuperación, aprobación y acceso de administradores/delegados. SMTP y URLs autorizadas de Supabase deben revisarse cuando se elija la URL definitiva.

## Publicación posterior, fuera del alcance de esta tarea

Consultar `CLOUDFLARE.md`. No se publica automáticamente al ejecutar pruebas o compilar. Una integración externa de Cloudflare conectada a `main` puede iniciar su propio despliegue al subir commits; revisar su configuración antes de integrar cambios.
