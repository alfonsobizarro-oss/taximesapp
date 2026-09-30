/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const load = require('./load.cjs');
for (const directory of ['lib', 'supabase/functions/taximes-api']) {
  const {seed, visible} = load(directory + '/model.ts');
  const {coveringShifts} = load(directory + '/advisers.ts');
  const {apply} = load(directory + '/actions.ts');
  const root = {id:'root', name:'Root', role:'root', status:'active'};
  const admin = {id:'admin', name:'Admin', role:'admin', status:'active'};
  const adviser = {id:'adviser', name:'Adviser', role:'delegate', status:'active'};
  const newcomer = {id:'new', name:'New', role:'pending', status:'pending'};
  const s = seed(root); s.users = [root, admin, adviser];
  s.members = [{id:'real',status:'active'}, {id:'inactive',status:'inactive'}, {id:'demo',status:'active',demo:true}];
  apply(s, newcomer, {type:'register', name:'New', role:'root',status:'active',reservationTypes:['ADAPTADO']});
  assert.equal(newcomer.role,'pending'); assert.equal(newcomer.status,'pending');
  assert.equal(visible(s,newcomer),null);
  const update = (actor, values={}) => apply(s,actor,{type:'user.update',id:'new',role:'delegate',status:'active',...values});
  assert.throws(()=>update(newcomer)); assert.throws(()=>update(adviser));
  assert.throws(()=>update(admin,{role:'pending'}));
  assert.throws(()=>update(admin,{role:'root'}));
  assert.throws(()=>update(admin,{role:'admin'}));
  assert.throws(()=>update(root,{id:'root'}));
  assert.throws(()=>update(admin,{id:'admin'}));
  assert.throws(()=>update(admin,{id:'root'}));
  for (const types of [[],['UNKNOWN'],null]) assert.throws(()=>update(admin,{role:'reservation',memberId:'real',reservationTypes:types}));
  for (const memberId of ['', 'missing', 'inactive', 'demo']) assert.throws(()=>update(admin,{role:'reservation',memberId,reservationTypes:['MONOVOLUMEN']}));
  for (const types of [['MONOVOLUMEN'],['ADAPTADO'],['MONOVOLUMEN','ADAPTADO']]) {
    const events=update(admin,{role:'reservation',memberId:'real',reservationTypes:types});
    assert.equal(events[0].type,'reservation.authorize');
    assert.deepEqual(newcomer.reservationTypes,types);
    assert.equal(newcomer.role,'reservation'); assert.equal(newcomer.memberId,'real');
    for (const type of ['chat.send','shift.create','adviser.status','member.edit','import','document.read','poll.vote','user.update','categories','reservation.authorize','reservation.save']) assert.throws(()=>apply(s,newcomer,{type}));
    s.shifts=[{userId:newcomer.id,start:'2026-10-01T08:00',end:'2026-10-01T10:00',status:'confirmed'}];
    assert.deepEqual(coveringShifts(s),[],'Associated users must not provide staff coverage');
    const view=visible(s,newcomer);
    for (const key of ['members','incidents','messages','documents','shifts','polls','audit','coverageRequests','adviserStatuses','substitutions']) assert.deepEqual(view[key],[]);
    assert.equal(view.users.length,1); assert.equal(view.reservationMail,undefined);
  }
  s.notifications=[{id:'own',section:'reservations',target:'new',readBy:[]},{id:'other',section:'reservations',target:'adviser',readBy:[]},{id:'global',section:'reservations',target:'all',readBy:[]},{id:'staff',section:'chat',target:'new',readBy:[]}];
  apply(s,newcomer,{type:'notification.read'});
  assert.deepEqual(s.notifications.map(n=>n.readBy),[['new'],[],[],[]]);
  assert.deepEqual(visible(s,newcomer).notifications.map(n=>n.id),['own']);
  update(admin,{role:'reservation',status:'blocked',memberId:'real',reservationTypes:['ADAPTADO']});
  assert.equal(visible(s,newcomer),null);
  assert.throws(()=>apply(s,newcomer,{type:'register',name:'Bypass'}));
  assert.throws(()=>apply(s,newcomer,{type:'reservation.accept',id:'x',confirm:true}));
  update(admin); assert.equal(newcomer.role,'delegate');
  assert.equal(newcomer.memberId,undefined); assert.equal(newcomer.reservationTypes,undefined);
  update(root,{role:'admin'}); assert.equal(newcomer.role,'admin');
  assert.throws(()=>update(admin));
  update(root,{role:'reservation',memberId:'real',reservationTypes:['ADAPTADO']});
  assert.equal(newcomer.role,'reservation');
  assert.deepEqual(root,{id:'root',name:'Root',role:'root',status:'active'});
}
console.log('PASS user profiles: pending registration, explicit approval, role permissions, root protection, real directory link, authorization types, isolated state/actions/notices, blocked access and profile transitions (client/Edge parity).');
