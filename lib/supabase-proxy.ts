import {supabaseUrl,supabaseKey} from './supabase-config';
export async function proxy(req:Request,path:string){
  const auth=req.headers.get('authorization');
  if(!auth?.startsWith('Bearer '))return Response.json({error:'Inicia sesión para acceder.'},{status:401,headers:{'Cache-Control':'no-store'}});
  const headers=new Headers({Authorization:auth,apikey:supabaseKey});
  const type=req.headers.get('content-type');if(type)headers.set('Content-Type',type);
  try{
    const response=await fetch(supabaseUrl+'/functions/v1/taximes-api/'+path,{method:req.method,headers,body:req.method==='GET'?undefined:await req.arrayBuffer()});
    const output=new Headers(response.headers);output.set('Cache-Control','private, no-store');output.set('X-Content-Type-Options','nosniff');
    return new Response(response.body,{status:response.status,headers:output});
  }catch{return Response.json({error:'No se ha podido conectar. Vuelve a intentarlo.'},{status:503})}
}
