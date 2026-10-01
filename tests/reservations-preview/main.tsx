import React,{useState} from 'react';
import {createRoot} from 'react-dom/client';
import Reservations from '../../app/reservations';
import {seed,visible} from '../../lib/model';
import {apply} from '../../lib/actions';
import '../../app/globals.css';
const admin={id:'admin',name:'Central',role:'admin',status:'active'};
const mono={id:'mono',name:'Asociado monovolumen',email:'mono@example.invalid',role:'reservation',status:'active',memberId:'m',reservationTypes:['MONOVOLUMEN']};
const adapt={...mono,id:'adapt',name:'Asociado adaptado',reservationTypes:['ADAPTADO']};
const base=seed(admin);base.users=[admin,mono,adapt];base.members=[{id:'m',fleet:'101',name:'Asociado ficticio',status:'active'}];base.reservations=[];
for(let i=0;i<9;i++){const date=new Date();date.setDate(date.getDate()+Math.floor(i/2));date.setHours(18+i%2,30,0,0);apply(base,admin,{type:'reservation.save',start:date.toISOString(),kind:i%2?'ADAPTADO':'MONOVOLUMEN',pickup:'Estación de Sants · acceso principal',destination:'Aeropuerto · Terminal 1',requirements:i%2?'Acceso para silla de ruedas':'6 plazas',passengers:i%2?2:6,customerType:'particular'});apply(base,admin,{type:'reservation.publish',id:base.reservations[0].id})}
function Preview(){const [state,setState]=useState(base),[role,setRole]=useState('admin'),[message,setMessage]=useState('');const user=role==='admin'?admin:role==='mono'?mono:adapt;return <main className="reservation-only"><p>PRUEBA LOCAL · Datos ficticios · Sin conexión remota</p><label>Perfil de prueba<select value={role} onChange={e=>setRole(e.target.value)}><option value="admin">Central</option><option value="mono">Monovolumen</option><option value="adapt">Adaptado</option></select></label><p role="status">{message}</p><Reservations key={role} state={visible(state,user)!} user={user} busy={false} ready act={async a=>{try{const next=structuredClone(state);apply(next,user,a);setState(next);setMessage('Guardado localmente');return true}catch(e){setMessage((e as Error).message);return false}}}/></main>}
createRoot(document.getElementById('root')!).render(<Preview/>);
