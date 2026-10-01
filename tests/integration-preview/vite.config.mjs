import {defineConfig} from 'vite';
import react from '@vitejs/plugin-react';
import tailwind from '@tailwindcss/postcss';
import {fileURLToPath} from 'node:url';
import {createRequire} from 'node:module';
const require = createRequire(import.meta.url);
const {seed, visible} = require('../load.cjs')('lib/model.ts');
const {apply} = require('../load.cjs')('lib/actions.ts');
const project = fileURLToPath(new URL('../../', import.meta.url));
const rootUser = {id:'test-root',email:'admin@example.test',name:'Administración local',role:'root',status:'active'};
const pendingUser = {id:'test-new',email:'new@example.test',name:'Usuario nuevo local',role:'pending',status:'pending'};
const state = seed(rootUser);
state.users.push(pendingUser);
state.members.push({id:'real-local',fleet:'999',name:'Asociado local de prueba',status:'active',drivers:[],requirements:[],history:[]});
let version=1;
const accounts = new Map();
const refreshAccounts = new Map();
function session(email) {
  const record = email === rootUser.email ? rootUser : pendingUser;
  const user = {id:record.id,email:record.email,email_confirmed_at:new Date().toISOString(),aud:'authenticated',role:'authenticated',user_metadata:{name:record.name},app_metadata:{},created_at:new Date().toISOString()};
  const access_token = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({sub:user.id,exp:Math.floor(Date.now()/1000)+3600})).toString('base64url')}.local`;
  accounts.set(access_token, record);
  const refresh_token = 'local-refresh-' + record.id;
  refreshAccounts.set(refresh_token, record);
  return {user,access_token,refresh_token,token_type:'bearer',expires_in:3600};
}
function mockApi() {return {name:'local-only-integration-api',configureServer(server) {
  server.middlewares.use(async(req,res,next)=> {
    const url = new URL(req.url,'http://127.0.0.1:4183');
    if (!url.pathname.startsWith('/mock-auth/') && !url.pathname.startsWith('/api/')) return next();
    res.setHeader('Content-Type','application/json');res.setHeader('Cache-Control','no-store');res.setHeader('X-Supabase-Api-Version','2024-01-01');
    const reply = (status,data) => {res.statusCode=status;res.end(JSON.stringify(data));};
    let body={};try {if(req.method==='POST'){let raw='';for await (const part of req) raw+=part;body=raw?JSON.parse(raw):{};}}catch{return reply(400,{error:'Local invalid JSON'});}
    const account=accounts.get((req.headers.authorization||'').replace('Bearer ',''));
    if(url.pathname==='/api/state'){
      if(!account)return reply(401,{error:'Local: inicia sesión'});
      const current=state.users.find(u=>u.id===account.id)||account;
      if(req.method==='POST'){
        if(body.version!==version)return reply(409,{error:'Actualiza la vista local'});
        try{apply(state,current,body);version++;}catch(error){return reply(400,{error:error.message});}
      }
      return reply(200,{user:current,state:current.status==='active'?visible(state,current):null,version,setup:false,capabilities:{coordinationV1:true,reservationsV1:true,reservationChangesV1:true},serverTime:new Date().toISOString()});
    }
    if(url.pathname.endsWith('/token')) {
      const email = url.searchParams.get('grant_type') === 'refresh_token' ? refreshAccounts.get(body.refresh_token)?.email : body.email;
      return [rootUser.email,pendingUser.email].includes(email) ? reply(200,session(email)) : reply(401,{msg:'Unknown local account'});
    }
    if(url.pathname.endsWith('/signup'))return reply(200,{id:pendingUser.id,email:body.email,user_metadata:{name:body.options?.data?.name}});
    if(url.pathname.endsWith('/verify'))return body.token==='012345'?reply(200,session(body.email)):reply(403,{code:'otp_expired',msg:'Token has expired or is invalid'});
    if(url.pathname.endsWith('/resend')||url.pathname.endsWith('/recover')||url.pathname.endsWith('/logout'))return reply(200,{});
    if(url.pathname.endsWith('/user'))return account?reply(200,session(account.email).user):reply(401,{msg:'No local session'});
    return reply(404,{error:'No fixture endpoint'});
  });
}};}
export default defineConfig({root:fileURLToPath(new URL('./',import.meta.url)),publicDir:project+'public',resolve:{alias:[{find:'./supabase-config',replacement:fileURLToPath(new URL('./supabase-config.ts',import.meta.url))},{find:'@',replacement:project}]},plugins:[react(),mockApi()],css:{postcss:{plugins:[tailwind()]}},server:{host:'127.0.0.1',port:Number(process.env.TAXIMES_PREVIEW_PORT||4183),strictPort:true}});
