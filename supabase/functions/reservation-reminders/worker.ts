import type {SupabaseClient} from 'npm:@supabase/supabase-js@2.116.0';
// Provider adapter is deliberately explicit. No Auth email endpoint is used for operational mail.
export async function deliverReminder(backend: SupabaseClient, config: {key:string;from:string;url:string}, send: typeof fetch = fetch) {
  const {data:jobs,error}=await backend.rpc('tx_claim_reservation_mail');
  if(error)throw error;
  const job=jobs?.[0];if(!job)return {processed:0};
  const update=(values:Record<string,unknown>)=>backend.from('tx_reservation_mail').update(values).eq('id',job.id).eq('lease',job.lease).eq('state','sending');
  try {
    const {data:r,error:reservationError}=await backend.from('tx_reservations').select('body').eq('id',job.reservation_id).single();
    const {data:u,error:userError}=await backend.from('tx_records').select('body').eq('kind','users').eq('id',job.user_id).single();
    if(reservationError||userError)throw Error('lookup');
    if(r.body.revision!==job.revision||r.body.status!=='assigned'||r.body.assignedTo!==job.user_id||r.body.releaseRequest||u.body.status!=='active'||u.body.role!=='reservation'||!u.body.reservationTypes?.includes(r.body.kind)) {
      const result=await update({state:'obsolete',lease:null,lease_until:null});if(result.error)throw result.error;return {processed:1};
    }
    let payload=job.payload;
    if(!payload){
      const {data:identity,error}=await backend.auth.admin.getUserById(job.user_id);
      if(error)throw error;
      if(!identity.user?.email_confirmed_at||!identity.user.email){await update({state:'review',last_error:'Cuenta sin correo confirmado.'});return {processed:1};}
      const when=new Date(r.body.start).toLocaleString('es-ES',{timeZone:'Europe/Madrid',dateStyle:'medium',timeStyle:'short'});
      payload={from:config.from,to:[identity.user.email],subject:'Taximés · Recordatorio de servicio',text:`Tienes un servicio ${r.body.kind} el ${when} (hora de Madrid). Entra en Mis servicios para revisar los datos y pulsar «Confirmar que realizaré el servicio». Si no puedes realizarlo, comunica el motivo a Central desde la app.\n\n${config.url}`};
      const saved=await backend.from('tx_reservation_mail').update({payload}).eq('id',job.id).eq('lease',job.lease).eq('state','sending').select('id');
      if(saved.error)throw saved.error;if(!saved.data?.length)return {processed:0};
    }
    const response=await send('https://api.resend.com/emails',{method:'POST',headers:{Authorization:'Bearer '+config.key,'Content-Type':'application/json','Idempotency-Key':'taximes-reservation/'+job.id},body:JSON.stringify(payload),signal:AbortSignal.timeout(20000)});
    if(!response.ok)throw Error('provider_'+response.status);
    const receipt=await response.json();if(!receipt.id)throw Error('provider_receipt');
    const saved=await update({state:'sent',sent_at:new Date().toISOString(),provider_id:receipt.id,lease:null,lease_until:null,last_error:null});
    if(saved.error)throw saved.error;
    return {processed:1};
  } catch {
    // Do not log email addresses, payloads, provider bodies or keys. Lease expiry retries
    // the same payload/key; a crash after delivery therefore does not send a second email.
    const saved=await update({last_error:'Entrega no confirmada; reintento con la misma clave.'});
    if(saved.error)throw saved.error;
    return {processed:1,pendingRetry:true};
  }
}
