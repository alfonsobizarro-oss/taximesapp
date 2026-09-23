import {env} from 'cloudflare:workers';
import {State,seed,Item} from './model';
export function db(){if(!env.DB)throw Error('Base de datos no disponible');return env.DB}
export function identity(req:Request){const id=req.headers.get('oai-authenticated-user-id');if(!id)return null;const email=req.headers.get('oai-authenticated-user-email')||'';const raw=req.headers.get('oai-authenticated-user-full-name');let name=email.split('@')[0]||'Administrador';try{if(raw)name=decodeURIComponent(raw)}catch{}return {id,email,name,role:'delegate',status:'new'}}
export async function load(){const r=await db().prepare('SELECT payload,version FROM workspace WHERE id = ?').bind('main').first<any>();return r?{state:JSON.parse(r.payload) as State,version:r.version}:null}
export async function ensure(user:Item){let r=await load();if(!r){const s=seed({...user,role:'root',status:'active'});await db().prepare('INSERT OR IGNORE INTO workspace (id,payload,version) VALUES (?,?,0)').bind('main',JSON.stringify(s)).run();r=await load()}return r!}
export function sameOrigin(req:Request){const origin=req.headers.get('origin');if(origin&&origin!==new URL(req.url).origin)throw Error('Origen no permitido.');if(req.headers.get('sec-fetch-site')==='cross-site')throw Error('Origen no permitido.')}
