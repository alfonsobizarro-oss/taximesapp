import {isAdmin, type Item, type State} from './model.ts';
import {advisersNow, madridMinute, nextMinute} from './advisers.ts';
import {validLocalDateTime} from './schedule.ts';

export type CoordinationEvent = {id: string; at: string; actorId: string; actorName: string; type: string; recordId: string; before: Item | null; after: Item | null};
export class CoordinationError extends Error {}
const fail = (message: string): never => {throw new CoordinationError(message);};
const clone = (value: Item | null) => value ? structuredClone(value) : null;
const roles = ['root', 'admin', 'delegate'];
export function applyCoordination(s: State, user: Item, action: Item, clock = new Date()): CoordinationEvent[] | null {
  if (!/^(shift\.|substitution\.|adviser\.status$|coverage\.claim$)/.test(String(action.type))) return null;
  if (user.status !== 'active' || !roles.includes(user.role)) fail('Acceso no autorizado.');
  s.substitutions ??= []; s.adviserStatuses ??= [];
  const events: CoordinationEvent[] = [], at = clock.toISOString(), local = madridMinute(clock), earliest = nextMinute(clock);
  const event = (type: string, recordId: string, before: Item | null, after: Item | null) => events.push({id: crypto.randomUUID(), at, actorId: user.id, actorName: user.name, type, recordId, before: clone(before), after: clone(after)});
  const shift = (id: string) => s.shifts.find(sh => sh.id === id) || fail('Horario no encontrado.');
  const request = (id: string) => s.substitutions!.find(r => r.id === id) || fail('Solicitud no encontrada.');
  const manages = (sh: Item) => {if (sh.userId !== user.id && !isAdmin(user)) fail('No puedes modificar horarios ajenos.');};
  const activeUser = (id: string) => s.users.find(u => u.id === id && u.status === 'active' && roles.includes(u.role)) || fail('Asesor no válido.');
  const validTimes = (start: string, end: string) => {
    if (typeof start !== 'string' || typeof end !== 'string' || !validLocalDateTime(start) || !validLocalDateTime(end) || end <= start || Date.parse(end + ':00Z') - Date.parse(start + ':00Z') > 86400000) fail('El horario debe durar entre 1 minuto y 24 horas.');
  };
  const invalidatePending = (id: string) => {
    for (const r of s.substitutions!.filter(r => r.shiftId === id && r.status === 'pending')) {
      const before = clone(r); Object.assign(r, {status: 'cancelled', cancelledAt: at, cancelledBy: user.id, cancellationReason: 'Horario modificado o cancelado'});
      event('substitution_cancelled', r.id, before, r);
    }
  };
  const resetStatus = (id: string, until = local) => {
    const saved = s.adviserStatuses!.find(row => row.userId === id);
    if (saved && saved.until > until) {const before = clone(saved); saved.until = until; event('adviser_status_changed', id, before, saved);}
  };
  const addShift = (userId: string, start: string, end: string, extra: Item = {}) => {
    activeUser(userId); validTimes(start, end);
    const sh = {id: crypto.randomUUID(), userId, start, end, status: 'confirmed', createdAt: at, createdBy: user.id, ...extra};
    s.shifts.push(sh); event('shift_created', sh.id, null, sh); return sh;
  };
  const beforeNow = advisersNow(s, local).people.length;
  switch (action.type) {
    case 'shift.create': {
      const target = action.userId || user.id;
      if (target !== user.id && !isAdmin(user)) fail('Solo Administración puede asignar horarios a otro Asesor.');
      addShift(target, action.start, action.end); break;
    }
    case 'shift.edit': {
      const sh = shift(action.id); manages(sh);
      if (sh.status === 'cancelled') fail('El horario está cancelado.');
      const target = action.userId || sh.userId;
      if (target !== sh.userId && !isAdmin(user)) fail('No puedes reasignar tu horario a otra persona.');
      activeUser(target); validTimes(action.start, action.end);
      if (sh.handoffAt && action.end > sh.handoffAt) fail('No puedes ampliar el tramo original después del relevo. Modifica el tramo de sustitución.');
      const before = clone(sh); invalidatePending(sh.id); resetStatus(sh.userId);
      Object.assign(sh, {userId: target, start: action.start, end: action.end, status: 'confirmed', updatedAt: at, updatedBy: user.id});
      event('shift_updated', sh.id, before, sh); break;
    }
    case 'shift.delete': {
      const sh = shift(action.id); manages(sh);
      if (sh.status === 'cancelled') fail('El horario ya está cancelado.');
      const before = clone(sh); invalidatePending(sh.id); resetStatus(sh.userId);
      Object.assign(sh, {status: 'cancelled', cancelledAt: at, cancelledBy: user.id});
      event('shift_cancelled', sh.id, before, sh); break;
    }
    // Keep compatibility with existing cancellation requests during the transition.
    case 'shift.cancelRequest': {
      const sh = shift(action.id); manages(sh);
      if (sh.status !== 'confirmed' || typeof action.reason !== 'string' || !action.reason.trim() || action.reason.length > 500) fail('Revisa la solicitud de cancelación.');
      const before = clone(sh); Object.assign(sh, {status: 'cancel_requested', reason: action.reason.trim()});
      event('shift_cancellation_requested', sh.id, before, sh); break;
    }
    case 'shift.cancelDecision': {
      if (!isAdmin(user)) fail('Esta acción corresponde a Administración.');
      const sh = shift(action.id);
      if (sh.status !== 'cancel_requested' || typeof action.approve !== 'boolean') fail('No hay una solicitud pendiente válida.');
      const before = clone(sh);
      if (action.approve) {invalidatePending(sh.id); resetStatus(sh.userId);}
      Object.assign(sh, {status: action.approve ? 'cancelled' : 'confirmed', updatedAt: at, updatedBy: user.id});
      event(action.approve ? 'shift_cancelled' : 'shift_cancellation_rejected', sh.id, before, sh); break;
    }
    case 'adviser.status': {
      if (action.userId && action.userId !== user.id) fail('Solo puedes cambiar tu propio estado.');
      if (!['available', 'busy', 'away'].includes(action.status)) fail('Estado no válido.');
      const person = advisersNow(s, local).people.find(p => p.userId === user.id) || fail('Debes tener un horario activo para cambiar de estado.');
      const old = s.adviserStatuses.find(row => row.userId === user.id) || null;
      const next = {userId: user.id, status: action.status, updatedAt: at, updatedLocal: local, until: person.until, shiftIds: s.shifts.filter(sh => sh.userId === user.id && sh.status !== 'cancelled' && sh.end > local && sh.start < person.until).map(sh => sh.id)};
      event('adviser_status_changed', user.id, old, next);
      s.adviserStatuses = [...s.adviserStatuses.filter(row => row.userId !== user.id), next]; break;
    }
    case 'substitution.request': {
      const sh = shift(action.shiftId); manages(sh);
      if (sh.status !== 'confirmed' || sh.start > local || sh.end <= earliest) fail('Selecciona un horario activo confirmado.');
      if (typeof action.from !== 'string' || !validLocalDateTime(action.from) || action.from < earliest || action.from >= sh.end) fail('La sustitución debe empezar dentro del tramo, sin retroceder en el tiempo.');
      if (s.substitutions.some(r => r.shiftId === sh.id && r.status === 'pending')) fail('Este horario ya tiene una solicitud pendiente.');
      if (action.reason != null && (typeof action.reason !== 'string' || action.reason.length > 500)) fail('El motivo admite hasta 500 caracteres.');
      const r = {id: crypto.randomUUID(), shiftId: sh.id, requestedBy: user.id, adviserId: sh.userId, from: action.from, end: sh.end, reason: action.reason?.trim() || '', status: 'pending', requestedAt: at, originalShift: clone(sh)};
      s.substitutions.push(r); event('substitution_requested', r.id, null, r); break;
    }
    case 'substitution.cancel': {
      const r = request(action.id);
      if (r.adviserId !== user.id && !isAdmin(user)) fail('No puedes cancelar solicitudes ajenas.');
      if (r.status !== 'pending') fail('Solo se pueden cancelar solicitudes pendientes.');
      const before = clone(r); Object.assign(r, {status: 'cancelled', cancelledBy: user.id, cancelledAt: at});
      event('substitution_cancelled', r.id, before, r); break;
    }
    case 'substitution.accept': {
      const r = request(action.id), sh = shift(r.shiftId);
      if (r.status !== 'pending' || sh.status !== 'confirmed' || sh.end !== r.end || sh.userId !== r.adviserId || sh.start !== r.originalShift.start) fail('La solicitud ha cambiado. Actualiza el cuadrante.');
      if (action.userId && action.userId !== user.id) fail('Debes aceptar la sustitución con tu propia cuenta.');
      if (r.adviserId === user.id) fail('No puedes aceptar tu propia sustitución.');
      const from = r.from > earliest ? r.from : earliest;
      if (from >= r.end) fail('El tramo de sustitución ya ha terminado.');
      activeUser(user.id);
      // Overlaps are valid in the existing schedule; duplicate people are counted once.
      // Version locking in tx_commit_coordination makes this operation indivisible.
      const beforeRequest = clone(r), beforeShift = clone(sh);
      const replacement = addShift(user.id, from, r.end, {substitutionId: r.id, replacesShiftId: sh.id, replacesUserId: sh.userId});
      Object.assign(sh, {end: from, handoffAt: from, originalStart: sh.originalStart || sh.start, originalEnd: sh.originalEnd || beforeShift!.end, updatedAt: at, updatedBy: user.id});
      Object.assign(r, {status: 'accepted', acceptedBy: user.id, acceptedAt: at, effectiveFrom: from, replacementShiftId: replacement.id});
      resetStatus(sh.userId, from);
      event('shift_handoff', sh.id, beforeShift, sh); event('substitution_accepted', r.id, beforeRequest, r); break;
    }
    case 'coverage.claim': {
      if (action.userId && action.userId !== user.id) fail('Solo puedes apuntarte con tu cuenta.');
      if (advisersNow(s, local).people.length) fail('La cobertura ha cambiado: ya hay un Asesor. Puedes apuntarte desde el Cuadrante.');
      addShift(user.id, earliest, action.end); break;
    }
    default: fail('Acción de coordinación desconocida.');
  }
  if (beforeNow && !advisersNow(s, local).people.length) event('coverage_gap', local, null, {since: local});
  for (const e of events.filter(e => ['substitution_requested', 'substitution_accepted', 'substitution_cancelled'].includes(e.type))) {
    s.notifications.unshift({id: crypto.randomUUID(), title: e.type === 'substitution_requested' ? 'Se necesita sustituto' : e.type === 'substitution_accepted' ? 'Sustitución aceptada' : 'Solicitud de sustitución cancelada', target: 'all', section: 'home', created: at, readBy: [], eventType: e.type, recordId: e.recordId});
  }
  s.notifications = s.notifications.slice(0, 2000);
  s.audit.unshift({id: crypto.randomUUID(), type: action.type, author: user.name, created: at, record: action.id || action.shiftId || ''});
  s.audit = s.audit.slice(0, 3000);
  return events;
}
