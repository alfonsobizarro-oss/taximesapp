"use client";
import {useEffect,useState} from 'react';
import type {Session} from '@supabase/supabase-js';
import {supabase} from '@/lib/supabase-client';
import Workspace from './workspace';

export default function AuthGate(){
  const [session,setSession]=useState<Session|null>(null),[ready,setReady]=useState(false);
  const [mode,setMode]=useState<'login'|'register'|'reset'|'password'>('login');
  const [email,setEmail]=useState(''),[password,setPassword]=useState(''),[name,setName]=useState('');
  const [busy,setBusy]=useState(false),[error,setError]=useState(''),[message,setMessage]=useState(''),[lang,setLang]=useState('es');
  const t=(es:string,ca:string)=>lang==='ca'?ca:es;
  useEffect(()=>{
    setLang(localStorage.getItem('taximes-language')||'es');
    const client=supabase();
    const {data:{subscription}}=client.auth.onAuthStateChange((event,next)=>{setSession(next);setReady(true);if(event==='PASSWORD_RECOVERY')setMode('password')});
    client.auth.getSession().then(({data,error})=>{if(error)setError(t('No se ha podido recuperar la sesión. Vuelve a entrar.','No s’ha pogut recuperar la sessió. Torna a entrar.'));setSession(data.session);setReady(true)});
    if('serviceWorker' in navigator)navigator.serviceWorker.register('/sw.js').catch(()=>{});
    return()=>subscription.unsubscribe();
  },[]);
  function change(next:typeof mode){setMode(next);setError('');setMessage('');setPassword('')}
  function authMessage(e:{message:string;code?:string}){
    if(e.code==='invalid_credentials')return t('Correo o contraseña incorrectos.','Correu o contrasenya incorrectes.');
    if(e.code==='email_not_confirmed')return t('Confirma tu correo antes de entrar. Revisa también la carpeta de correo no deseado.','Confirma el correu abans d’entrar. Revisa també el correu brossa.');
    if(e.code?.includes('rate_limit'))return t('Demasiados intentos. Espera unos minutos y vuelve a probar.','Massa intents. Espera uns minuts i torna-ho a provar.');
    if(e.code==='email_address_not_authorized'||/sending emails|not authorized/i.test(e.message))return t('El envío de correos todavía no está configurado. Contacta con administración.','L’enviament de correus encara no està configurat. Contacta amb administració.');
    return t('No se ha podido completar la solicitud. Comprueba los datos o contacta con administración.','No s’ha pogut completar la sol·licitud. Comprova les dades o contacta amb administració.');
  }
  async function submit(e:React.FormEvent){
    e.preventDefault();if(busy)return;setBusy(true);setError('');setMessage('');
    try{
      const auth=supabase().auth;const redirect=window.location.origin+'/';
      if(mode==='login'){const {error}=await auth.signInWithPassword({email:email.trim(),password});if(error)throw error;setPassword('')}
      else if(mode==='register'){
        const {data,error}=await auth.signUp({email:email.trim(),password,options:{data:{name:name.trim()},emailRedirectTo:redirect}});if(error)throw error;
        setPassword('');if(!data.session)setMessage(t('Revisa tu correo para confirmar la cuenta. Después entra y solicita la aprobación de administración.','Revisa el correu per confirmar el compte. Després entra i sol·licita l’aprovació d’administració.'));
      }else if(mode==='reset'){
        const {error}=await auth.resetPasswordForEmail(email.trim(),{redirectTo:redirect});if(error)throw error;
        setMessage(t('Si el correo corresponde a una cuenta, recibirás las instrucciones de recuperación.','Si el correu correspon a un compte, rebràs les instruccions de recuperació.'));
      }else{
        const {error}=await auth.updateUser({password});if(error)throw error;setPassword('');setMode('login');
      }
    }catch(e){setError(authMessage(e as {message:string;code?:string}))}finally{setBusy(false)}
  }
  if(!ready)return <div className="loading"><img src="/taximes-logo.png" alt="Taximés"/><p>Conectando…</p></div>;
  if(session&&mode!=='password')return <Workspace key={session.user.id}/>;
  return <main className="welcome auth-page">
    <div className="welcome-brand"><img src="/taximes-logo.png" alt="Taximés"/><p>{t('CENTRO DE DELEGADOS','CENTRE DE DELEGATS')}</p><h1>{t('Toda la flota.\nUn mismo equipo.','Tota la flota.\nUn mateix equip.')}</h1><p>{t('Nuestro espacio para coordinar turnos, compartir incidencias y trabajar juntos.','El nostre espai per coordinar torns, compartir incidències i treballar junts.')}</p></div>
    <div className="welcome-card"><div className="auth-heading"><span className="eyebrow">TAXIMÉS · DELEGADOS</span><button className="language" onClick={()=>{const next=lang==='es'?'ca':'es';setLang(next);localStorage.setItem('taximes-language',next)}}>{lang.toUpperCase()} / {lang==='es'?'CA':'ES'}</button></div>
      <h2>{mode==='login'?t('Bienvenido de nuevo','Benvingut de nou'):mode==='register'?t('Crea tu cuenta','Crea el teu compte'):mode==='reset'?t('Recupera tu acceso','Recupera l’accés'):t('Nueva contraseña','Nova contrasenya')}</h2>
      <p>{mode==='register'?t('El acceso a la información requiere la aprobación del administrador principal.','L’accés a la informació requereix l’aprovació de l’administrador principal.'):t('Acceso exclusivo para el equipo de Taximés.','Accés exclusiu per a l’equip de Taximés.')}</p>
      <form onSubmit={submit} className="auth-form">
        {mode==='register'&&<label>{t('Nombre completo','Nom complet')}<input autoComplete="name" value={name} required maxLength={100} onChange={e=>setName(e.target.value)}/></label>}
        {mode!=='password'&&<label>{t('Correo electrónico','Correu electrònic')}<input type="email" autoComplete="email" value={email} required maxLength={254} onChange={e=>setEmail(e.target.value)}/></label>}
        {mode!=='reset'&&<label>{t('Contraseña','Contrasenya')}<input type="password" autoComplete={mode==='login'?'current-password':'new-password'} minLength={mode==='login'?1:12} value={password} required onChange={e=>setPassword(e.target.value)}/>{mode!=='login'&&<small>{t('Utiliza al menos 12 caracteres.','Utilitza almenys 12 caràcters.')}</small>}</label>}
        {error&&<p className="auth-error" role="alert">{error}</p>}{message&&<p className="auth-message" role="status">{message}</p>}
        <button className="primary" disabled={busy}>{busy?t('Un momento…','Un moment…'):mode==='login'?t('Entrar','Entra'):mode==='register'?t('Crear cuenta','Crea el compte'):mode==='reset'?t('Enviar instrucciones','Envia les instruccions'):t('Guardar contraseña','Desa la contrasenya')}</button>
      </form>
      <div className="auth-links">{mode==='login'?<><button onClick={()=>change('reset')}>{t('He olvidado mi contraseña','He oblidat la contrasenya')}</button><button onClick={()=>change('register')}>{t('Soy nuevo · Crear cuenta','Soc nou · Crea un compte')}</button></>:<button onClick={()=>change('login')}>{t('Volver al inicio de sesión','Torna a l’inici de sessió')}</button>}</div>
    </div>
  </main>;
}
