export const madridLocal = (iso: string) => new Intl.DateTimeFormat('sv-SE',{timeZone:'Europe/Madrid',year:'numeric',month:'2-digit',day:'2-digit',hour:'2-digit',minute:'2-digit',hourCycle:'h23'}).format(new Date(iso)).replace(' ','T');
export function madridISO(local: string) {
 if(!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(local))throw Error('Revisa la fecha y hora.');
 const base=Date.parse(local+'Z');
 const matches=[1,2].map(offset=>new Date(base-offset*3600000)).filter(d=>Number.isFinite(d.getTime())&&madridLocal(d.toISOString())===local);
 if(matches.length!==1)throw Error('Esta hora coincide con un cambio de horario. Elige una hora que no sea ambigua.');
 return matches[0].toISOString();
}
export function calendarDays(day:string, mode:string) {
 const date=new Date(day+'T12:00:00Z');
 if(mode==='month')date.setUTCDate(1);
 date.setUTCDate(date.getUTCDate()-(date.getUTCDay()+6)%7);
 return Array.from({length:mode==='month'?42:7},(_,i)=>{const d=new Date(date);d.setUTCDate(d.getUTCDate()+i);return d.toISOString().slice(0,10)});
}
