import type {SupabaseClient} from 'npm:@supabase/supabase-js@2.116.0';
type Snapshot = Record<string, unknown>;
type Change = {field: string; before: unknown; after: unknown};
type MailContext = {at?: string; after?: Snapshot; changes?: Change[]; requiresReconfirmation?: boolean};
const labels: Record<string, string> = {start:'Fecha y hora (Madrid)',pickup:'Recogida',destination:'Destino',kind:'Tipo de vehículo',requirements:'Requisitos especiales',passengers:'Pasajeros',customerType:'Cliente',observations:'Observaciones'};
const when = (value: unknown) => new Date(String(value)).toLocaleString('es-ES',{timeZone:'Europe/Madrid',dateStyle:'medium',timeStyle:'short'});
const valueText = (field: string, value: unknown) => value == null || value === '' ? 'Sin especificar' : field === 'start' ? when(value) : String(value);
// Plain text only: no unescaped HTML, links with tokens, or passenger contact data.
export function reservationMailContent(kind: string, current: Snapshot, context: MailContext | null, url: string) {
  const snapshot = context?.after || current;
  const details = `Servicio ${snapshot.kind} el ${when(snapshot.start)} (hora de Madrid).`;
  const link = `Consulta siempre los datos actuales en Mis servicios. Si no puedes realizarlo, comunica el motivo a Central desde la app.\n\n${url}`;
  if (kind === 'change') {
    const changes = (context?.changes || []).filter(change => Object.hasOwn(labels, change.field)).map(change => `${labels[change.field]}: ${valueText(change.field,change.before)} → ${valueText(change.field,change.after)}`).join('\n');
    const confirmation = snapshot.releaseRequest ? 'Hay una renuncia pendiente de decisión de Central. Revisa los cambios y contacta con Central; no puedes reconfirmar mientras siga pendiente.' : context?.requiresReconfirmation
      ? 'Este cambio exige reconfirmación. La confirmación anterior ha quedado invalidada. Revisa los datos y pulsa «CONFIRMAR CAMBIO» en la app.'
      : 'Este cambio menor no invalida tu confirmación anterior. Si tenías una confirmación pendiente, sigue pendiente.';
    return {subject:'Taximés · RESERVA MODIFICADA',text:`Central ha modificado tu reserva${context?.at ? ' el '+when(context.at)+' (hora de Madrid)' : ''}.\n${details}\n\n${changes || 'Revisa los cambios en la app.'}\n\n${confirmation}\n\n${link}`};
  }
  if (kind === 'assignment') return {subject:'Taximés · Servicio asignado',text:`Has aceptado el servicio y queda asignado a ti.\n${details}\nEntra ahora en Mis servicios para revisar los datos y confirmar que lo realizarás, aunque falten menos de 24 horas.\n\n${link}`};
  const confirmation = current.confirmedAt ? 'Tu servicio está confirmado.' : current.reconfirmationRequired ? 'Revisa los datos y pulsa «CONFIRMAR CAMBIO».' : 'Revisa los datos y pulsa «Confirmar que realizaré el servicio».';
  return {subject:'Taximés · Recordatorio de servicio',text:`Tienes un ${details} ${confirmation}\n\n${link}`};
}
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
    const sameAssignment = (r.body.assignmentRevision || r.body.acceptedAt) === (job.context?.after?.assignmentRevision || job.context?.after?.acceptedAt);
    const currentJob = (job.kind || 'reminder') === 'reminder' ? (r.body.reminderRevision || r.body.revision) === job.revision : sameAssignment;
    if(!currentJob||(job.kind!=='change'&&(Date.parse(r.body.start)<=Date.now()||r.body.releaseRequest))||r.body.status!=='assigned'||r.body.assignedTo!==job.user_id||u.body.status!=='active'||u.body.role!=='reservation'||!u.body.reservationTypes?.includes(r.body.kind)) {
      const result=await update({state:'obsolete',lease:null,lease_until:null});if(result.error)throw result.error;return {processed:1};
    }
    let payload=job.payload;
    if(!payload){
      const {data:identity,error}=await backend.auth.admin.getUserById(job.user_id);
      if(error)throw error;
      if(!identity.user?.email_confirmed_at||!identity.user.email){await update({state:'review',last_error:'Cuenta sin correo confirmado.'});return {processed:1};}
      payload={from:config.from,to:[identity.user.email],...reservationMailContent(job.kind || 'reminder',r.body,job.context,config.url)};
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
