/* eslint-disable @typescript-eslint/no-require-imports -- Standalone Node test runner, matching the existing test suite. */
const assert = require('node:assert/strict');
const load = require('./load.cjs');
const model = load('lib/model.ts');
const {apply} = load('lib/actions.ts');
const {dayCoverage, draftTimes, shiftControls, clockLabel} = load('lib/schedule.ts');
const rootUser = {id: 'root', name: 'Root', role: 'root', status: 'active'};
const admin = {id: 'admin', name: 'Admin', role: 'admin', status: 'active'};
const advisor = {id: 'a', name: 'Asesor 538', role: 'delegate', status: 'active'};
const other = {id: 'b', name: 'Asesor 620', role: 'delegate', status: 'active'};
const day = '2026-09-28';
const shift = (userId, start, end, status = 'confirmed') => ({id: `${userId}-${start}-${end}`, userId, start: day + 'T' + start, end: day + 'T' + end, status});
const compact = periods => periods.map(p => [clockLabel(p.start), clockLabel(p.end), p.userIds.join('/')]);
assert.deepEqual(compact(dayCoverage([], day)), [['00:00', '24:00', '']]);
const shifts = [shift('a', '06:00', '10:00'), shift('b', '11:30', '15:00'), shift('c', '11:30', '15:00')];
assert.deepEqual(compact(dayCoverage(shifts, day)), [
  ['00:00', '06:00', ''], ['06:00', '10:00', 'a'], ['10:00', '11:30', ''],
  ['11:30', '15:00', 'b/c'], ['15:00', '24:00', ''],
]);
assert.deepEqual(compact(dayCoverage([shift('a', '07:30', '11:00'), shift('b', '09:15', '12:00')], day)), [
  ['00:00', '07:30', ''], ['07:30', '09:15', 'a'], ['09:15', '11:00', 'a/b'], ['11:00', '12:00', 'b'], ['12:00', '24:00', ''],
]);
// Adjacent intervals must not introduce gaps; repeated/overlapping entries must not double-count advisors.
assert.deepEqual(compact(dayCoverage([shift('a', '06:00', '10:00'), shift('a', '10:00', '12:00'), shift('a', '08:00', '11:00')], day)), [
  ['00:00', '06:00', ''], ['06:00', '12:00', 'a'], ['12:00', '24:00', ''],
]);
assert.deepEqual(compact(dayCoverage([shift('a', '06:00', '10:00', 'cancelled')], day)), [['00:00', '24:00', '']]);
assert.equal(dayCoverage([shift('a', '06:00', '10:00', 'cancel_requested')], day)[1].userIds[0], 'a');
const overnight = {id: 'night', userId: 'a', start: '2026-09-27T23:30', end: day + 'T07:15', status: 'confirmed'};
assert.deepEqual(compact(dayCoverage([overnight], day)), [['00:00', '07:15', 'a'], ['07:15', '24:00', '']]);
assert.deepEqual(compact(dayCoverage([{...overnight, start: day + 'T00:00', end: '2026-09-29T00:00'}], day)), [['00:00', '24:00', 'a']]);
assert.deepEqual(compact(dayCoverage([{...overnight, start: 'invalid'}], day)), [['00:00', '24:00', '']]);
assert.deepEqual(compact(dayCoverage([{...overnight, start: '2026-02-30T00:00'}], day)), [['00:00', '24:00', '']]);
const draft = {day, startTime: '07:30', endTime: '11:00', nextDay: false, userId: 'a'};
assert.deepEqual(draftTimes(draft), {start: day + 'T07:30', end: day + 'T11:00', duration: 210});
for (const patch of [{startTime: ''}, {endTime: '24:00'}, {day: '2026-02-30'}, {endTime: '07:30'}, {endTime: '06:00'}, {nextDay: true, endTime: '08:00'}]) assert.equal(draftTimes({...draft, ...patch}), null);
assert.equal(draftTimes({...draft, startTime: '22:45', endTime: '00:15', nextDay: true}).duration, 90);
assert.equal(draftTimes({...draft, endTime: '07:31'}).duration, 1);
assert.equal(draftTimes({...draft, endTime: '07:30', nextDay: true}).duration, 1440);
assert.equal(draftTimes({...draft, day: '2026-12-31', startTime: '23:00', endTime: '00:15', nextDay: true}).end, '2027-01-01T00:15');
// Match the existing wall-clock coverage convention across DST dates, regardless of the machine timezone.
for (const zone of ['UTC', 'Europe/Madrid', 'America/Los_Angeles']) {
  process.env.TZ = zone;
  assert.equal(draftTimes({...draft, day: '2026-10-25'}).duration, 210);
  assert.equal(draftTimes({...draft, day: '2026-03-29'}).duration, 210);
  const weekShifts = [...shifts, overnight];
  const dailyUncovered = Array.from({length: 7}, (_, i) => dayCoverage(weekShifts, model.dateAdd(day, i)))
    .flat().filter(p => !p.userIds.length).reduce((n, p) => n + p.end - p.start, 0);
  assert.equal(dailyUncovered, 10080 - model.coverage(weekShifts, day).minutes);
}
const state = model.seed(rootUser); state.users.push(admin, advisor, other); state.shifts = [];
apply(state, advisor, {type: 'shift.create', ...draftTimes(draft)});
apply(state, advisor, {type: 'shift.create', start: day + 'T15:15', end: day + 'T18:45'});
assert.equal(state.shifts.length, 2);
assert.equal(state.shifts[0].start, day + 'T07:30');
assert.equal(state.shifts[1].userId, advisor.id);
const own = state.shifts[0];
assert.throws(() => apply(state, advisor, {type: 'shift.create', userId: other.id, start: day + 'T08:00', end: day + 'T09:00'}), /Administración|ajenos/);
apply(state, admin, {type: 'shift.create', userId: other.id, start: day + 'T08:00', end: day + 'T09:00'});
const theirs = state.shifts[2];
assert.throws(() => apply(state, advisor, {type: 'shift.edit', id: theirs.id, userId: advisor.id, start: day + 'T09:00', end: day + 'T10:00'}), /Administración|ajenos/);
assert.throws(() => apply(state, advisor, {type: 'shift.cancelRequest', id: theirs.id, reason: 'No autorizado'}), /No puedes/);
assert.throws(() => apply(state, advisor, {type: 'shift.cancelDecision', id: theirs.id, approve: true}), /Administración|ajenos/);
// New server enforces ownership; old backend capabilities keep the prior UI until rollout.
apply(state, advisor, {type: 'shift.edit', id: own.id, start: day + 'T09:00', end: day + 'T10:00'});
assert.deepEqual(shiftControls(advisor, own), {edit: false, delete: false, requestCancellation: true, decideCancellation: false});
assert.deepEqual(shiftControls(advisor, own, true), {edit: true, delete: true, requestCancellation: false, decideCancellation: false});
assert.deepEqual(shiftControls(advisor, theirs, true), {edit: false, delete: false, requestCancellation: false, decideCancellation: false});
assert.throws(() => apply(state, advisor, {type: 'shift.delete', id: theirs.id}), /ajenos/);
assert.equal(shiftControls(admin, theirs).edit, true);
assert.equal(shiftControls(rootUser, theirs).edit, true);
assert.equal(shiftControls({...advisor, status: 'blocked'}, own).requestCancellation, false);
apply(state, admin, {type: 'shift.edit', id: own.id, userId: advisor.id, start: day + 'T09:30', end: day + 'T11:45'});
assert.equal(own.start, day + 'T09:30');
apply(state, advisor, {type: 'shift.cancelRequest', id: own.id, reason: 'Prueba local'});
assert.equal(own.status, 'cancel_requested');
assert.equal(shiftControls(admin, own).decideCancellation, true);
apply(state, admin, {type: 'shift.cancelDecision', id: own.id, approve: true});
assert.equal(own.status, 'cancelled');
assert.equal(shiftControls(admin, own).edit, false);
assert.ok(state.audit.some(a => a.type === 'shift.create'));
assert.ok(state.audit.some(a => a.type === 'shift.edit'));
assert.ok(state.audit.some(a => a.type === 'shift.cancelDecision'));
console.log('PASS: free times, multiple slots, midnight/year boundaries, overlaps, gaps, DST wall-clock consistency, roles and existing audit.');
apply(state, advisor, {type: 'shift.delete', id: state.shifts[1].id});
assert.equal(state.shifts[1].status, 'cancelled');
console.log('PASS: own edit/soft delete, foreign edit/delete denied, capability rollout guard.');
