import {type Item, type State, isAdmin} from './model';

export const reservationTypes = ['MONOVOLUMEN', 'ADAPTADO'] as const;
export const isReservationUser = (u: Item) => u.role === 'reservation';
export const canReserve = (u: Item, kind: string) => u.status === 'active' && isReservationUser(u) && Array.isArray(u.reservationTypes) && u.reservationTypes.includes(kind);
const fail = (message: string): never => { throw Error(message); };
const text = (value: unknown, max: number, required = true) => {
  if (typeof value !== 'string' || value.length > max || (required && !value.trim())) return fail('Revisa los campos de la reserva.');
  return value.trim();
};
export function reservationView(s: State, u: Item) {
  if (isAdmin(u)) return s.reservations || [];
  if (!isReservationUser(u)) return [];
  return (s.reservations || []).filter(r => r.assignedTo === u.id || (r.status === 'pending' && r.published && canReserve(u, r.kind))).map(r => {
    const {id, start, pickup, destination, kind, observations, customerType, requirements, passengers, status, published, assignedTo, acceptedAt, confirmedAt, reconfirmationRequired, releaseRequest, revision} = r;
    return {id, start, pickup, destination, kind, observations, customerType, requirements, passengers, status, published, assignedTo, acceptedAt, confirmedAt, reconfirmationRequired, releaseRequest, revision};
  });
}
// Called only by the authenticated Edge handler. Persistence and audit are committed together
// under the existing workspace version/row lock; a stale acceptance never reaches storage.
export function applyReservations(s: State, u: Item, a: Item, clock = new Date()): Item[] | null {
  if (!String(a.type).startsWith('reservation.')) return null;
  if (u.status !== 'active') fail('Acceso no autorizado.');
  const now = clock.toISOString();
  const admin = () => { if (!isAdmin(u)) fail('Esta acción corresponde a Central.'); };
  const event = (recordId: string, before: unknown, after: unknown) => [{id: crypto.randomUUID(), at: now, actorId: u.id, actorName: u.name, type: a.type, recordId, before, after: structuredClone(after)}];
  const notify = (title: string, target: string, reservation?: Item) => s.notifications.unshift({id: crypto.randomUUID(), title, target, section: 'reservations', created: now, readBy: [], ...(reservation ? {reservationId: reservation.id, revision: reservation.revision} : {})});
  if (a.type === 'reservation.authorize') {
    admin();
    const target = s.users.find(x => x.id === a.userId);
    if (!target || target.id === u.id || target.role === 'root' || (isAdmin(target) && u.role !== 'root') || target.demo) fail('Selecciona una cuenta real sin permisos administrativos.');
    if (!['pending', 'blocked', 'active'].includes(a.status) || !Array.isArray(a.reservationTypes) || a.reservationTypes.some((v: string) => !reservationTypes.includes(v as typeof reservationTypes[number]))) fail('Autorización no válida.');
    if (a.status === 'active' && !a.reservationTypes.length) fail('Selecciona al menos una autorización.');
    if ((a.status === 'active' && !s.members.some(m => m.id === a.memberId && m.status === 'active' && !m.demo)) || (a.memberId && !s.members.some(m => m.id === a.memberId && !m.demo))) fail('Vincula la cuenta a un asociado activo del directorio.');
    const before = structuredClone(target);
    Object.assign(target!, {role: 'reservation', status: a.status, memberId: a.memberId, reservationTypes: [...new Set(a.reservationTypes)]});
    notify('Central ha actualizado tu acceso a reservas.', target!.id);
    return event(target!.id, before, target);
  }
  const list = s.reservations ||= [];
  const old = a.id ? list.find(r => r.id === a.id) : undefined;
  if (a.id && !old) fail('Reserva no encontrada.');
  if (a.type === 'reservation.save') {
    admin();
    if (old && ['completed', 'cancelled'].includes(old.status)) fail('Una reserva realizada o cancelada no se puede editar.');
    if (typeof a.start !== 'string' || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}\.\d{3}Z$/.test(a.start) || !Number.isFinite(Date.parse(a.start)) || new Date(a.start).toISOString() !== a.start || ((!old || a.start !== old.start) && Date.parse(a.start) <= clock.getTime())) fail('Selecciona una fecha y hora futuras.');
    if (!reservationTypes.includes(a.kind) || !['','abonado','particular'].includes(a.customerType || '')) fail('Tipo de reserva no válido.');
    const passengers = a.passengers === '' || a.passengers == null ? null : Number(a.passengers);
    if (passengers !== null && (!Number.isInteger(passengers) || passengers < 1 || passengers > 9)) fail('Revisa el número de pasajeros (1–9).');
    if (old?.status === 'assigned' && old.assignedTo && old.kind !== a.kind) {
      const assigned = s.users.find(x => x.id === old.assignedTo);
      if (!assigned || !canReserve(assigned, a.kind) || !s.members.some(m => m.id === assigned.memberId && m.status === 'active' && !m.demo)) fail('El asociado asignado no está autorizado para el nuevo tipo. Republica y reasigna a un asociado autorizado antes de cambiarlo. La asignación actual se conserva.');
    }
    const next = {start: a.start, pickup: text(a.pickup,300), destination: text(a.destination,300), kind: a.kind, observations: text(a.observations || '',1000,false), customerType: a.customerType || '', requirements: text(a.requirements || '',500,false), passengers};
    const changes = old ? Object.entries(next).filter(([field, value]) => (old[field] ?? (field === 'passengers' ? null : '')) !== value).map(([field, after]) => ({field, before: old[field] ?? null, after})) : [];
    // A retry or saving an unchanged form must not create a new revision, notice or mail.
    if (old && !changes.length) return [];
    if (old && a.revision && a.revision !== old.revision) fail('La reserva ha cambiado. Cierra y vuelve a abrir la edición para revisar los datos actuales.');
    // Every editable field is operational by default. Only editorial observations are minor.
    const relevant = changes.some(change => change.field !== 'observations' || a.observationsRequireReconfirmation === true);
    const before = old ? structuredClone(old) : null;
    const r: Item = old || {id: crypto.randomUUID(), status: 'pending', published: false, createdAt: now, createdBy: u.id, confirmedAt: null};
    const previousReminder = r.reminderRevision || r.revision;
    Object.assign(r, next, {revision: crypto.randomUUID(), updatedAt: now, updatedBy: u.id});
    if (!old) list.unshift(r);
    if (r.status === 'assigned' && r.assignedTo) {
      // Minor edits preserve both confirmation and the existing 24h reminder identity.
      r.reminderRevision = relevant ? r.revision : previousReminder;
      if (relevant) { r.confirmedAt = null; r.reconfirmationRequired = true; }
      notify(relevant ? 'Central ha modificado tu servicio. Revisa los datos y pulsa CONFIRMAR CAMBIO.' : 'Central ha corregido las observaciones de tu servicio. Revisa el aviso; tu confirmación se conserva.', r.assignedTo, r);
    }
    return event(r.id, before, r).map(e => ({...e, changes, requiresReconfirmation: relevant && r.status === 'assigned'}));
  }
  if (!old) fail('Selecciona una reserva.');
  const r = old!;
  const before = structuredClone(r);
  switch (a.type) {
    case 'reservation.publish':
    case 'reservation.republish':
      admin();
      if (r.status === 'completed' || (a.type === 'reservation.publish' && (r.status !== 'pending' || r.published))) fail('La reserva no se puede publicar en ese estado.');
      if (Date.parse(r.start) <= clock.getTime()) fail('Actualiza la fecha antes de publicar.');
      if (r.assignedTo) notify('Central ha republicado el servicio; ya no está asignado a ti.',r.assignedTo);
      Object.assign(r,{status:'pending',published:true,assignedTo:null,acceptedAt:null,confirmedAt:null,releaseRequest:null,reconfirmationRequired:false,reminderRevision:null,revision:crypto.randomUUID()});
      for(const associate of s.users)if(canReserve(associate,r.kind))notify('Nuevo servicio disponible · '+r.kind,associate.id);
      break;
    case 'reservation.accept':
      if (!canReserve(u,r.kind) || !s.members.some(m => m.id === u.memberId && m.status === 'active')) fail('No tienes autorización para este tipo de servicio.');
      if (a.confirm !== true) fail('Confirma que deseas aceptar el servicio.');
      if (r.status !== 'pending' || !r.published || r.assignedTo || Date.parse(r.start) <= clock.getTime()) fail('El servicio ya no está disponible.');
      Object.assign(r,{status:'assigned',published:false,assignedTo:u.id,acceptedAt:now,confirmedAt:null,releaseRequest:null,reconfirmationRequired:false,reminderRevision:null,revision:crypto.randomUUID()});
      r.reminderRevision=r.revision;r.assignmentRevision=r.revision;
      notify('Servicio asignado. Revisa Mis servicios y confirma que lo realizarás.',u.id,r);
      notify('Servicio aceptado por '+u.name,'admins'); break;
    case 'reservation.confirm':
      if (r.assignedTo !== u.id || !canReserve(u,r.kind) || r.status !== 'assigned' || r.releaseRequest || (Date.parse(r.start) <= clock.getTime() && !r.reconfirmationRequired)) fail('No puedes confirmar este servicio.');
      if (a.revision !== r.revision) fail('La reserva ha cambiado. Revisa los datos actuales antes de confirmar.');
      if (r.confirmedAt) fail('El servicio ya está confirmado.');
      r.confirmedAt=now; r.reconfirmationRequired=false; notify('Servicio confirmado por '+u.name,'admins'); break;
    case 'reservation.release':
      if (r.assignedTo !== u.id || !isReservationUser(u) || r.status !== 'assigned' || r.releaseRequest) fail('No puedes solicitar la renuncia.');
      r.releaseRequest={reason:text(a.reason,500),at:now,by:u.id};r.confirmedAt=null;
      notify('Requiere decisión de Central: '+u.name+' no puede realizar un servicio.','admins'); break;
    case 'reservation.cancel':
      admin();if (['completed','cancelled'].includes(r.status)) fail('La reserva ya está cerrada.');
      r.cancellationReason=text(a.reason,500);r.status='cancelled';r.published=false;
      if(r.assignedTo)notify('Central ha cancelado tu servicio.',r.assignedTo);break;
    case 'reservation.complete':
      admin();if(r.status!=='assigned'||r.releaseRequest)fail('Revisa la asignación y la renuncia antes de marcar realizado.');
      if(Date.parse(r.start)>clock.getTime())fail('El servicio todavía no ha comenzado.');
      r.status='completed';break;
    default: fail('Acción de reservas desconocida.');
  }
  r.updatedAt=now;r.updatedBy=u.id;
  return event(r.id,before,r);
}
