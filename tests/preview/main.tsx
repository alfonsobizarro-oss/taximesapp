// Isolated UI fixture. No auth client, remote fetch, or production route is imported.
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import Schedule from '../../app/schedule';
import AdvisersNow from '../../app/advisers-now';
import {apply} from '../../lib/actions';
import {applyCoordination} from '../../lib/coordination';
import {seed, visible, type Item} from '../../lib/model';
import '../../app/globals.css';
const owner = {id: 'admin', name: 'Administración', role: 'admin', status: 'active'};
const advisor = {id: 'advisor', name: '538 · Miguel', role: 'delegate', status: 'active'};
const other = {id: 'other', name: '620 · Laura', role: 'delegate', status: 'active'};
const base = seed(owner);
base.users = [owner, advisor, other];
base.shifts = [
  {id: 'early', userId: advisor.id, start: '2026-09-28T06:00', end: '2026-09-28T10:00', status: 'confirmed'},
  {id: 'late', userId: other.id, start: '2026-09-28T11:30', end: '2026-09-28T15:00', status: 'confirmed'},
  {id: 'overlap', userId: advisor.id, start: '2026-09-28T12:15', end: '2026-09-28T14:00', status: 'confirmed'},
];
function Preview() {
  const [state, setState] = useState(base), [role, setRole] = useState('advisor'), [lang, setLang] = useState('es');
  const [week, setWeek] = useState('2026-09-28'), [message, setMessage] = useState('');
  const [screen, setScreen] = useState('home'), [clock, setClock] = useState('2026-09-28T10:30:00Z');
  const [ready, setReady] = useState(true), [join, setJoin] = useState(false), [events, setEvents] = useState<Item[]>([]);
  const user = role === 'admin' ? owner : role === 'other' ? other : advisor;
  async function act(action: Item) {
    try {
      const next = structuredClone(state); const recorded = applyCoordination(next, user, action, new Date(clock));
      if (recorded === null) apply(next, user, action); else setEvents(old => [...recorded.slice().reverse(), ...old]);
      setState(next); setMessage('Guardado localmente'); return true;
    } catch (error) {setMessage((error as Error).message); return false;}
  }
  return <main style={{maxWidth: 1120, margin: 'auto', padding: 16}}>
    <p>PRUEBA LOCAL · Datos ficticios · Sin conexión a Supabase</p>
    <label>Perfil de prueba<select value={role} onChange={e => setRole(e.target.value)}><option value="advisor">Asesor 538</option><option value="other">Asesor 620</option><option value="admin">Administración</option></select></label>
    <label>Idioma de prueba<select value={lang} onChange={e => setLang(e.target.value)}><option value="es">Español</option><option value="ca">Català</option></select></label>
    <label>Momento de prueba<select value={clock} onChange={e => setClock(e.target.value)}><option value="2026-09-28T10:30:00Z">12:30 · Dos Asesores</option><option value="2026-09-28T08:30:00Z">10:30 · Sin cobertura</option><option value="2026-09-28T11:30:00Z">13:30 · Tras el relevo</option><option value="2026-09-28T21:30:00Z">23:30 · Noche</option></select></label>
    <label>Backend de prueba<select value={String(ready)} onChange={e => setReady(e.target.value === 'true')}><option value="true">Actualizado</option><option value="false">Anterior</option></select></label>
    <button className="secondary" onClick={() => setScreen('home')}>Inicio de prueba</button><p role="status">{message}</p>
    {screen === 'home' ? <AdvisersNow state={visible(state, user)!} user={user} lang={lang} busy={false} ready={ready} fixedClock={clock} act={act} navigate={(section, join) => {setScreen(section); setJoin(!!join);}} loadHistory={async () => ({events, nextCursor: null})}/> : screen === 'schedule' ? <Schedule coordinationReady={ready} initiallyJoin={join} state={state} user={user} week={week} onWeekChange={setWeek} lang={lang} busy={false} act={act}/> : <p>Módulo existente: {screen}</p>}
  </main>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
