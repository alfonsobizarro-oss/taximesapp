"use client";

import {useState} from 'react';
import {AlertCircle, Check, ChevronLeft, ChevronRight, Clock3, Pencil, Plus, Users} from 'lucide-react';
import {Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle} from '@/components/ui/dialog';
import {coverage, dateAdd, isAdmin, monday, type Item, type State} from '@/lib/model';
import {coveringShifts} from '@/lib/advisers';
import {clockLabel, dayCoverage, draftTimes, durationLabel, shiftControls, type ShiftDraft} from '@/lib/schedule';

type Props = {
  coordinationReady?: boolean;
  initiallyJoin?: boolean;
  state: State;
  user: Item;
  week: string;
  onWeekChange: (week: string) => void;
  lang: string;
  busy: boolean;
  act: (action: Item) => Promise<boolean>;
};

type Editor = {id?: string; draft: ShiftDraft};
export default function Schedule({state, user, week, onWeekChange, lang, busy, act, coordinationReady = false, initiallyJoin = false}: Props) {
  const t = (es: string, ca: string) => lang === 'ca' ? ca : es;
  const admin = isAdmin(user);
  const [selected, setSelected] = useState(week);
  const [editor, setEditor] = useState<Editor | null>(() => initiallyJoin ? {draft: {day: week, startTime: '', endTime: '', nextDay: false, userId: user.id}} : null);
  const [detailId, setDetailId] = useState<string | null>(null);
  const [cancelReason, setCancelReason] = useState<string | null>(null);
  const [deleteConfirm, setDeleteConfirm] = useState(false);
  const [error, setError] = useState('');
  const day = selected >= week && selected < dateAdd(week, 7) ? selected : week;
  const person = (id: string) => state.users.find(u => u.id === id)?.name || t('Asesor no disponible', 'Assessor no disponible');
  const dateLabel = (value: string, weekday = false) => new Intl.DateTimeFormat(lang === 'ca' ? 'ca-ES' : 'es-ES', {
    day: 'numeric', month: 'short', ...(weekday ? {weekday: 'long' as const} : {}), timeZone: 'UTC',
  }).format(new Date(value + 'T12:00:00Z'));
  const availableShifts = coveringShifts(state);
  const days = Array.from({length: 7}, (_, i) => {
    const date = dateAdd(week, i), periods = dayCoverage(availableShifts, date);
    const gaps = periods.filter(p => !p.userIds.length);
    return {date, periods, gaps, uncovered: gaps.reduce((sum, p) => sum + p.end - p.start, 0)};
  });
  const current = days.find(d => d.date === day)!;
  const total = coverage(availableShifts, week);
  const shifts = state.shifts.filter(s => s.status !== 'cancelled' && s.start < dateAdd(day, 1) + 'T00:00' && s.end > day + 'T00:00')
    .sort((a, b) => a.start.localeCompare(b.start) || a.end.localeCompare(b.end));
  // Resolve from live state so a refresh never leaves stale permissions in the dialog.
  const detail = state.shifts.find(s => s.id === detailId && s.status !== 'cancelled');
  const controls = detail ? shiftControls(user, detail, coordinationReady) : null;
  const draft = editor?.draft;
  const times = draft ? draftTimes(draft) : null;
  const activeUsers = state.users.filter(u => u.status === 'active' && ['root', 'admin', 'delegate'].includes(u.role));

  function create(date = day, startTime = '', endTime = '', nextDay = false) {
    setError('');
    setEditor({draft: {day: date, startTime, endTime, nextDay, userId: String(user.id)}});
  }
  function edit(shift: Item) {
    if (!shiftControls(user, shift, coordinationReady).edit) return;
    setDetailId(null); setError('');
    setEditor({id: shift.id, draft: {day: shift.start.slice(0, 10), startTime: shift.start.slice(11, 16),
      endTime: shift.end.slice(11, 16), nextDay: shift.end.slice(0, 10) !== shift.start.slice(0, 10), userId: shift.userId}});
  }
  function field<K extends keyof ShiftDraft>(key: K, value: ShiftDraft[K]) {
    setError(''); setEditor(old => old ? {...old, draft: {...old.draft, [key]: value}} : old);
  }
  async function save(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!editor || busy) return;
    if (!times) {setError(t('Revisa las horas. El tramo debe durar entre 1 minuto y 24 horas. Si termina mañana, marca «Finaliza al día siguiente».',
      'Revisa les hores. El tram ha de durar entre 1 minut i 24 hores. Si acaba demà, marca «Finalitza l’endemà».')); return;}
    const existing = editor.id ? state.shifts.find(s => s.id === editor.id) : null;
    if (editor.id && (!existing || !shiftControls(user, existing, coordinationReady).edit)) {
      setError(t('Este horario ya no se puede modificar. Cierra y actualiza el cuadrante.', 'Aquest horari ja no es pot modificar. Tanca i actualitza el quadrant.')); return;
    }
    const userId = admin ? editor.draft.userId : user.id;
    if (!activeUsers.some(u => u.id === userId)) {setError(t('Selecciona un Asesor activo.', 'Selecciona un Assessor actiu.')); return;}
    const ok = await act({type: editor.id ? 'shift.edit' : 'shift.create', ...(editor.id ? {id: editor.id} : {}), userId, start: times.start, end: times.end});
    if (ok) {
      const chosenDay = editor.draft.day;
      const weekday = new Date(chosenDay + 'T12:00:00Z').getUTCDay();
      onWeekChange(dateAdd(chosenDay, -((weekday + 6) % 7)));
      setSelected(chosenDay); setEditor(null);
    }
  }
  async function requestCancellation(event: React.FormEvent<HTMLFormElement>) {
    event.preventDefault();
    if (!detail || !controls?.requestCancellation || busy || !cancelReason?.trim()) return;
    if (await act({type: 'shift.cancelRequest', id: detail.id, reason: cancelReason.trim()})) {setCancelReason(null); setDetailId(null);}
  }
  async function decideCancellation(approve: boolean) {
    if (detail && controls?.decideCancellation && !busy && await act({type: 'shift.cancelDecision', id: detail.id, approve})) setDetailId(null);
  }

  return <section className="flex-schedule" aria-label={t('Cuadrante de Asesores de Flota', 'Quadrant d’Assessors de Flota')}>
    <div className="page-heading"><div><p className="eyebrow">{t('ASESORES DE FLOTA', 'ASSESSORS DE FLOTA')}</p>
      <h1>{t('Cuadrante flexible', 'Quadrant flexible')}</h1>
      <p>{t('Elige cuándo puedes estar. Horas de Barcelona · Cobertura 24 h.', 'Tria quan pots ser-hi. Hores de Barcelona · Cobertura 24 h.')}</p>
    </div><button className="primary schedule-join" disabled={busy || user.status !== 'active'} onClick={() => create()}><Plus size={24}/>{t('APUNTARME AL CUADRANTE', 'APUNTAR-ME AL QUADRANT')}</button></div>

    <div className="schedule-week-nav"><button className="secondary" aria-label={t('Semana anterior', 'Setmana anterior')} onClick={() => onWeekChange(dateAdd(week, -7))}><ChevronLeft/></button>
      <strong aria-live="polite">{dateLabel(week)} — {dateLabel(dateAdd(week, 6))}</strong>
      <button className="secondary" aria-label={t('Semana siguiente', 'Setmana següent')} onClick={() => onWeekChange(dateAdd(week, 7))}><ChevronRight/></button>
      <button className="secondary" onClick={() => {onWeekChange(monday()); setSelected(monday());}}>{t('Esta semana', 'Aquesta setmana')}</button>
    </div>
    <div className="schedule-summary"><span><Check size={18}/><strong>{Math.round(total.minutes / 100.8)}%</strong> {t('cubierto', 'cobert')}</span>
      <span><AlertCircle size={18}/><strong>{durationLabel(10080 - total.minutes)}</strong> {t('sin Asesor', 'sense Assessor')}</span>
      {admin && <button className="secondary" disabled={busy || !total.gaps.length} onClick={() => act({type: 'coverage.send', week})}>{t('Avisar de huecos', 'Avisa dels buits')}</button>}
    </div>

    <div className="schedule-days" aria-label={t('Seleccionar día de la semana', 'Selecciona un dia de la setmana')}>
      {days.map(d => <button key={d.date} className={'schedule-day ' + (d.date === day ? 'selected' : '')} title={`${dateLabel(d.date)} · ${durationLabel(d.uncovered)} ${t('sin Asesor', 'sense Assessor')}`} aria-pressed={d.date === day} onClick={() => setSelected(d.date)}>
        <span>{new Intl.DateTimeFormat(lang === 'ca' ? 'ca-ES' : 'es-ES', {weekday: 'short', timeZone: 'UTC'}).format(new Date(d.date + 'T12:00:00Z'))}</span>
        <strong>{Number(d.date.slice(-2))}</strong>
        <span className="schedule-mini-bar" aria-hidden="true">{d.periods.map(p => <i key={p.start} className={p.userIds.length ? 'covered' : 'uncovered'} style={{width: `${(p.end - p.start) / 14.4}%`}}/>)}</span>
        <small>{d.uncovered ? <><AlertCircle size={14}/>{durationLabel(d.uncovered)}<br/>{t('sin Asesor', 'sense Assessor')}</> : <><Check size={14}/>{t('Completo', 'Complet')}</>}</small>
      </button>)}
    </div>

    <section className="schedule-day-detail" aria-label={dateLabel(day, true)}>
      <div className="schedule-day-heading"><div><h2>{dateLabel(day, true)}</h2><p>{current.uncovered ? t('Los huecos pendientes aparecen marcados debajo.', 'Els buits pendents apareixen marcats a sota.') : t('Todo el día tiene cobertura.', 'Tot el dia té cobertura.')}</p></div>
        <button className="secondary" disabled={busy} onClick={() => create()}><Plus size={18}/>{t('Añadir horario', 'Afegeix un horari')}</button></div>
      <div className="schedule-day-bar" aria-hidden="true">{current.periods.map(p => <span key={p.start} className={p.userIds.length > 1 ? 'overlap' : p.userIds.length ? 'covered' : 'uncovered'} style={{width: `${(p.end - p.start) / 14.4}%`}}/>)}</div>
      <div className="schedule-scale" aria-hidden="true"><span>00:00</span><span>06:00</span><span>12:00</span><span>18:00</span><span>24:00</span></div>
      <ol className="schedule-periods">{current.periods.map(p => <li key={p.start} className={p.userIds.length ? 'covered' : 'uncovered'}>
        <div className="schedule-period-icon">{p.userIds.length ? p.userIds.length > 1 ? <Users size={20}/> : <Check size={20}/> : <AlertCircle size={20}/>}</div>
        <div className="schedule-period-copy"><strong>{clockLabel(p.start)}–{clockLabel(p.end)}</strong><span>{p.userIds.length ? t('Cubierto', 'Cobert') : t('SIN ASESOR', 'SENSE ASSESSOR')}</span>
          {p.userIds.length > 0 && <p>{p.userIds.map(person).join(' / ')}</p>}
          {p.userIds.length > 1 && <small>{p.userIds.length} {t('Asesores coinciden', 'Assessors coincideixen')}</small>}
        </div>
        {!p.userIds.length && <button className="secondary" disabled={busy} aria-label={`${t('Cubrir hueco', 'Cobreix el buit')} ${clockLabel(p.start)}–${clockLabel(p.end)}`} onClick={() => create(day, clockLabel(p.start), p.end === 1440 ? '00:00' : clockLabel(p.end), p.end === 1440)}><Plus size={16}/>{t('Cubrir', 'Cobreix')}</button>}
      </li>)}</ol>
    </section>

    <section className="schedule-assigned"><h2>{t('Horarios del día', 'Horaris del dia')}</h2>
      <p>{t('Toca un horario para ver sus opciones. Puedes añadir varios tramos al día.', 'Toca un horari per veure’n les opcions. Pots afegir diversos trams al dia.')}</p>
      <div className="schedule-shifts">{shifts.map(s => <button className={'schedule-shift ' + (s.userId === user.id ? 'mine' : '')} key={s.id} onClick={() => {setDetailId(s.id); setCancelReason(null); setDeleteConfirm(false);}}>
        <Clock3 size={20}/><span><strong>{s.start.slice(0, 10) < day ? '00:00' : s.start.slice(11, 16)}–{s.end.slice(0, 10) > day ? '24:00' : s.end.slice(11, 16)}</strong><span>{person(s.userId)}{s.userId === user.id ? t(' · Tú', ' · Tu') : ''}</span>
          {state.users.find(u => u.id === s.userId)?.status !== 'active' && <small>{t('Acceso inactivo · No cuenta como cobertura', 'Accés inactiu · No compta com a cobertura')}</small>}
          {s.replacesUserId && <small>🔄 {t('Sustitución de', 'Substitució de')} {person(s.replacesUserId)}</small>}
          {s.status === 'cancel_requested' && <small>{t('Cancelación pendiente · Sigue cubriendo', 'Cancel·lació pendent · Continua cobrint')}</small>}</span><ChevronRight size={18}/>
      </button>)}</div>
      {!shifts.length && <p>{t('Todavía no hay horarios. Sé el primero en apuntarte.', 'Encara no hi ha horaris. Sigues el primer a apuntar-t’hi.')}</p>}
    </section>

    <Dialog open={!!editor} onOpenChange={open => {if (!open && !busy) setEditor(null);}}><DialogContent className="form-dialog schedule-dialog" showCloseButton={!busy}>
      <DialogHeader><DialogTitle>{editor?.id ? t('Modificar horario', 'Modifica l’horari') : t('Apuntarme al cuadrante', 'Apuntar-me al quadrant')}</DialogTitle>
        <DialogDescription>{t('Elige tus horas, sin turnos fijos. Puedes añadir más tramos después.', 'Tria les teves hores, sense torns fixos. Pots afegir més trams després.')}</DialogDescription></DialogHeader>
      {draft && <form className="modal-form" onSubmit={save}><fieldset disabled={busy} className="schedule-fields">
        {admin && <label>{t('Asesor', 'Assessor')}<select required value={draft.userId} onChange={e => field('userId', e.target.value)}>{activeUsers.map(u => <option key={u.id} value={u.id}>{u.name}</option>)}</select></label>}
        <label>{t('Día', 'Dia')}<input type="date" required value={draft.day} onChange={e => field('day', e.target.value)}/></label>
        <div className="schedule-time-fields"><label>{t('Hora de inicio', 'Hora d’inici')}<input type="time" required step="60" value={draft.startTime} onChange={e => field('startTime', e.target.value)}/></label>
          <label>{t('Hora de finalización', 'Hora de finalització')}<input type="time" required step="60" value={draft.endTime} onChange={e => field('endTime', e.target.value)}/></label></div>
        <label className="schedule-next-day"><input type="checkbox" checked={draft.nextDay} onChange={e => field('nextDay', e.target.checked)}/>{t('Finaliza al día siguiente', 'Finalitza l’endemà')}</label>
        <p className="schedule-time-note"><Clock3 size={16}/>{t('Hora de Barcelona', 'Hora de Barcelona')}{times ? ' · ' + durationLabel(times.duration) : ''}</p>
        {times && <p className="schedule-form-summary">{dateLabel(draft.day)} · {draft.startTime} → {draft.nextDay ? dateLabel(times.end.slice(0, 10)) + ' · ' : ''}{draft.endTime}</p>}
        {error && <p className="schedule-error" role="alert">{error}</p>}
        <button className="primary schedule-confirm" type="submit"><Check size={22}/>{busy ? t('Guardando…', 'Desant…') : t('CONFIRMAR HORARIO', 'CONFIRMAR HORARI')}</button>
        <button className="secondary" type="button" onClick={() => setEditor(null)}>{t('Volver', 'Torna')}</button>
      </fieldset></form>}
    </DialogContent></Dialog>

    <Dialog open={!!detail} onOpenChange={open => {if (!open && !busy) {setDetailId(null); setCancelReason(null);}}}><DialogContent className="form-dialog schedule-dialog" showCloseButton={!busy}>
      <DialogHeader><DialogTitle>{t('Detalle del horario', 'Detall de l’horari')}</DialogTitle><DialogDescription>{detail ? person(detail.userId) : ''}</DialogDescription></DialogHeader>
      {detail && controls && <><p className="schedule-form-summary">{dateLabel(detail.start.slice(0, 10))} · {detail.start.slice(11, 16)} → {dateLabel(detail.end.slice(0, 10))} · {detail.end.slice(11, 16)}</p>
        {detail.status === 'cancel_requested' && <p className="schedule-time-note"><Clock3 size={18}/>{t('Cancelación pendiente. Este horario sigue cubriendo hasta su aprobación.', 'Cancel·lació pendent. Aquest horari continua cobrint fins a l’aprovació.')}</p>}
        {detail.reason && <p>{detail.reason}</p>}
        {!coordinationReady && !admin && detail.userId === user.id && <p>{t('Para modificar este horario, contacta con Administración. Las cancelaciones todavía requieren su aprobación.', 'Per modificar aquest horari, contacta amb Administració. Les cancel·lacions encara requereixen la seva aprovació.')}</p>}
        {controls.edit && <button className="primary" disabled={busy} onClick={() => edit(detail)}><Pencil size={18}/>{t('Modificar horario', 'Modifica l’horari')}</button>}
        {controls.delete && (deleteConfirm ? <div className="schedule-decision"><p>{t('¿Eliminar este tramo? Quedará conservado en el histórico.', 'Vols eliminar aquest tram? Es conservarà a l’històric.')}</p><button className="primary" disabled={busy} onClick={async () => {if (await act({type: 'shift.delete', id: detail.id})) {setDetailId(null); setDeleteConfirm(false);}}}>{t('Confirmar eliminación', 'Confirma l’eliminació')}</button><button className="secondary" disabled={busy} onClick={() => setDeleteConfirm(false)}>{t('Volver', 'Torna')}</button></div> : <button className="secondary" disabled={busy} onClick={() => setDeleteConfirm(true)}>{t('Eliminar horario', 'Elimina l’horari')}</button>)}
        {controls.requestCancellation && cancelReason === null && <button className="secondary" disabled={busy} onClick={() => setCancelReason('')}>{t('Solicitar cancelación', 'Sol·licita la cancel·lació')}</button>}
        {controls.requestCancellation && cancelReason !== null && <form className="modal-form" onSubmit={requestCancellation}><label>{t('Motivo de la cancelación', 'Motiu de la cancel·lació')}<textarea required maxLength={500} value={cancelReason} disabled={busy} onChange={e => setCancelReason(e.target.value)}/></label><button className="primary" disabled={busy || !cancelReason.trim()}>{t('Enviar solicitud', 'Envia la sol·licitud')}</button></form>}
        {controls.decideCancellation && <div className="schedule-decision"><button className="secondary" disabled={busy} onClick={() => decideCancellation(false)}>{t('Rechazar cancelación', 'Rebutja la cancel·lació')}</button><button className="primary" disabled={busy} onClick={() => decideCancellation(true)}>{t('Aprobar cancelación', 'Aprova la cancel·lació')}</button></div>}
      </>}
    </DialogContent></Dialog>
  </section>;
}
