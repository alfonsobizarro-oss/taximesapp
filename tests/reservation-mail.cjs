/* eslint-disable @typescript-eslint/no-require-imports */
const assert=require('node:assert/strict');
const load=require('./load.cjs');
const {deliverReminder,reservationMailContent}=load('supabase/functions/reservation-reminders/worker.ts');
const start=new Date(Date.now()+48*3600000).toISOString();
const reservation={revision:'rev',reminderRevision:'rev',assignmentRevision:'assigned-rev',acceptedAt:'2026-10-01T08:00:00Z',status:'assigned',assignedTo:'u',kind:'MONOVOLUMEN',start};
const changes=[{field:'start',before:'2026-10-03T06:30:00Z',after:'2026-10-03T07:15:00Z'},{field:'pickup',before:'Sants',after:'Aeropuerto T1'},{field:'requirements',before:'',after:'Rampa'},{field:'passengers',before:4,after:6}];
const context={at:'2026-10-01T09:00:00Z',after:{...reservation},changes,requiresReconfirmation:true};
const cfg={key:'local-test',from:'test@example.invalid',url:'https://example.invalid'};
function fixture(kind='reminder',r={...reservation},ctx=context) {
 const job={id:'r:rev:'+kind,reservation_id:'r',revision:'rev',user_id:'u',lease:'lease',state:'sending',payload:null,kind,context:ctx};
 let failSave=true;const calls=[];
 const backend={rpc:async()=>({data:job.state==='sent'||job.state==='obsolete'?[]:[{...job}]}),auth:{admin:{getUserById:async()=>({data:{user:{email_confirmed_at:'yes',email:'test@example.invalid'}}})}},from:table=>{let values;return {select(){return this},eq(){return this},update(v){values=v;return this},single(){return this},then(resolve){let result;if(table==='tx_reservations')result={data:{body:r}};else if(table==='tx_records')result={data:{body:{role:'reservation',status:'active',reservationTypes:['MONOVOLUMEN']}}};else if(values?.state==='sent'&&failSave){failSave=false;result={error:new Error('db timeout')}}else{Object.assign(job,values);result={data:[{id:job.id}]}}return Promise.resolve(result).then(resolve)}}}};
 const send=async(url,options)=>{assert.equal(url,'https://api.resend.com/emails');calls.push(options);return Response.json({id:'mail-1'})};
 return {backend,send,job,calls,r};
}
(async()=>{
 for(const kind of ['reminder','assignment','change']) {
  const f=fixture(kind);
  await deliverReminder(f.backend,cfg,f.send);
  // Mutating data between retries must not change the persisted message/provider key.
  f.r.start=new Date(Date.now()+72*3600000).toISOString();
  await deliverReminder(f.backend,{...cfg,from:'changed@example.invalid'},f.send);
  await deliverReminder(f.backend,cfg,f.send);
  assert.equal(f.calls.length,2);assert.equal(f.calls[0].headers['Idempotency-Key'],f.calls[1].headers['Idempotency-Key']);assert.equal(f.calls[0].body,f.calls[1].body);assert.equal(f.job.state,'sent');
  const message=JSON.parse(f.calls[0].body);
  if(kind==='change') {
   assert.match(message.subject,/RESERVA MODIFICADA/);assert.match(message.text,/0?8:30 → .*0?9:15/);assert.match(message.text,/Sants → Aeropuerto T1/);assert.match(message.text,/Pasajeros: 4 → 6/);assert.match(message.text,/CONFIRMAR CAMBIO/);
  } else if(kind==='assignment') assert.match(message.text,/aunque falten menos de 24 horas/);
  else assert.ok(!message.text.includes('Sants'));
 }
 const minor=reservationMailContent('change',reservation,{...context,requiresReconfirmation:false,changes:[{field:'observations',before:'Nota',after:'Nota corregida'}]},cfg.url);
 assert.match(minor.text,/no invalida/);assert.match(minor.text,/Nota → Nota corregida/);assert.doesNotMatch(minor.text,/CONFIRMAR CAMBIO/);
 for (const r of [{...reservation,status:'cancelled'},{...reservation,assignmentRevision:'reassigned'},{...reservation,assignedTo:'other'}]) {
  const f=fixture('change',r);await deliverReminder(f.backend,cfg,f.send);assert.equal(f.calls.length,0);assert.equal(f.job.state,'obsolete');
 }
 for(const r of [{...reservation,start:'2000-01-01T00:00:00Z'},{...reservation,releaseRequest:{reason:'No puedo'}}]) {
  const f=fixture('change',r);await deliverReminder(f.backend,cfg,f.send);assert.equal(f.calls.length,1,'changes remain actionable until the service is closed');
  const reminder=fixture('reminder',r);await deliverReminder(reminder.backend,cfg,reminder.send);assert.equal(reminder.calls.length,0);
 }
 const f=fixture('change',{...reservation,revision:'later-edit'});await deliverReminder(f.backend,cfg,f.send);assert.equal(f.calls.length,1,'change history survives later edits within the same assignment');
 const reminder=fixture('reminder',{...reservation,revision:'minor-edit'});await deliverReminder(reminder.backend,cfg,reminder.send);assert.equal(reminder.calls.length,1,'minor edit retains reminder identity');
 console.log('PASS: assignment/change/reminder templates, before → after, required reconfirmation, immutable retry payload/key, no calls after sent/obsolete, same-assignment history and minor-edit reminder. All provider calls simulated.');
})().catch(e=>{console.error(e);process.exitCode=1});
