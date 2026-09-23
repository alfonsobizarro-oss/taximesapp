import {readFile,writeFile,access} from 'node:fs/promises';
import {fileURLToPath} from 'node:url';
import path from 'node:path';

const root=path.resolve(path.dirname(fileURLToPath(import.meta.url)),'..');
const dir=path.join(root,'dist/server');
await access(path.join(dir,'index.js'));
const generated=JSON.parse(await readFile(path.join(dir,'wrangler.json'),'utf8'));
// The app now uses Supabase. Do not provision the old Sites D1/R2 placeholders.
const config={
  name:'taximesapp',
  main:'index.js',
  compatibility_date:generated.compatibility_date,
  compatibility_flags:generated.compatibility_flags,
  workers_dev:true,
  preview_urls:false,
  no_bundle:true,
  rules:generated.rules,
  assets:{directory:'../client'},
  observability:{enabled:false},
};
const target=path.join(dir,'cloudflare-wrangler.json');
await writeFile(target,JSON.stringify(config,null,2)+'\n');
console.log(target);
