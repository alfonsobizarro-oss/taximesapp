// Isolated UI fixture. No auth client, remote fetch, or production route is imported.
import React, {useState} from 'react';
import {createRoot} from 'react-dom/client';
import Schedule from '../../app/schedule';
import {apply} from '../../lib/actions';
import {seed, type Item} from '../../lib/model';
import '../../app/globals.css';
const owner = {id: 'admin', name: 'Administración', role: 'admin', status: 'active'};
const advisor = {id: 'advisor', name: 'Asesor 538', role: 'delegate', status: 'active'};
const other = {id: 'other', name: 'Asesor 620', role: 'delegate', status: 'active'};
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
  const user = role === 'admin' ? owner : advisor;
  async function act(action: Item) {
    try {const next = structuredClone(state); apply(next, user, action); setState(next); setMessage('Guardado localmente'); return true;}
    catch (error) {setMessage((error as Error).message); return false;}
  }
  return <main style={{maxWidth: 1120, margin: 'auto', padding: 16}}>
    <p>PRUEBA LOCAL · Datos ficticios · Sin conexión a Supabase</p>
    <label>Perfil de prueba<select value={role} onChange={e => setRole(e.target.value)}><option value="advisor">Asesor</option><option value="admin">Administración</option></select></label>
    <label>Idioma de prueba<select value={lang} onChange={e => setLang(e.target.value)}><option value="es">Español</option><option value="ca">Català</option></select></label>
    <p role="status">{message}</p>
    <Schedule state={state} user={user} week={week} onWeekChange={setWeek} lang={lang} busy={false} act={act}/>
  </main>;
}
createRoot(document.getElementById('root')!).render(<Preview/>);
