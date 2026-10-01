/* eslint-disable @typescript-eslint/no-require-imports */
const assert=require('node:assert/strict'),fs=require('node:fs');const {PGlite}=require('@electric-sql/pglite');const load=require('./load.cjs');const {seed}=load('lib/model.ts');const {applyReservations}=load('lib/reservations.ts');
(async()=>{
 const db=new PGlite();await db.exec(`create role anon;create role authenticated;create role service_role bypassrls;create schema auth;create table auth.users(id uuid primary key);create schema storage;create table storage.buckets(id text,name text,public boolean,file_size_limit bigint);`);
 await db.exec(fs.readFileSync('supabase/schema.sql','utf8'));for(const f of fs.readdirSync('supabase/migrations').sort())await db.exec(fs.readFileSync('supabase/migrations/'+f,'utf8'));
 const admin={id:'central',role:'admin',status:'active',name:'Central'},a={id:'a',role:'reservation',status:'active',reservationTypes:['MONOVOLUMEN'],memberId:'m'},b={...a,id:'b'};
 const s=seed(admin);s.users=[admin,a,b];s.members=[{id:'m',status:'active'}];s.shifts=[];
 const call=(v,s,e)=>db.query('select public.tx_commit_reservations($1,$2,$3)',[v,JSON.stringify(s),JSON.stringify(e)]);const read=async()=>(await db.query('select public.tx_load_reservations() p')).rows[0].p;
 for(const role of ['anon','authenticated']){await db.exec('set role '+role);for(const table of ['tx_reservations','tx_reservation_events','tx_reservation_mail'])await assert.rejects(db.query('select * from '+table),/permission denied/);await assert.rejects(db.query('select public.tx_claim_reservation_mail()'),/permission denied/);await assert.rejects(read(),/permission denied/);await assert.rejects(call(0,s,[]),/permission denied/);await db.exec('reset role')}
 await db.exec('set role service_role');let e=applyReservations(s,admin,{type:'reservation.save',start:new Date(Date.now()+7200000).toISOString(),kind:'MONOVOLUMEN',pickup:'A',destination:'B'});const id=s.reservations[0].id;e.push(...applyReservations(s,admin,{type:'reservation.publish',id}));await call(0,s,e);
 let snap=await read();const one=structuredClone(snap.state),two=structuredClone(snap.state);const ea=applyReservations(one,a,{type:'reservation.accept',id,confirm:true}),eb=applyReservations(two,b,{type:'reservation.accept',id,confirm:true});
 const results=await Promise.allSettled([call(snap.version,one,ea),call(snap.version,two,eb)]);assert.equal(results.filter(r=>r.status==='fulfilled').length,1);assert.match(results.find(r=>r.status==='rejected').reason.message,/TX_CONFLICT/);
 snap=await read();assert.equal(snap.state.reservations[0].assignedTo,'a');assert.equal((await db.query('select count(*)::int n from tx_reservation_mail')).rows[0].n,1);
 const claims=await Promise.all([db.query('select * from tx_claim_reservation_mail()'),db.query('select * from tx_claim_reservation_mail()')]);assert.equal(claims.reduce((n,r)=>n+r.rows.length,0),1);
 const job=claims.flatMap(r=>r.rows)[0];assert.equal(job.attempts,1);
 await db.query("update tx_reservation_mail set lease_until=now()-interval '1 minute' where id=$1",[job.id]);const retry=(await db.query('select * from tx_claim_reservation_mail()')).rows[0];assert.equal(retry.id,job.id);assert.notEqual(retry.lease,job.lease);
 await db.query("update tx_reservation_mail set first_attempt_at=now()-interval '24 hours',lease_until=now()-interval '1 minute'");assert.equal((await db.query('select * from tx_claim_reservation_mail()')).rows.length,0);assert.equal((await db.query('select state from tx_reservation_mail')).rows[0].state,'review');
 await assert.rejects(db.query('delete from tx_reservation_events'),/permission denied/);await assert.rejects(db.query("update tx_reservation_events set event='{}'"),/permission denied/);
 const before=snap.version;await assert.rejects(call(before,snap.state,[{type:'reservation.invalid',id:'bad'}]),/uuid/);assert.equal((await read()).version,before);
 e=applyReservations(snap.state,admin,{type:'reservation.republish',id});await call(snap.version,snap.state,e);snap=await read();e=applyReservations(snap.state,b,{type:'reservation.accept',id,confirm:true});await call(snap.version,snap.state,e);assert.equal((await db.query('select count(*)::int n from tx_reservation_mail')).rows[0].n,2);
 snap=await read();e=applyReservations(snap.state,b,{type:'reservation.release',id,reason:'No puedo'});await call(snap.version,snap.state,e);assert.equal((await db.query("select count(*)::int n from tx_reservation_mail where state='pending'")).rows[0].n,0);assert.equal((await read()).state.reservations[0].assignedTo,'b');

 // Short-notice edits produce immediate change mail, independent of a 24h reminder.
 snap=await read();e=applyReservations(snap.state,admin,{type:'reservation.republish',id});await call(snap.version,snap.state,e);
 snap=await read();e=applyReservations(snap.state,a,{type:'reservation.accept',id,confirm:true});await call(snap.version,snap.state,e);
 snap=await read();let short=snap.state.reservations.find(r=>r.id===id);
 assert.equal((await db.query("select count(*)::int n from tx_reservation_mail where reservation_id=$1 and kind='reminder'",[id])).rows[0].n,0);
 e=applyReservations(snap.state,admin,{...short,type:'reservation.save',pickup:'Recogida urgente'});await call(snap.version,snap.state,e);
 const shortMail=(await db.query("select * from tx_reservation_mail where reservation_id=$1 and kind='change'",[id])).rows[0];
 assert.ok(Date.parse(shortMail.due_at)<=Date.now());assert.equal(shortMail.context.requiresReconfirmation,true);
 assert.equal(shortMail.context.changes[0].before,'A');assert.equal(shortMail.context.changes[0].after,'Recogida urgente');
 // A long-lead assignment gets its immediate mail plus its independent 24h reminder.
 snap=await read();e=applyReservations(snap.state,admin,{type:'reservation.save',start:new Date(Date.now()+72*3600000).toISOString(),kind:'MONOVOLUMEN',pickup:'Origen',destination:'Destino'});
 const longId=snap.state.reservations[0].id;
 e.push(...applyReservations(snap.state,admin,{type:'reservation.publish',id:longId}));await call(snap.version,snap.state,e);
 snap=await read();e=applyReservations(snap.state,a,{type:'reservation.accept',id:longId,confirm:true});await call(snap.version,snap.state,e);
 const jobs=async()=>(await db.query('select * from tx_reservation_mail where reservation_id=$1 order by id',[longId])).rows;
 let mail=await jobs();assert.deepEqual(mail.map(m=>m.kind).sort(),['assignment','reminder']);
 let reminder=mail.find(m=>m.kind==='reminder');snap=await read();let long=snap.state.reservations.find(r=>r.id===longId);
 assert.equal(new Date(reminder.due_at).getTime(),Date.parse(long.start)-24*3600000);
 e=applyReservations(snap.state,a,{type:'reservation.confirm',id:longId,revision:long.revision});await call(snap.version,snap.state,e);
 snap=await read();long=snap.state.reservations.find(r=>r.id===longId);const confirmedAt=long.confirmedAt;
 e=applyReservations(snap.state,admin,{...long,type:'reservation.save',observations:'Corrección menor'});await call(snap.version,snap.state,e);
 mail=await jobs();assert.equal(mail.length,3);assert.equal(mail.find(m=>m.kind==='reminder').id,reminder.id);assert.equal(mail.find(m=>m.kind==='reminder').state,'pending');
 snap=await read();long=snap.state.reservations.find(r=>r.id===longId);assert.equal(long.confirmedAt,confirmedAt);
 const noticeCount=snap.state.notifications.length,auditCount=(await db.query('select count(*)::int n from tx_reservation_events')).rows[0].n;
 const replay={...long,type:'reservation.save'};e=applyReservations(snap.state,admin,replay);assert.deepEqual(e,[]);
 await call(snap.version,snap.state,e);assert.equal((await jobs()).length,3);
 await assert.rejects(call(snap.version,snap.state,e),/TX_CONFLICT/);
 snap=await read();assert.equal(snap.state.notifications.length,noticeCount);assert.equal((await db.query('select count(*)::int n from tx_reservation_events')).rows[0].n,auditCount);
 long=snap.state.reservations.find(r=>r.id===longId);const beforeChange=structuredClone(long);
 e=applyReservations(snap.state,admin,{...long,type:'reservation.save',passengers:6});await call(snap.version,snap.state,e);
 snap=await read();long=snap.state.reservations.find(r=>r.id===longId);assert.equal(long.assignedTo,'a');assert.equal(long.confirmedAt,null);assert.equal(long.reconfirmationRequired,true);
 mail=await jobs();assert.equal(mail.length,5);assert.equal(mail.find(m=>m.id===reminder.id).state,'obsolete');assert.equal(mail.filter(m=>m.kind==='reminder'&&m.state==='pending').length,1);
 const audit=(await db.query('select event from tx_reservation_events where id=$1',[e[0].id])).rows[0].event;
 assert.deepEqual(audit.before,beforeChange);assert.deepEqual(audit.after,long);
 const frozen=structuredClone(snap.state);assert.throws(()=>applyReservations(snap.state,admin,{...long,type:'reservation.save',kind:'ADAPTADO'}),/Republica y reasigna/);assert.deepEqual(snap.state,frozen);
 const countsBefore=(await jobs()).length;
 e=applyReservations(snap.state,admin,{...long,type:'reservation.save',passengers:7});
 await assert.rejects(call(snap.version,snap.state,[...e,{type:'reservation.invalid',id:'bad'}]),/uuid/);
 assert.equal((await jobs()).length,countsBefore);assert.deepEqual((await read()).state,frozen,'audit failure rolls back reservation, notices and outbox');
 await db.close();console.log('PASS: local PostgreSQL migrations, browser denial, concurrent accept winner, immutable audit, rollback, unique outbox, concurrent claims, lease recovery, bounded retries, reassign and renunciation.');
})().catch(e=>{console.error(e);process.exitCode=1});
