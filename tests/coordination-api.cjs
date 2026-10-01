/* eslint-disable @typescript-eslint/no-require-imports */
const assert=require('node:assert/strict');
const fs=require('node:fs');
const path=require('node:path');
const ts=require('typescript');
const load=require('./load.cjs');
const {seed}=load('lib/model.ts');
const {madridMinute,addMinutes}=load('lib/advisers.ts');
const a={id:'a',name:'Asesor 538',role:'delegate',status:'active'},b={id:'b',name:'Asesor 620',role:'delegate',status:'active'},admin={id:'admin',name:'Admin',role:'admin',status:'active'};
const now=madridMinute();const initial=seed(admin);initial.users=[a,b,admin];initial.shifts=[{id:'one',userId:'a',start:addMinutes(now,-60),end:addMinutes(now,60),status:'confirmed'}];
let state=structuredClone(initial), version=10, commitCount=0, handler, loadedCalls=[], account=a, authError=false, confirmed=true;
const backend={auth:{getUser:async()=>({data:{user:authError?null:{...account,email_confirmed_at:confirmed?'yes':null,user_metadata:{name:'New account',role:'root',status:'active',reservationTypes:['MONOVOLUMEN','ADAPTADO']}}},error:authError})},
 rpc:async(name,args)=>{loadedCalls.push(name);if(name==='tx_load_reservations')return {data:{state:structuredClone(state),version,initialized:true}};
 assert.equal(name,'tx_commit_reservations');assert.equal(args.expected_version,version);assert.ok(Array.isArray(args.new_events));state=args.next_state;version++;commitCount++;return {data:version};},
 from:table=>{assert.equal(table,'tx_coordination_events');const query={select(){return this},order(){return this},limit(){return this},lt(){return this},then(resolve){return Promise.resolve({data:[{sequence:1,event:{id:'event',type:'shift_created'}}]}).then(resolve)}};return query;}
};
const code=ts.transpileModule(fs.readFileSync(path.join(__dirname,'../supabase/functions/taximes-api/index.ts'),'utf8'),{compilerOptions:{module:ts.ModuleKind.CommonJS,target:ts.ScriptTarget.ES2022}}).outputText;
new Function('require','Deno','exports',code)(name=>name.startsWith('npm:')?{createClient:()=>backend}:load('supabase/functions/taximes-api/'+name.slice(2)),{env:{get:()=> 'mock-local-only'},serve:fn=>{handler=fn}},{});
const call=(route='state',action=null,token=true)=>handler(new Request('http://test.local/functions/v1/taximes-api/'+route,{method:action?'POST':'GET',headers:{...(token?{Authorization:'Bearer test-only'}:{}),'Content-Type':'application/json'},...(action?{body:JSON.stringify({version,...action})}:{})}));
(async()=>{
 assert.equal((await call('state',null,false)).status,401);assert.equal(loadedCalls.length,0);
 authError=true;assert.equal((await call()).status,401);authError=false;
 confirmed=false;assert.equal((await call()).status,403);confirmed=true;
 let res=await call();let json=await res.json();assert.equal(json.capabilities.coordinationV1,true);assert.ok(json.serverTime);assert.equal(json.user.role,'delegate');
 assert.equal((await call('coordination-history')).status,403);
 assert.equal((await call('state',{type:'shift.edit',id:'one',userId:'b',start:addMinutes(now,-30),end:addMinutes(now,30)})).status,400);
 account=b;assert.equal((await call('state',{type:'shift.delete',id:'one'})).status,400);assert.equal(commitCount,0);
 account=a;assert.equal((await call('state',{type:'adviser.status',userId:'b',status:'away'})).status,400);
 assert.equal((await call('state',{type:'adviser.status',status:'busy',version:9})).status,409);
 assert.equal((await call('state',{type:'adviser.status',status:'busy'})).status,200);assert.equal(commitCount,1);assert.equal(state.adviserStatuses[0].userId,'a');
 assert.equal((await call('state',{type:'substitution.request',shiftId:'one',from:addMinutes(now,15),reason:'private',actorId:'admin'})).status,200);
 const id=state.substitutions[0].id;assert.equal(state.substitutions[0].requestedBy,'a');
 account=b;res=await call();json=await res.json();assert.equal(json.state.substitutions[0].reason,undefined);assert.equal(json.state.substitutions[0].originalShift,undefined);
 assert.equal((await call('state',{type:'substitution.accept',id})).status,200);
 assert.equal((await call('state',{type:'substitution.accept',id})).status,400);
 account={...a,status:'blocked'};state.users=state.users.map(u=>u.id==='a'?account:u);
 assert.equal((await call('state',{type:'adviser.status',status:'busy'})).status,400);assert.equal((await call('coordination-history')).status,403);
 const reserve={id:'reserve',name:'Reservas',role:'reservation',status:'active',reservationTypes:['MONOVOLUMEN'],memberId:'m'};
 state.users.push(reserve);account=reserve;
 for(const route of ['files','files/00000000-0000-0000-0000-000000000000','coordination-history','reservation-history'])assert.equal((await call(route)).status,403);
 assert.equal((await call('state',{type:'chat.send',text:'forbidden'})).status,400);
 res=await call();json=await res.json();for(const key of ['members','messages','incidents','documents','shifts','audit'])assert.deepEqual(json.state[key],[]);
 assert.equal(json.state.users.length,1);assert.equal(json.state.users[0].id,'reserve');

 // Exercise edits and reconfirmation through the real authenticated API handler.
 account=admin;state.members.push({id:'m',status:'active'});
 assert.equal((await call('state',{type:'reservation.save',kind:'MONOVOLUMEN',start:new Date(Date.now()+7200000).toISOString(),pickup:'A',destination:'B'})).status,200);
 const reservationId=state.reservations[0].id;
 assert.equal((await call('state',{type:'reservation.publish',id:reservationId})).status,200);
 account=reserve;assert.equal((await call('state',{type:'reservation.accept',id:reservationId,confirm:true})).status,200);
 const oldRevision=state.reservations[0].revision;
 assert.equal((await call('state',{type:'reservation.confirm',id:reservationId,revision:oldRevision})).status,200);
 assert.equal((await call('state',{...state.reservations[0],type:'reservation.save',pickup:'Spoof'})).status,400);
 account=admin;assert.equal((await call('state',{...state.reservations[0],type:'reservation.save',pickup:'Nueva recogida'})).status,200);
 assert.equal(state.reservations[0].assignedTo,reserve.id);assert.equal(state.reservations[0].confirmedAt,null);
 assert.equal((await call('state',{...state.reservations[0],type:'reservation.save',kind:'ADAPTADO'})).status,400);
 account=reserve;res=await call();json=await res.json();assert.equal(json.capabilities.reservationChangesV1,true);assert.equal(json.state.reservations[0].reconfirmationRequired,true);
 assert.equal((await call('state',{type:'reservation.confirm',id:reservationId,revision:oldRevision})).status,400,'refreshed workspace version cannot confirm an old reservation revision');
 assert.equal((await call('state',{type:'reservation.confirm',id:reservationId,revision:state.reservations[0].revision})).status,200);
 account=admin;res=await call('coordination-history');assert.equal(res.status,200);assert.equal((await res.json()).events[0].id,'event');
 assert.equal((await call('coordination-history?before=bad')).status,400);
 // Confirmed registration is persisted once, pending and without metadata permissions.
 account={id:'new-account',email:'new@example.test'};
 const previousCommits=commitCount;
 res=await call();json=await res.json();
 assert.equal(json.user.role,'pending');assert.equal(json.user.status,'pending');assert.equal(json.state,null);
 assert.equal(state.users.find(u=>u.id===account.id).role,'pending');assert.equal(commitCount,previousCommits+1);
 await call();assert.equal(commitCount,previousCommits+1);
 for(const route of ['files','files/00000000-0000-0000-0000-000000000000','coordination-history','reservation-history'])assert.equal((await call(route)).status,403);
 assert.equal((await call('state',{type:'user.update',id:account.id,role:'admin',status:'active'})).status,400);
 account=admin;
 assert.equal((await call('state',{type:'user.update',id:'new-account',role:'reservation',status:'active',memberId:'missing',reservationTypes:['MONOVOLUMEN']})).status,400);
 state.members.push({id:'real-member',status:'active'});
 assert.equal((await call('state',{type:'user.update',id:'new-account',role:'reservation',status:'active',memberId:'real-member',reservationTypes:['MONOVOLUMEN']})).status,200);
 account={id:'new-account'};res=await call();json=await res.json();assert.equal(json.user.role,'reservation');assert.deepEqual(json.state.members,[]);
 const beforeDenied=commitCount;
 for(const type of ['chat.send','shift.create','adviser.status','member.edit','import','document.read','poll.vote','user.update'])assert.equal((await call('state',{type})).status,400);
 assert.equal((await call('files',{type:'upload'})).status,403);assert.equal(commitCount,beforeDenied);
 assert.ok(loadedCalls.every(name=>['tx_load_reservations','tx_commit_reservations'].includes(name)));
 console.log('PASS: actual Edge handler with local backend double — JWT/account checks, metadata ignored, authoritative roles, API ownership, capability flag, version conflicts, private reasons and admin-only history.');
})().catch(error=>{console.error(error);process.exitCode=1});
