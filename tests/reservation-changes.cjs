/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const load = require('./load.cjs');
for (const directory of ['lib','supabase/functions/taximes-api']) {
  const {seed,visible} = load(directory+'/model.ts');
  const {applyReservations:act} = load(directory+'/reservations.ts');
  const admin={id:'central',name:'Central',role:'admin',status:'active'};
  const associate={id:'driver',name:'Conductor',role:'reservation',status:'active',memberId:'m',reservationTypes:['MONOVOLUMEN']};
  const now=new Date('2026-10-01T10:00:00Z');
  function fixture() {
    const s=seed(admin);s.users=[admin,structuredClone(associate)];s.members=[{id:'m',status:'active'}];
    act(s,admin,{type:'reservation.save',kind:'MONOVOLUMEN',start:'2026-10-01T12:00:00.000Z',pickup:'A',destination:'B',observations:'Nota'},now);
    const r=s.reservations[0];
    act(s,admin,{type:'reservation.publish',id:r.id},now);
    act(s,associate,{type:'reservation.accept',id:r.id,confirm:true},now);
    assert.ok(s.notifications.some(n=>n.target===associate.id&&n.reservationId===r.id&&n.title.includes('asignado')),'short-notice assignment has an immediate own notice');
    act(s,associate,{type:'reservation.confirm',id:r.id,revision:r.revision},now);
    return {s,r};
  }
  for (const patch of [{start:'2026-10-02T10:00:00.000Z'},{pickup:'C'},{destination:'D'},{requirements:'Silla de ruedas'},{passengers:6},{customerType:'abonado'},{observations:'Nueva condición',observationsRequireReconfirmation:true},{kind:'ADAPTADO'}]) {
    const {s,r}=fixture();s.users[1].reservationTypes.push('ADAPTADO');
    const before=structuredClone(r),notices=s.notifications.length;
    const events=act(s,admin,{...r,...patch,type:'reservation.save',assignedTo:'attacker'},now);
    assert.equal(r.assignedTo,associate.id);assert.equal(r.acceptedAt,before.acceptedAt);assert.equal(r.status,'assigned');
    assert.equal(r.confirmedAt,null);assert.equal(r.reconfirmationRequired,true);assert.notEqual(r.revision,before.revision);
    assert.equal(r.reminderRevision,r.revision);assert.equal(r.assignmentRevision,before.assignmentRevision);
    assert.deepEqual(events[0].before,before);assert.deepEqual(events[0].after,r);assert.equal(events[0].requiresReconfirmation,true);
    assert.equal(events[0].changes.length,1);assert.equal(s.notifications.length,notices+1);assert.equal(s.notifications[0].target,associate.id);
    assert.equal(visible(s,s.users[1]).reservations[0].reconfirmationRequired,true);
    // Retrying the same edit, even with the original revision, is a no-op.
    const after=structuredClone(s);assert.deepEqual(act(s,admin,{...before,...patch,type:'reservation.save'},now),[]);assert.deepEqual(s,after);
    assert.throws(()=>act(s,s.users[1],{type:'reservation.confirm',id:r.id,revision:before.revision},now),/ha cambiado/);
    act(s,s.users[1],{type:'reservation.confirm',id:r.id,revision:r.revision},now);
    assert.equal(r.reconfirmationRequired,false);assert.ok(r.confirmedAt);
  }
  {
    const {s,r}=fixture();const before=structuredClone(r);
    const events=act(s,admin,{...r,type:'reservation.save',observations:'Nota corregida'},now);
    assert.equal(r.confirmedAt,before.confirmedAt);assert.equal(r.reconfirmationRequired,false);assert.equal(r.reminderRevision,before.reminderRevision);
    assert.equal(events[0].requiresReconfirmation,false);assert.equal(events[0].changes[0].field,'observations');
    assert.throws(()=>act(s,admin,{...before,type:'reservation.save',pickup:'Stale'},now),/ha cambiado/);
    act(s,admin,{...r,type:'reservation.save',pickup:'Nueva recogida'},now);
    act(s,admin,{...r,type:'reservation.save',observations:'Otra corrección'},now);
    assert.equal(r.confirmedAt,null);assert.equal(r.reconfirmationRequired,true,'minor edit does not clear a pending reconfirmation');
  }
  {
    const {s,r}=fixture(),before=structuredClone(s);
    assert.throws(()=>act(s,admin,{...r,type:'reservation.save',kind:'ADAPTADO'},now),/Republica y reasigna/);
    assert.deepEqual(s,before,'incompatible type leaves assignment, audit input and notices untouched');
    for(const status of ['cancelled','completed']) {
      r.status=status;const frozen=structuredClone(s);
      assert.throws(()=>act(s,admin,{...r,type:'reservation.save',observations:'No'},now),/realizada o cancelada/);assert.deepEqual(s,frozen);
    }
  }
  {
    const {s,r}=fixture();
    act(s,admin,{...r,type:'reservation.save',observations:'Corrección tras el inicio'},new Date('2026-10-01T12:30:00Z'));
    assert.equal(r.assignedTo,associate.id,'still editable until completed/cancelled');
    act(s,admin,{...r,type:'reservation.save',pickup:'Cambio en curso'},new Date('2026-10-01T12:30:00Z'));
    act(s,associate,{type:'reservation.confirm',id:r.id,revision:r.revision},new Date('2026-10-01T12:31:00Z'));
    assert.ok(r.confirmedAt,'changes to an ongoing assigned service can be reconfirmed');
  }
}
console.log('PASS: assigned edit preserves owner; all operational fields invalidate confirmation; minor edits preserve confirmation/reminder; incompatible type and stale confirmation rejected; no-op retry creates no audit or notice; closed states blocked (client/Edge).');
