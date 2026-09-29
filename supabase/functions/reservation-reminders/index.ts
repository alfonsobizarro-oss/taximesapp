import {createClient} from 'npm:@supabase/supabase-js@2.116.0';
import {deliverReminder} from './worker.ts';
Deno.serve(async(req:Request)=>{
 const secret=Deno.env.get('RESERVATION_CRON_SECRET');
 if(req.method!=='POST')return new Response(null,{status:405});
 if(!secret||req.headers.get('authorization')!=='Bearer '+secret)return new Response(null,{status:401});
 const key=Deno.env.get('RESEND_API_KEY'),from=Deno.env.get('RESERVATION_EMAIL_FROM'),url=Deno.env.get('RESERVATION_APP_URL');
 if(!key||!from||!url||!url.startsWith('https://'))return Response.json({error:'Recordatorios sin configurar.'},{status:503});
 try{
  const backend=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
  return Response.json(await deliverReminder(backend,{key,from,url}));
 }catch{return Response.json({error:'No se pudo procesar el recordatorio.'},{status:503})}
});
