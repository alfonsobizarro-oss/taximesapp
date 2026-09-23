# Cloudflare Workers (publicación posterior)

Worker existente: `taximesapp`.

- Instalación: `pnpm install --frozen-lockfile`.
- Comando de compilación: `pnpm build`.
- Comando de despliegue: `pnpm deploy`.
- Raíz: la raíz del repositorio.
- Node.js 24, pnpm 11.19.0.

`pnpm build` genera `dist/server/cloudflare-wrangler.json`, sin los antiguos bindings D1/R2. No usar directamente `npx wrangler deploy` sin indicar la configuración generada. Para una prueba sin publicar:

```sh
pnpm exec wrangler deploy --config dist/server/cloudflare-wrangler.json --dry-run
```

El despliegue real requiere la cuenta de Cloudflare autorizada. No guardar sus credenciales en GitHub. Esta consolidación no autoriza cambios de plan ni ejecuta un despliegue.
