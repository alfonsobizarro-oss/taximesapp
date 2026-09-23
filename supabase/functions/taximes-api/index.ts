import {createClient} from 'npm:@supabase/supabase-js@2.116.0';
import {seed,visible,isAdmin, type Item} from './model.ts';
import {apply} from './actions.ts';

const backend=createClient(Deno.env.get('SUPABASE_URL')!,Deno.env.get('SUPABASE_SERVICE_ROLE_KEY')!,{auth:{persistSession:false,autoRefreshToken:false}});
const json=(value:unknown,status=200)=>Response.json(value,{status,headers:{'Cache-Control':'private, no-store'}});
const has=(files:Item[],id:string)=>files?.some(f=>f.id===id);
Deno.serve(async(req:Request)=>{
  try{
    const token=req.headers.get('authorization')?.match(/^Bearer (.+)$/)?.[1];
    if(!token)return json({error:'Inicia sesión para acceder.'},401);
    const {data:identity,error:authError}=await backend.auth.getUser(token);
    if(authError||!identity.user)return json({error:'Tu sesión ha caducado. Vuelve a entrar.'},401);
    const account=identity.user;
    if(!account.email_confirmed_at)return json({error:'Confirma primero tu correo electrónico.'},403);
    const {data:r,error:loadError}=await backend.rpc('tx_load');
    if(loadError)throw loadError;
    const s=r.state;
    let user=s.users.find((u:Item)=>u.id===account.id)||{id:account.id,email:account.email,name:String(account.user_metadata?.name||'Delegado').slice(0,100),role:'delegate',status:'new'};
    // Email comes from verified Auth identity; metadata is used only as display text.
    const canSetup=!r.initialized&&!!r.owner_email&&account.email?.toLowerCase()===r.owner_email.toLowerCase();
    const path=new URL(req.url).pathname.split('/taximes-api/')[1]||'';
    if(path==='state'){
      if(req.method==='GET')return json({user,state:user.status==='active'?visible(s,user):null,version:r.version,setup:canSetup});
      if(req.method!=='POST')return json({error:'Método no permitido.'},405);
      const raw=await req.text();if(raw.length>1500000)return json({error:'El archivo supera el tamaño permitido.'},413);
      const action=JSON.parse(raw);
      if(action.type==='setup'){
        if(!canSetup)return json({error:'Solo el propietario puede iniciar la aplicación.'},403);
        user={...user,role:'root',status:'active'};
        const next=seed(user);
        const {data:version,error}=await backend.rpc('tx_commit',{expected_version:r.version,next_state:next});
        if(error)throw error;
        return json({user,state:visible(next,user),version});
      }
      if(!r.initialized)return json({error:'El administrador principal debe completar la configuración inicial.'},409);
      if(action.version!==r.version)return json({error:'Hay cambios nuevos. Actualiza y vuelve a guardar.'},409);
      if(action.type==='register'&&user.status==='blocked')return json({error:'Tu acceso está desactivado. Contacta con administración.'},403);
      if(Array.isArray(action.files)){
        const verified=[];
        for(const file of action.files.slice(0,5)){
          const {data:f,error}=await backend.from('tx_files').select('*').eq('id',String(file.id)).maybeSingle();
          if(error||!f||(f.owner!==user.id&&!(isAdmin(user)&&s.documents.some((d:Item)=>has(d.files,f.id)))))return json({error:'Archivo no autorizado.'},403);
          verified.push({id:f.id,name:f.name,type:f.type,size:f.size});
        }
        action.files=verified;
      }
      apply(s,user,action);
      if(JSON.stringify(s).length>1800000)return json({error:'La prueba ha alcanzado su capacidad. Contacta con administración.'},413);
      const {data:version,error}=await backend.rpc('tx_commit',{expected_version:r.version,next_state:s});
      if(error)throw error;
      return json({user,state:user.status==='active'?visible(s,user):null,version});
    }
    if(user.status!=='active')return json({error:'Acceso no autorizado.'},403);
    if(path==='files'&&req.method==='POST'){
      const form=await req.formData(),f=form.get('file');
      if(!(f instanceof File)||!f.size||f.size>10485760)return json({error:'Máximo 10 MB por archivo.'},413);
      if(!['pdf','png','jpg','jpeg','webp','gif','xlsx','xls','csv','docx','txt','mp3','m4a','webm','ogg','wav','mp4'].includes(f.name.split('.').pop()?.toLowerCase()||''))return json({error:'Formato de archivo no admitido.'},400);
      const id=crypto.randomUUID(),type=f.type||'application/octet-stream';
      const {error:uploadError}=await backend.storage.from('taximes-private').upload(id,f,{contentType:type,upsert:false});
      if(uploadError)throw uploadError;
      const record={id,owner:user.id,name:f.name.slice(0,255),type,size:f.size};
      const {error}=await backend.from('tx_files').insert(record);
      if(error){await backend.storage.from('taximes-private').remove([id]);throw error}
      return json({id,name:record.name,type,size:f.size});
    }
    if(path.startsWith('files/')&&req.method==='GET'){
      const id=path.slice(6);
      if(!/^[0-9a-f-]{36}$/.test(id))return json({error:'Archivo no encontrado.'},404);
      const {data:f,error}=await backend.from('tx_files').select('*').eq('id',id).maybeSingle();
      if(error||!f)return json({error:'Archivo no encontrado.'},404);
      const shared=s.documents.some((d:Item)=>has(d.files,id))||s.incidents.some((i:Item)=>has(i.files,id)||i.comments.some((c:Item)=>has(c.files,id)))||s.messages.some((m:Item)=>(m.channel==='general'||m.channel===user.id||isAdmin(user))&&has(m.files,id));
      if(f.owner!==user.id&&!shared)return json({error:'Archivo no autorizado.'},403);
      const {data:blob,error:downloadError}=await backend.storage.from('taximes-private').download(id);
      if(downloadError)throw downloadError;
      return new Response(blob,{headers:{'Content-Type':f.type,'Content-Disposition':`attachment; filename*=UTF-8''${encodeURIComponent(f.name)}`,'Cache-Control':'private, no-store','X-Content-Type-Options':'nosniff'}});
    }
    return json({error:'Ruta no encontrada.'},404);
  }catch(error){
    const message=String((error as Error)?.message||'');
    if(message.includes('TX_CONFLICT'))return json({error:'Otro usuario ha guardado cambios. Actualiza y vuelve a intentarlo.'},409);
    // Domain validation messages are safe; infrastructure errors are not sent to clients.
    if(error instanceof Error&&!('code' in error))return json({error:message||'No se pudo guardar.'},400);
    console.error('Taximes operation failed', (error as {code?:string})?.code||'unknown');
    return json({error:'No se pudo completar la operación. Vuelve a intentarlo.'},503);
  }
});
