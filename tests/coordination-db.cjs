/* eslint-disable @typescript-eslint/no-require-imports */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const {PGlite}=require('@electric-sql/pglite');
const load=require('./load.cjs');
const {seed}=load('lib/model.ts');
const {applyCoordination}=load('lib/coordination.ts');
const root=path.resolve(__dirname,'..');
(async()=>{
 const db=new PGlite();
 // Local test prerequisites for the EXISTING schema, never a remote connection.
 await db.exec(`create role anon; create role authenticated; create role service_role bypassrls;
 create schema auth; create table auth.users(id uuid primary key);
 create schema storage; create table storage.buckets(id text,name text,public boolean,file_size_limit bigint);`);
 await db.exec(fs.readFileSync(path.join(root,'supabase/schema.sql'),'utf8'));
 const a={id:'a',name:'538',role:'delegate',status:'active'}, b={id:'b',name:'620',role:'delegate',status:'active'}, c={id:'c',name:'4819',role:'delegate',status:'active'};
 const s=seed(a);s.users=[a,b,c];s.shifts=[{id:'original',userId:'a',status:'confirmed',start:'2026-09-28T13:00',end:'2026-09-28T18:00'}, {id:'second',userId:'c',status:'confirmed',start:'2026-09-29T13:00',end:'2026-09-29T18:00'}];
 await db.query('select public.tx_commit($1,$2::jsonb)',[0,JSON.stringify(s)]);
 const before=(await db.query('select * from public.tx_records order by kind,id')).rows;
 await db.exec(fs.readFileSync(path.join(root,'supabase/migrations/20260927111530_adviser_coordination.sql'),'utf8'));
 assert.deepEqual((await db.query('select * from public.tx_records order by kind,id')).rows,before);
 assert.equal((await db.query('select count(*)::int n from public.tx_coordination_events')).rows[0].n,2);
 const rls=(await db.query("select relrowsecurity from pg_class where relname in ('tx_adviser_status','tx_substitutions','tx_coordination_events')")).rows;
 assert.ok(rls.length===3&&rls.every(row=>row.relrowsecurity));
 assert.equal((await db.query("select count(*)::int n from pg_policies where tablename like 'tx_%'")).rows[0].n,0);
 for(const role of ['anon','authenticated']) {
  await db.exec('set role '+role);
  await assert.rejects(db.query('select public.tx_load_coordination()'),/permission denied/);
  await assert.rejects(db.query("select public.tx_commit_coordination(1,'{}','[]')"),/permission denied/);
  for(const table of ['tx_adviser_status','tx_substitutions','tx_coordination_events'])await assert.rejects(db.query('select * from public.'+table),/permission denied/);
  await db.exec('reset role');
 }
 await db.exec('set role service_role');
 const read=async()=> (await db.query('select public.tx_load_coordination() as payload')).rows[0].payload;
 const commit=(version,state,events)=> db.query('select public.tx_commit_coordination($1,$2::jsonb,$3::jsonb)',[version,JSON.stringify(state),JSON.stringify(events)]);
 let snapshot=await read(); assert.equal(snapshot.version,1);
 let events=applyCoordination(snapshot.state,a,{type:'substitution.request',shiftId:'original',from:'2026-09-28T16:30',reason:'Private'},new Date('2026-09-28T12:00:00Z'));
 await commit(snapshot.version,snapshot.state,events);
 snapshot=await read(); const request=snapshot.state.substitutions[0];assert.equal(request.status,'pending');
 const one=structuredClone(snapshot.state),two=structuredClone(snapshot.state);
 const ev1=applyCoordination(one,b,{type:'substitution.accept',id:request.id},new Date('2026-09-28T12:00:00Z'));
 const ev2=applyCoordination(two,c,{type:'substitution.accept',id:request.id},new Date('2026-09-28T12:00:00Z'));
 const concurrent=await Promise.allSettled([commit(snapshot.version,one,ev1),commit(snapshot.version,two,ev2)]);
 assert.equal(concurrent.filter(x=>x.status==='fulfilled').length,1);assert.match(concurrent.find(x=>x.status==='rejected').reason.message,/TX_CONFLICT/);
 snapshot=await read();assert.equal(snapshot.version,3);assert.equal(snapshot.state.shifts.filter(sh=>sh.substitutionId===request.id).length,1);
 assert.equal(snapshot.state.substitutions[0].originalShift.end,'2026-09-28T18:00');
 const eventCount=(await db.query('select count(*)::int n from public.tx_coordination_events')).rows[0].n;
 const invalid=structuredClone(snapshot.state);invalid.substitutions[0].status='pending';invalid.shifts[0].end='2026-09-28T19:00';
 await assert.rejects(commit(snapshot.version,invalid,[]),/TX_TERMINAL_SUBSTITUTION/);
 let after=await read();assert.equal(after.version,snapshot.version);assert.deepEqual(after.state.shifts,snapshot.state.shifts);
 const brokenEvent={id:'invalid-uuid'};
 await assert.rejects(commit(snapshot.version,snapshot.state,[brokenEvent]),/uuid/);
 after=await read();assert.equal(after.version,snapshot.version);assert.equal((await db.query('select count(*)::int n from public.tx_coordination_events')).rows[0].n,eventCount);
 // History cannot be changed or removed by the service role used in the application.
 await assert.rejects(db.query("update public.tx_coordination_events set event='{}'"),/permission denied/);
 await assert.rejects(db.query('delete from public.tx_coordination_events'),/permission denied/);
 // Old entries omitted from the lightweight state are preserved in separate tables.
 const omitted=structuredClone(snapshot.state);omitted.substitutions=[];
 await commit(snapshot.version,omitted,[]);
 assert.equal((await db.query('select count(*)::int n from public.tx_substitutions')).rows[0].n,1);
 // Unlike the old bounded audit array, durable history keeps records beyond 3000.
 await db.query(`insert into public.tx_coordination_events(id,event) select v.id,jsonb_build_object('id',v.id,'at',now(),'type','test','actorId','a','recordId',i,'before',null,'after',null) from generate_series(1,3010) i cross join lateral (select gen_random_uuid() id where i>0) v`);
 assert.equal((await db.query('select count(*)::int n from public.tx_coordination_events')).rows[0].n,eventCount+3010);
 const page1=(await db.query('select sequence,event from public.tx_coordination_events order by sequence desc limit 50')).rows;
 const page2=(await db.query('select sequence,event from public.tx_coordination_events where sequence<$1 order by sequence desc limit 50',[page1[49].sequence])).rows;
 assert.equal(new Set([...page1,...page2].map(e=>e.event.id)).size,100);
 await db.close();
 console.log('PASS: real local PostgreSQL migration preserves records, RLS without new policies, browser denial, service-only RPC, atomic rollback, two-acceptance conflict, immutable history >3000, paginated retention.');
})().catch(error=>{console.error(error);process.exitCode=1;});
