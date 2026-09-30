> Nota de integración: en `integration/registro-otp-staff-taximes` se conserva el flujo OTP, pero se excluye `supabase/templates/confirm-signup.html` por instrucción expresa. Este informe describe la propuesta original; ninguna plantilla ni configuración de correo se aplica en esta integración. Su revisión y cualquier prueba de entrega quedan pendientes de autorización.

# Registro por código de correo · Taximés

## Estado y diagnóstico

Preparado en `fix/registro-email`, partiendo de `main` / `origin/main` en `f7b968a`. Antes de modificar archivos se ejecutó `git fetch origin`, se comprobó que el árbol estaba limpio y que ambas referencias coincidían. No se ha hecho merge, push ni despliegue ni se ha modificado la configuración remota.

El flujo anterior usaba `signUp` con contraseña y redirección a `/`, con PKCE. Solo mostraba una indicación para abrir el correo: no había pantalla OTP ni reenvío de confirmación. El endpoint público de Auth del proyecto `nraqlebivwcgsgtveenz` confirmó `disable_signup: false`, proveedor email habilitado y `mailer_autoconfirm: false`.

En la consulta de logs de las últimas 24 horas realizada el 28/09/2026 aparecieron 4 errores `429: email rate limit exceeded`, 5 `One-time token not found` y 4 `email link has expired`. Son compatibles con consumo anticipado por escáneres, pero no prueban por sí solos la causa. No se ha leído la plantilla remota ni la configuración privada de SMTP, caducidad, longitud OTP y cuotas.

## Cambios preparados

- Se mantiene el alta con contraseña. Tras registrarse, el usuario introduce correo y código. Se confirma mediante `verifyOtp({email, token, type: 'email'})`, solo al enviar el formulario.
- El correo usa `{{ .Token }}` y un enlace neutro a `{{ .SiteURL }}/?confirm=email`. No contiene `ConfirmationURL`, `TokenHash` ni un token en la URL. Abrirlo o recargarlo no verifica ni envía nada.
- La confirmación acepta códigos numéricos de 6 a 10 dígitos, conserva ceros iniciales y funciona sin depender del navegador que inició el alta.
- Hay acceso directo a la confirmación desde el inicio de sesión. Un login con `email_not_confirmed` y los enlaces antiguos con errores de expiración llevan a esa pantalla, sin reenvíos automáticos.
- El reenvío usa `auth.resend({type: 'signup', email})`; no crea otra cuenta ni inicia un login sin contraseña. El correo sigue siendo editable para corregir errores o continuar en otro dispositivo.
- Bloqueo de peticiones simultáneas y espera local de 60 segundos entre correos, persistida entre recargas y compartida entre pestañas. Los errores 429 activan esa espera y explican que la cuota real del proveedor puede tardar más en recuperarse. El control local mejora la experiencia; los límites efectivos los impone Supabase.
- Mensajes en español y catalán para código inválido/caducado, registro pendiente, correo y límites. No se guardan contraseñas ni códigos en almacenamiento o URL.
- Se conserva la sesión y recuperación de contraseña existentes. El backend sigue exigiendo correo confirmado y aprobación administrativa; no se cambian roles, permisos, tablas ni políticas.

## Configuración pendiente: necesaria para completar la solución

La nueva interfaz por sí sola no cambia los correos que Supabase envía. Antes de activar este flujo para usuarios:

1. Guardar una copia de la plantilla actual **Authentication → Email Templates → Confirm sign up** y revisar la configuración actual de SMTP/cuotas.
2. Preparar allí el contenido de `supabase/templates/confirm-signup.html`, con asunto «Confirma tu correo · Taximés». No editar la plantilla Magic Link: este flujo usa alta con contraseña y reenvío de signup.
3. Revisar Site URL: `https://taximesapp.taximes.workers.dev` (sin barra final para esta plantilla). Mantener las URLs autorizadas que necesite la recuperación de contraseña. Comprobar confirmación de email habilitada, longitud OTP entre 6 y 10 dígitos, caducidad adecuada y frecuencia real entre envíos. No desactivar la confirmación para sortear el fallo.
4. Comprobar SMTP personalizado, destinatarios permitidos y límites del proveedor. Una pausa en la interfaz no elimina una cuota horaria agotada. Desactivar seguimiento de enlaces del proveedor si afecta a los otros correos de autenticación.
5. Tras revisión y autorización de publicación, coordinar despliegue de la aplicación y cambio de plantilla en una ventana breve; pedir recarga a usuarios con una versión anterior abierta. Conservar copias para revertir aplicación y plantilla juntas si fuera necesario. No publicar la plantilla OTP sola: la versión anterior no tiene campo de código.

## Verificación

- `pnpm test`: suite existente (permisos, horarios, coordinación, PostgreSQL local y API) más la nueva prueba OTP con el SDK instalado y transporte simulado.
- `pnpm exec tsc --noEmit --incremental false`.
- ESLint sobre archivos nuevos/modificados. Solo quedan las dos advertencias de imágenes del componente existente.
- `pnpm build`: compilación local de Cloudflare, sin ejecutar despliegue. Advierte sobre tamaño de chunks y clasificación estática de rutas.
- `tests/auth-browser.cjs`: navegador real con SDK real y todas las peticiones remotas interceptadas. Comprueba apertura/recarga sin consumir código, códigos inválidos/caducados, creación de sesión, reenvío, espera tras recarga, doble clic, login no confirmado, errores 429, enlaces antiguos, catalán, tamaño móvil, login normal y solicitud de recuperación.

Para reproducir el navegador, iniciar `pnpm exec vite --config tests/auth-preview/vite.config.mjs` y ejecutar `node tests/auth-browser.cjs` en otra terminal. Requiere Playwright disponible en el entorno y Chromium; se puede indicar `CHROME_PATH` para usar Chrome instalado y `NODE_PATH` si Playwright está en herramientas externas. El fixture usa un dominio ficticio de Auth y un destino de sesión simulado; no utiliza usuarios ni envíos reales.

Queda pendiente una prueba de extremo a extremo con un buzón controlado y la plantilla aplicada en un proyecto de pruebas o después de la publicación autorizada: registrarse, abrir el correo desde otro dispositivo, confirmar el código, entrar, solicitar aprobación y verificar que no hay acceso a datos antes de aprobar. También comprobar un código caducado y un reenvío sin insistir hasta agotar cuotas. Las pruebas simuladas no certifican la entrega de correo ni la configuración privada de producción.

## Referencias

- [Plantillas y protección frente a prefetch](https://supabase.com/docs/guides/auth/auth-email-templates#email-prefetching)
- [Verificación OTP](https://supabase.com/docs/reference/javascript/auth-verifyotp)
- [Límites de Auth](https://supabase.com/docs/guides/auth/rate-limits)
