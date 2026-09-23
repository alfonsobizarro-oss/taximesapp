import {createClient} from '@supabase/supabase-js';
import {supabaseUrl,supabaseKey} from './supabase-config';
let client:ReturnType<typeof createClient>|undefined;
export function supabase(){return client??=createClient(supabaseUrl,supabaseKey,{auth:{flowType:'pkce'}})}
export async function apiFetch(path:string,init:RequestInit={}){
  const {data:{session}}=await supabase().auth.getSession();
  const headers=new Headers(init.headers);
  if(session)headers.set('Authorization','Bearer '+session.access_token);
  return fetch(path,{...init,headers,cache:'no-store'});
}
