"use client";

import {useEffect, useState} from 'react';
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from '@/components/ui/dialog';
import {advisersNow, addMinutes, madridMinute, nextMinute} from '@/lib/advisers';
import {isAdmin, type Item, type State} from '@/lib/model';

type Props = {
  state: State; user: Item; lang: string; busy: boolean; ready: boolean;
  clockOffset?: number; fixedClock?: string;
  act: (action: Item) => Promise<boolean>;
  navigate: (section: string, join?: boolean) => void;
  loadHistory: (cursor?: string) => Promise<{events: Item[]; nextCursor: string | null}>;
};
type Form = {kind: 'request' | 'accept' | 'cancel' | 'cover'; id?: string; shiftId?: string; from: string; end: string; reason: string};
const statusLabels = {available: ['🟢 Disponible', '🟢 Disponible'], busy: ['🟠 Ocupado', '🟠 Ocupat'], away: ['☕ Ausente temporalmente', '☕ Absent temporalment']};
const eventLabels: Record<string, string[]> = {
  shift_baseline: ['Horario anterior a la actualización', 'Horari anterior a l’actualització'],
  shift_created: ['Horario creado', 'Horari creat'], shift_updated: ['Horario modificado', 'Horari modificat'], shift_cancelled: ['Horario cancelado', 'Horari cancel·lat'],
  shift_handoff: ['Relevo de Asesor', 'Relleu d’Assessor'], adviser_status_changed: ['Estado actualizado', 'Estat actualitzat'],
  substitution_requested: ['Sustitución solicitada', 'Substitució sol·licitada'], substitution_accepted: ['Sustitución aceptada', 'Substitució acceptada'], substitution_cancelled: ['Solicitud cancelada', 'Sol·licitud cancel·lada'],
  coverage_gap: ['Inicio de hueco sin cobertura', 'Inici de buit sense cobertura'], shift_cancellation_requested: ['Cancelación solicitada', 'Cancel·lació sol·licitada'], shift_cancellation_rejected: ['Cancelación rechazada', 'Cancel·lació rebutjada'],
};
export default function AdvisersNow({state, user, lang, busy, ready, clockOffset = 0, fixedClock, act, navigate, loadHistory}: Props) {
  const t = (es: string, ca: string) => lang === 'ca' ? ca : es;
  const [tick, setTick] = useState(() => Date.now());
  const [form, setForm] = useState<Form | null>(null);
  const [history, setHistory] = useState<Item[] | null>(null), [cursor, setCursor] = useState<string | null>(null), [historyBusy, setHistoryBusy] = useState(false), [error, setError] = useState('');
  useEffect(() => {const timer = setInterval(() => setTick(Date.now()), 1000); return () => clearInterval(timer);}, []);
  const clock = fixedClock ? new Date(fixedClock) : new Date(tick + clockOffset);
  const at = madridMinute(clock), earliest = nextMinute(clock), snapshot = advisersNow(state, at), admin = isAdmin(user);
  const person = (id: string) => {const u = state.users.find(u => u.id === id); return u ? [u.fleet, u.name].filter(Boolean).join(' · ') : t('Asesor no disponible', 'Assessor no disponible');};
  const when = (value: string | null) => !value ? t('Sin previsión', 'Sense previsió') : (value.slice(0, 10) === at.slice(0, 10) ? '' : value.slice(8, 10) + '/' + value.slice(5, 7) + ' · ') + value.slice(11, 16);
  const own = snapshot.people.find(p => p.userId === user.id);
  const activeShifts = snapshot.people.flatMap(p => p.shifts).filter(sh => (admin || sh.userId === user.id) && sh.status === 'confirmed' && sh.end > earliest);
  const pending = (state.substitutions || []).filter(r => r.status === 'pending');
  const actionable = pending.filter(r => r.end > earliest);
  const formShift = state.shifts.find(sh => sh.id === form?.shiftId);
  const formRequest = state.substitutions?.find(r => r.id === form?.id);
  const effectiveFrom = formRequest && formRequest.from > earliest ? formRequest.from : earliest;
  const counts = Object.keys(statusLabels).map(status => ({status, count: snapshot.people.filter(p => p.status === status).length}));
  const historySummary = (record: Item) => {
    const fields: [string, string][] = [['userId', t('Asesor', 'Assessor')], ['adviserId', t('Asesor original', 'Assessor original')], ['start', t('Inicio', 'Inici')], ['end', t('Final', 'Final')], ['from', t('Sustitución solicitada desde', 'Substitució sol·licitada des de')], ['effectiveFrom', t('Relevo efectivo', 'Relleu efectiu')], ['until', t('Estado hasta', 'Estat fins a')], ['status', t('Estado', 'Estat')], ['requestedBy', t('Solicitante', 'Sol·licitant')], ['acceptedBy', t('Aceptada por', 'Acceptada per')], ['cancelledBy', t('Cancelada por', 'Cancel·lada per')], ['createdBy', t('Creado por', 'Creat per')], ['updatedBy', t('Modificado por', 'Modificat per')], ['reason', t('Motivo', 'Motiu')], ['cancellationReason', t('Motivo de cancelación', 'Motiu de cancel·lació')]];
    const labels: Record<string, string> = {pending: t('Pendiente', 'Pendent'), accepted: t('Aceptada', 'Acceptada'), cancelled: t('Cancelado', 'Cancel·lat'), confirmed: t('Confirmado', 'Confirmat'), cancel_requested: t('Cancelación pendiente', 'Cancel·lació pendent'), ...Object.fromEntries(Object.entries(statusLabels).map(([key, value]) => [key, value[lang === 'ca' ? 1 : 0]]))};
    return <dl>{fields.filter(([key]) => record[key]).map(([key, label]) => {
      const value = String(record[key]);
      const display = ['userId', 'adviserId', 'requestedBy', 'acceptedBy', 'cancelledBy', 'createdBy', 'updatedBy'].includes(key) ? person(value) : ['start', 'end', 'from', 'effectiveFrom', 'until'].includes(key) ? value.slice(8, 10) + '/' + value.slice(5, 7) + '/' + value.slice(0, 4) + ' · ' + value.slice(11, 16) : key === 'status' ? labels[value] || value : value;
      return <div key={key}><dt>{label}</dt><dd>{display}</dd></div>;
    })}</dl>;
  };
  async function submit(e: React.FormEvent) {
    e.preventDefault(); if (!form || busy || !ready) return;
    const action: Item = form.kind === 'request' ? {type: 'substitution.request', shiftId: form.shiftId, from: form.from, reason: form.reason} :
      form.kind === 'cover' ? {type: 'coverage.claim', end: form.end} : {type: 'substitution.' + form.kind, id: form.id};
    if (await act(action)) setForm(null);
  }
  async function getHistory(more = false) {
    if (historyBusy) return; setHistoryBusy(true); setError('');
    try {const page = await loadHistory(more && cursor ? cursor : undefined); setHistory(old => more ? [...(old || []), ...page.events] : page.events); setCursor(page.nextCursor);}
    catch (e) {setError((e as Error).message);} finally {setHistoryBusy(false);}
  }
  function request(shiftId = activeShifts[0]?.id) {
    const sh = state.shifts.find(s => s.id === shiftId); if (!sh) return;
    setForm({kind: 'request', shiftId, from: earliest, end: sh.end, reason: ''});
  }
  return <section className="advisers-now" aria-label={t('Asesores Ahora', 'Assessors Ara')}>
    <div className={'now-hero ' + (snapshot.people.length ? 'has-cover' : 'no-cover')}>
      <p className="eyebrow">TAXIMÉS · {t('ASESORES DE FLOTA', 'ASSESSORS DE FLOTA')}</p>
      <h1>{t('ASESORES AHORA', 'ASSESSORS ARA')}</h1>
      <h2 aria-live="polite">{snapshot.people.length ? `✅ ${snapshot.people.length} ${(snapshot.people.length === 1 ? t('ASESOR EN COBERTURA', 'ASSESSOR EN COBERTURA') : t('ASESORES EN COBERTURA', 'ASSESSORS EN COBERTURA'))}` : t('🔴 SIN ASESOR AHORA', '🔴 SENSE ASSESSOR ARA')}</h2>
      <p>{t('Hora de Barcelona', 'Hora de Barcelona')} · {when(at)} · {t('Datos del Cuadrante', 'Dades del Quadrant')}</p>
      {snapshot.people.length ? <>
        <div className="now-counts">{counts.map(c => <span key={c.status}>{statusLabels[c.status as keyof typeof statusLabels][lang === 'ca' ? 1 : 0]}: <strong>{c.count}</strong></span>)}</div>
        <p>{t('Cobertura: ✅ CORRECTA · 0 huecos actuales', 'Cobertura: ✅ CORRECTA · 0 buits actuals')}</p>
        <div className="now-people">{snapshot.people.map(p => <article className={'now-person ' + p.status} key={p.userId}>
          <strong>{person(p.userId)}{p.userId === user.id ? t(' · Tú', ' · Tu') : ''}</strong>
          <span>{statusLabels[p.status as keyof typeof statusLabels]?.[lang === 'ca' ? 1 : 0]} · {t('hasta', 'fins a')} {when(p.until)}</span>
        </article>)}</div>
        <p className="now-next">{t('Próximo cambio', 'Proper canvi')}: <strong>{when(snapshot.nextChange)}</strong></p>
        <small>{t('Próximo inicio', 'Proper inici')}: {when(snapshot.nextStart)} · {t('Próximo final', 'Proper final')}: {when(snapshot.nextEnd)}</small>
      </> : <div className="now-gap">
        <p>{t('Sin cobertura desde', 'Sense cobertura des de')}: <strong>{snapshot.gapSince ? when(snapshot.gapSince) : t('Sin tramo anterior registrado', 'Sense tram anterior registrat')}</strong></p>
        <p>{t('Próxima cobertura prevista', 'Propera cobertura prevista')}: <strong>{when(snapshot.nextStart)}</strong></p>
        <button className="primary" disabled={busy || !ready} onClick={() => setForm({kind: 'cover', from: earliest, end: addMinutes(earliest, 60), reason: ''})}>{t('🙋 PUEDO CUBRIR', '🙋 PUC COBRIR')}</button>
      </div>}
    </div>

    {!ready && <p className="now-note">{t('La cobertura se puede consultar. Estados y sustituciones estarán disponibles cuando se active la actualización del servidor.', 'Pots consultar la cobertura. Els estats i les substitucions estaran disponibles quan s’activi l’actualització del servidor.')}</p>}
    {own ? <section className="now-actions"><h2>{t('Mi estado', 'El meu estat')}</h2><div className="now-status-buttons">{Object.entries(statusLabels).map(([status, labels]) => <button className={own.status === status ? 'primary' : 'secondary'} key={status} disabled={busy || !ready} aria-pressed={own.status === status} onClick={() => act({type: 'adviser.status', status})}>{labels[lang === 'ca' ? 1 : 0]}</button>)}</div><small>{t('Ocupado y Ausente siguen contando como cobertura. Fuera del horario, tu estado se desactiva automáticamente.', 'Ocupat i Absent continuen comptant com a cobertura. Fora de l’horari, l’estat es desactiva automàticament.')}</small></section> : <p className="now-note">{t('Estás fuera de horario. Puedes apuntarte al Cuadrante o aceptar una sustitución.', 'Ets fora d’horari. Pots apuntar-te al Quadrant o acceptar una substitució.')}</p>}
    {!!activeShifts.length && <button className="secondary now-wide" disabled={busy || !ready} onClick={() => request()}>{t('🔄 NECESITO SUSTITUTO', '🔄 NECESSITO SUBSTITUT')}{admin && !own ? t(' · Gestionar solicitud', ' · Gestiona una sol·licitud') : ''}</button>}

    <nav className="now-shortcuts" aria-label={t('Accesos rápidos', 'Accessos ràpids')}>
      <button className="primary now-join" onClick={() => navigate('schedule', true)}>{t('➕ APUNTARME AL CUADRANTE', '➕ APUNTAR-ME AL QUADRANT')}</button>
      {([['chat', '💬 Chat', '💬 Xat'], ['notifications', '📢 Avisos', '📢 Avisos'], ['incidents', '📋 Incidencias', '📋 Incidències'], ['schedule', '🗓️ Cuadrante', '🗓️ Quadrant'], ['documents', '📚 Documentos', '📚 Documents']] as const).map(([key, es, ca]) => <button className="secondary" key={key} onClick={() => navigate(key)}>{t(es, ca)}</button>)}
    </nav>

    <section className="now-requests"><h2>🔄 {actionable.length} {actionable.length === 1 ? t('sustitución pendiente', 'substitució pendent') : t('sustituciones pendientes', 'substitucions pendents')}</h2>
      {!pending.length && <p>{t('No hay solicitudes pendientes.', 'No hi ha sol·licituds pendents.')}</p>}
      {pending.filter(r => r.end > earliest || admin || r.adviserId === user.id).map(r => <article className="now-request" key={r.id}>
        <strong>{r.end > earliest ? t('🟠 SE NECESITA SUSTITUTO', '🟠 ES NECESSITA SUBSTITUT') : t('⌛ Horario finalizado · Pendiente de cerrar', '⌛ Horari finalitzat · Pendent de tancar')}</strong>
        <h3>{person(r.adviserId)}</h3><p>{when(r.from)} → {when(r.end)}</p>
        {r.reason && <p>{r.reason}</p>}
        {r.adviserId !== user.id && r.end > earliest && <button className="primary" disabled={busy || !ready} onClick={() => setForm({kind: 'accept', id: r.id, from: r.from, end: r.end, reason: ''})}>{t('✅ YO PUEDO CUBRIR', '✅ JO PUC COBRIR')}</button>}
        {(admin || r.adviserId === user.id) && <button className="secondary" disabled={busy || !ready} onClick={() => setForm({kind: 'cancel', id: r.id, from: r.from, end: r.end, reason: ''})}>{t('Cancelar solicitud', 'Cancel·la la sol·licitud')}</button>}
      </article>)}
    </section>

    {admin && <section className="now-admin"><h2>{t('PRÓXIMAS 6 HORAS', 'PROPERES 6 HORES')}</h2><ol className="now-timeline">{snapshot.upcoming.map(p => <li key={p.start} className={p.userIds.length ? 'covered' : 'uncovered'}><strong>{when(p.start)}–{when(p.end)}</strong><span>{p.userIds.length ? t('✅ Cubierto', '✅ Cobert') : t('🔴 SIN COBERTURA', '🔴 SENSE COBERTURA')}</span>{!!p.userIds.length && <small>{p.userIds.map(person).join(' / ')}</small>}</li>)}</ol>
      <button className="secondary now-wide" disabled={historyBusy || !ready} onClick={() => getHistory()}>{t('Consultar histórico de coordinación', 'Consulta l’històric de coordinació')}</button>
      {error && <p role="alert">{error}</p>}
      {history && <div className="now-history"><h3>{t('Histórico · Más recientes primero', 'Històric · Més recents primer')}</h3>{!history.length && <p>{t('Todavía no hay actividad registrada.', 'Encara no hi ha activitat registrada.')}</p>}{history.map(e => <details key={e.id}><summary>{eventLabels[e.type]?.[lang === 'ca' ? 1 : 0] || e.type} · {e.actorName}<small>{new Date(e.at).toLocaleString(lang === 'ca' ? 'ca-ES' : 'es-ES', {timeZone: 'Europe/Madrid'})}</small></summary><div className="now-history-detail">{[['before', t('Antes', 'Abans')], ['after', t('Después', 'Després')]].map(([key, label]) => <div key={key}><strong>{label}</strong>{e[key] ? historySummary(e[key]) : <p>—</p>}</div>)}</div></details>)}{cursor && <button className="secondary" disabled={historyBusy} onClick={() => getHistory(true)}>{t('Ver anteriores', 'Veure anteriors')}</button>}</div>}
    </section>}

    <Dialog open={!!form} onOpenChange={open => {if (!open && !busy) setForm(null);}}><DialogContent className="form-dialog now-dialog" showCloseButton={!busy}><DialogHeader>
      <DialogTitle>{form?.kind === 'request' ? t('Necesito sustituto', 'Necessito substitut') : form?.kind === 'cover' ? t('Puedo cubrir', 'Puc cobrir') : form?.kind === 'accept' ? t('Aceptar sustitución', 'Accepta la substitució') : t('Cancelar solicitud', 'Cancel·la la sol·licitud')}</DialogTitle>
      <DialogDescription>{t('Horas de Barcelona. Los cambios quedarán registrados.', 'Hores de Barcelona. Els canvis quedaran registrats.')}</DialogDescription>
    </DialogHeader>{form && <form className="modal-form" onSubmit={submit}><fieldset disabled={busy || !ready} className="schedule-fields">
      {form.kind === 'request' && <><label>{t('Horario activo', 'Horari actiu')}<select value={form.shiftId} onChange={e => request(e.target.value)}>{activeShifts.map(sh => <option key={sh.id} value={sh.id}>{person(sh.userId)} · {when(sh.start)}–{when(sh.end)}</option>)}</select></label>
        <label>{t('¿Desde cuándo necesitas sustitución?', 'Des de quan necessites substitució?')}<input type="datetime-local" step="60" required min={earliest} max={formShift ? addMinutes(formShift.end, -1) : undefined} value={form.from} onChange={e => setForm({...form, from: e.target.value})}/></label>
        <label>{t('Motivo (opcional)', 'Motiu (opcional)')}<textarea maxLength={500} value={form.reason} onChange={e => setForm({...form, reason: e.target.value})}/></label><small>{t('El motivo solo lo verán el Asesor del tramo y Administración.', 'El motiu només el veuran l’Assessor del tram i Administració.')}</small></>}
      {form.kind === 'cover' && <><p>{t('Te apuntas desde', 'T’apuntes des de')} {when(earliest)}.</p><label>{t('¿Hasta cuándo puedes cubrir?', 'Fins quan pots cobrir?')}<input type="datetime-local" step="60" required min={addMinutes(earliest, 1)} max={addMinutes(earliest, 1440)} value={form.end} onChange={e => setForm({...form, end: e.target.value})}/></label></>}
      {form.kind === 'accept' && <><p>{t('Cubrirás con tu cuenta el horario de', 'Cobriràs amb el teu compte l’horari de')} <strong>{formRequest ? person(formRequest.adviserId) : '—'}</strong>.</p><p className="schedule-form-summary">{when(effectiveFrom)} → {when(form.end)}</p><small>{t('Si ya pasó la hora solicitada, el relevo comienza en el siguiente minuto. Los solapamientos se permiten y no cuentan dos veces.', 'Si ja ha passat l’hora sol·licitada, el relleu comença al minut següent. Els solapaments es permeten i no compten dues vegades.')}</small></>}
      {form.kind === 'cancel' && <p>{t('Se cerrará la solicitud. El horario original seguirá vigente.', 'Es tancarà la sol·licitud. L’horari original continuarà vigent.')}</p>}
      <button className="primary now-wide" type="submit">{busy ? t('Guardando…', 'Desant…') : form.kind === 'request' ? t('CONFIRMAR SOLICITUD', 'CONFIRMA LA SOL·LICITUD') : t('✅ CONFIRMAR', '✅ CONFIRMA')}</button>
      <button className="secondary" type="button" onClick={() => setForm(null)}>{t('Volver', 'Torna')}</button>
    </fieldset></form>}</DialogContent></Dialog>
  </section>;
}
