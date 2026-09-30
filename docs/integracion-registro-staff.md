# Integración Registro OTP + Staff Taximés — 30/09/2026

Rama: `integration/registro-otp-staff-taximes`, creada desde el main local `f7b968a5a31d5faadb0e87d5159545c9a0972ea5` (coincidía con origin/main almacenado; no se actualizó el remoto).

## Integración y conflicto

Se aplicó primero `fix/registro-email` (`e50238e`) y después `fix/staff-taximes-ui` (`0ab2267`), sin commits intermedios. Conflicto único en `app/auth-gate.tsx`: conservado el componente completo de OTP y aplicada la identidad Staff Taximés, incluidos los títulos del modo de confirmación. Se mantienen contraseña, recuperación y escucha de sesión. Se excluyó la nueva plantilla de correo de la rama OTP: no hay archivos de plantilla en este cambio.

Nombre visible y PWA actualizados. Retirados avisos genéricos de versión de prueba. El error de capacidad de la Edge Function se redacta sin mencionar «la prueba»; únicamente cambia el texto local, no está desplegado.

## Datos ficticios y producción

No se cambió `seed`, la inicialización ni el contenido almacenado. El asistente de inicialización avisa expresamente que genera datos ficticios. Se conserva Ejemplo para usuarios demo. Un clasificador de presentación reconoce marcas demo explícitas o combinaciones exactas de ID y contenido del seed; nunca el ID por sí solo. El aviso global es condicional a contenido identificado, con identificación contextual en chat y encuesta.

Consulta remota de solo lectura al proyecto nraqlebivwcgsgtveenz, sin obtener cuentas de Auth ni textos privados. Espacio inicializado, versión 80. Recuentos: 12 usuarios, 237 asociados, 1 incidencia, 17 tramos, 6 mensajes, 3 documentos, 1 encuesta, 34 notificaciones y 67 entradas de actividad.

- `msg-1`: contenido idéntico al mensaje inicial de demostración. Sigue existiendo.
- `poll-1`: conserva el título de la encuesta inicial. No se verificaron sus opciones ni la procedencia de votos; no se califican sus respuestas como ficticias.
- `doc-1`: título y cuerpo ya difieren del seed. No se clasifica como ficticio solo por su ID.
- Ninguna colección contenía `demo:true`; tampoco aparecieron autores/usuarios con prefijo demo en la comprobación realizada. Esto no acredita que todos los demás registros sean reales.

La revisión automática rechazó una primera consulta porque incluía muestras de contenido y datos de cuentas innecesarios. Se sustituyó por recuentos, IDs e indicadores de coincidencia, sin recuperar ese contenido. No hubo escrituras remotas.

## Verificación de esta integración

- Typecheck: correcto.
- `pnpm test`: siete suites correctas, incluidas restricciones, horario, coordinación, base de datos local, API, OTP e integración Staff.
- OTP: SDK real con transporte simulado; formato, ceros iniciales, caducidad, sesión, reenvío y límites de envío.
- Build completo: correcto; avisos existentes sobre chunks y clasificación estática de rutas de vinext.
- Lint completo: 34 errores y 12 advertencias; baseline main: 35 errores y 13 advertencias. Comparación de archivo/regla/severidad/mensaje: ninguna incidencia nueva. No se declara lint limpio.
- Acceso de administrador comprobado en navegador con AuthGate y Workspace reales y servidor de prueba local: contraseña → espacio de trabajo, rol Administrador principal y menú Administración conservados. Sin credenciales ni sesiones de producción.
- El navegador se desconectó después; no se completaron en esta ejecución el recorrido visual OTP ni la revisión móvil. `tests/auth-browser.cjs` se conserva de la rama original, pero no se ejecutó aquí. No confundir el informe histórico registro-email.md con pruebas ejecutadas en esta rama.

Fixture aislado: `pnpm exec vite --config tests/integration-preview/vite.config.mjs`, puerto 4183. Solo escucha localhost, usa cuentas example.test y CSP que bloquea conexiones externas. Es una simulación, no una validación de Supabase desplegado.

## Pendientes antes de producción

1. Completar revisión visual móvil/OTP y acceso de administración en un entorno controlado.
2. Revisar y autorizar plantilla OTP, SMTP, cuotas, caducidad, longitud del código y URLs. Nada aplicado; sin la plantilla apropiada la nueva interfaz no garantiza recepción de códigos.
3. Prueba real autorizada con buzón controlado: registro, confirmación en otro dispositivo, aprobación administrativa, contraseña y recuperación. Las pruebas locales no certifican entrega de correos.
4. Decidir qué hacer con el mensaje inicial y la encuesta; no borrar automáticamente ni perder votos/contenido editado. Autorizar por separado cualquier limpieza.
5. La inicialización sigue generando datos demo. Cambiarla para futuros espacios vacíos requiere una decisión separada; producción ya está inicializada.
6. Resolver o aceptar expresamente el lint heredado antes de la publicación.

Main permanece en f7b968a y feature/reservas-especiales en d2216a9. Sin push, merge, despliegue, cambios remotos en Supabase/Cloudflare, RLS ni activación de emails.
