"use client";
import {useEffect, useRef, useState} from 'react';
import type {Session} from '@supabase/supabase-js';
import {supabase} from '@/lib/supabase-client';
import {confirmRegistration, resendRegistration, expiredEmailLink, isRateLimited, cooldownSeconds, EMAIL_COOLDOWN_KEY, EMAIL_COOLDOWN_MS, type AuthFailure} from '@/lib/registration';
import Workspace from './workspace';

type Mode = 'login' | 'register' | 'confirm' | 'reset' | 'password';

export default function AuthGate() {
  const [session, setSession] = useState<Session | null>(null), [ready, setReady] = useState(false);
  const [mode, setMode] = useState<Mode>('login');
  const [email, setEmail] = useState(''), [password, setPassword] = useState(''), [name, setName] = useState(''), [code, setCode] = useState('');
  const [busy, setBusy] = useState(false), [error, setError] = useState(''), [message, setMessage] = useState(''), [lang, setLang] = useState('es');
  const [wait, setWait] = useState(0);
  const requestInFlight = useRef(false), sendAfter = useRef(0);
  const t = (es: string, ca: string) => lang === 'ca' ? ca : es;

  useEffect(() => {
    let language = 'es';
    try {language = localStorage.getItem('taximes-language') || 'es';} catch {}
    // Restore browser-only preferences after hydration; the server cannot read localStorage.
    // eslint-disable-next-line react-hooks/set-state-in-effect
    setLang(language);
    function refreshCooldown() {
      try {sendAfter.current = Math.max(sendAfter.current, Number(localStorage.getItem(EMAIL_COOLDOWN_KEY)) || 0);} catch {}
      setWait(cooldownSeconds(sendAfter.current));
    }
    refreshCooldown();
    const timer = window.setInterval(refreshCooldown, 1000);
    window.addEventListener('storage', refreshCooldown);
    const url = new URL(window.location.href);
    if (url.searchParams.get('confirm') === 'email') setMode('confirm');
    if (expiredEmailLink(url)) {
      setMode('confirm');
      setError(language === 'ca' ? 'L’enllaç ja no és vàlid. Introdueix el correu i demana un codi nou.' : 'El enlace ya no es válido. Introduce tu correo y solicita un código nuevo.');
      for (const key of ['error', 'error_code', 'error_description']) url.searchParams.delete(key);
      url.hash = '';
      window.history.replaceState(null, '', url.pathname + url.search);
    }
    const client = supabase();
    const {data: {subscription}} = client.auth.onAuthStateChange((event, next) => {
      setSession(next); setReady(true);
      if (event === 'PASSWORD_RECOVERY') setMode('password');
    });
    let active = true;
    client.auth.getSession().then(({data, error}) => {
      if (!active) return;
      if (error) setError(language === 'ca' ? 'No s’ha pogut recuperar la sessió. Torna a entrar.' : 'No se ha podido recuperar la sesión. Vuelve a entrar.');
      setSession(data.session); setReady(true);
    }).catch(() => {if (active) setReady(true);});
    if ('serviceWorker' in navigator) navigator.serviceWorker.register('/sw.js').catch(() => {});
    return () => {active = false; subscription.unsubscribe(); window.clearInterval(timer); window.removeEventListener('storage', refreshCooldown);};
  }, []);

  function change(next: Mode) {setMode(next); setError(''); setMessage(''); setPassword(''); setCode('');}
  function emailBlocked() {
    try {sendAfter.current = Math.max(sendAfter.current, Number(localStorage.getItem(EMAIL_COOLDOWN_KEY)) || 0);} catch {}
    const remaining = cooldownSeconds(sendAfter.current);
    setWait(remaining);
    return remaining > 0;
  }
  function pauseEmail() {
    sendAfter.current = Date.now() + EMAIL_COOLDOWN_MS;
    try {localStorage.setItem(EMAIL_COOLDOWN_KEY, String(sendAfter.current));} catch {}
    setWait(cooldownSeconds(sendAfter.current));
  }
  function authMessage(e: AuthFailure) {
    if (e.code === 'invalid_credentials') return t('Correo o contraseña incorrectos.', 'Correu o contrasenya incorrectes.');
    if (e.code === 'email_not_confirmed') return t('Tu correo aún no está confirmado. Introduce el código recibido o solicita uno nuevo.', 'El correu encara no està confirmat. Introdueix el codi rebut o demana’n un de nou.');
    if (e.code === 'otp_expired' || e.code === 'invalid_otp') return t('El código no es válido o ha caducado. Comprueba el último correo recibido o solicita un código nuevo.', 'El codi no és vàlid o ha caducat. Comprova l’últim correu rebut o demana un codi nou.');
    if (isRateLimited(e)) return t('Se ha alcanzado el límite de intentos o correos. Espera antes de volver a probar; el límite del proveedor puede durar más que la cuenta atrás. Si persiste, contacta con administración.', 'S’ha arribat al límit d’intents o correus. Espera abans de tornar-ho a provar; el límit del proveïdor pot durar més que el compte enrere. Si persisteix, contacta amb administració.');
    if (e.code === 'email_address_not_authorized' || /sending emails|not authorized/i.test(e.message || '')) return t('El envío de correos todavía no está configurado. Contacta con administración.', 'L’enviament de correus encara no està configurat. Contacta amb administració.');
    return t('No se ha podido completar la solicitud. Comprueba los datos o contacta con administración.', 'No s’ha pogut completar la sol·licitud. Comprova les dades o contacta amb administració.');
  }
  async function submit(e: React.FormEvent<HTMLFormElement>) {
    e.preventDefault();
    // A synchronous lock also covers rapid clicks before React renders disabled controls.
    if (requestInFlight.current) return;
    const resend = (e.nativeEvent as SubmitEvent).submitter?.getAttribute('name') === 'resend';
    const sendsEmail = mode === 'register' || mode === 'reset' || resend;
    if (sendsEmail && emailBlocked()) return;
    requestInFlight.current = true; setBusy(true); setError(''); setMessage('');
    try {
      const auth = supabase().auth;
      if (resend && mode === 'confirm') {
        await resendRegistration(auth, email);
        pauseEmail(); setCode('');
        setMessage(t('Si hay un registro pendiente para este correo, recibirás un código nuevo. Revisa también el correo no deseado y utiliza el último código recibido.', 'Si hi ha un registre pendent per a aquest correu, rebràs un codi nou. Revisa també el correu brossa i utilitza l’últim codi rebut.'));
      } else if (mode === 'confirm') {
        const next = await confirmRegistration(auth, email, code);
        setCode(''); setPassword(''); setSession(next);
      } else if (mode === 'login') {
        const {error} = await auth.signInWithPassword({email: email.trim(), password});
        if (error) {if (error.code === 'email_not_confirmed') change('confirm'); throw error;}
        setPassword('');
      } else if (mode === 'register') {
        const {data, error} = await auth.signUp({email: email.trim(), password, options: {data: {name: name.trim()}}});
        if (error) throw error;
        pauseEmail(); setPassword('');
        if (!data.session) {
          setMode('confirm');
          setMessage(t('Introduce el código enviado a tu correo. Si ya tenías una cuenta confirmada, vuelve al inicio de sesión. El acceso requiere la aprobación de administración.', 'Introdueix el codi enviat al correu. Si ja tenies un compte confirmat, torna a l’inici de sessió. L’accés requereix l’aprovació d’administració.'));
        }
      } else if (mode === 'reset') {
        const {error} = await auth.resetPasswordForEmail(email.trim(), {redirectTo: window.location.origin + '/'});
        if (error) throw error;
        pauseEmail();
        setMessage(t('Si el correo corresponde a una cuenta, recibirás las instrucciones de recuperación.', 'Si el correu correspon a un compte, rebràs les instruccions de recuperació.'));
      } else {
        const {error} = await auth.updateUser({password});
        if (error) throw error;
        setPassword(''); setMode('login');
      }
    } catch (e) {
      const failure = (e || {}) as AuthFailure;
      if (isRateLimited(failure)) {
        pauseEmail();
        if (mode === 'register') change('confirm');
      }
      setError(authMessage(failure));
    } finally {requestInFlight.current = false; setBusy(false);}
  }

  if (!ready) return <div className="loading"><img src="/taximes-logo.png" alt="Taximés"/><p>Conectando…</p></div>;
  if (session && mode !== 'password') return <Workspace key={session.user.id}/>;
  return <main className="welcome auth-page">
    <div className="welcome-brand"><img src="/taximes-logo.png" alt="Taximés"/><p>Staff Taximés</p><h1>{t('Toda la flota.\nUn mismo equipo.', 'Tota la flota.\nUn mateix equip.')}</h1><p>{t('Nuestro espacio para coordinar turnos, compartir incidencias y trabajar juntos.', 'El nostre espai per coordinar torns, compartir incidències i treballar junts.')}</p></div>
    <div className="welcome-card"><div className="auth-heading"><span className="eyebrow">Staff Taximés</span><button className="language" onClick={() => {const next = lang === 'es' ? 'ca' : 'es'; setLang(next); try {localStorage.setItem('taximes-language', next);} catch {}}}>{lang.toUpperCase()} / {lang === 'es' ? 'CA' : 'ES'}</button></div>
      <h2>{mode === 'login' ? t('Bienvenido de nuevo', 'Benvingut de nou') : mode === 'register' ? t('Crea tu cuenta', 'Crea el teu compte') : mode === 'confirm' ? t('Confirma tu correo', 'Confirma el correu') : mode === 'reset' ? t('Recupera tu acceso', 'Recupera l’accés') : t('Nueva contraseña', 'Nova contrasenya')}</h2>
      <p>{mode === 'register' ? t('El acceso a la información requiere la aprobación del administrador principal.', 'L’accés a la informació requereix l’aprovació de l’administrador principal.') : mode === 'confirm' ? t('Copia el código del correo de Taximés. Puedes hacerlo aunque hayas abierto el correo en otro dispositivo.', 'Copia el codi del correu de Taximés. Pots fer-ho encara que hagis obert el correu en un altre dispositiu.') : t('Acceso exclusivo para el equipo de Taximés.', 'Accés exclusiu per a l’equip de Taximés.')}</p>
      <form onSubmit={submit} className="auth-form">
        {mode === 'register' && <label>{t('Nombre completo', 'Nom complet')}<input disabled={busy} autoComplete="name" value={name} required maxLength={100} onChange={e => setName(e.target.value)}/></label>}
        {mode !== 'password' && <label>{t('Correo electrónico', 'Correu electrònic')}<input disabled={busy} type="email" autoComplete="email" value={email} required maxLength={254} onChange={e => {setEmail(e.target.value); setCode(''); setError(''); setMessage('');}}/></label>}
        {mode === 'confirm' && <label>{t('Código de verificación', 'Codi de verificació')}<input disabled={busy} type="text" inputMode="numeric" autoComplete="one-time-code" value={code} maxLength={10} onChange={e => setCode(e.target.value.replace(/\s/g, ''))}/><small>{t('Usa el último código recibido. Si todavía tienes un correo con enlace, solicita un código nuevo.', 'Utilitza l’últim codi rebut. Si encara tens un correu amb enllaç, demana un codi nou.')}</small></label>}
        {mode !== 'reset' && mode !== 'confirm' && <label>{t('Contraseña', 'Contrasenya')}<input disabled={busy} type="password" autoComplete={mode === 'login' ? 'current-password' : 'new-password'} minLength={mode === 'login' ? 1 : 12} value={password} required onChange={e => setPassword(e.target.value)}/>{mode !== 'login' && <small>{t('Utiliza al menos 12 caracteres.', 'Utilitza almenys 12 caràcters.')}</small>}</label>}
        {error && <p className="auth-error" role="alert">{error}</p>}{message && <p className="auth-message" role="status">{message}</p>}
        <button type="submit" className="primary" disabled={busy || ((mode === 'register' || mode === 'reset') && wait > 0)}>{busy ? t('Un momento…', 'Un moment…') : mode === 'login' ? t('Entrar', 'Entra') : mode === 'register' ? t('Crear cuenta', 'Crea el compte') : mode === 'confirm' ? t('Confirmar correo', 'Confirma el correu') : mode === 'reset' ? t('Enviar instrucciones', 'Envia les instruccions') : t('Guardar contraseña', 'Desa la contrasenya')}</button>
        {mode === 'confirm' && <button type="submit" name="resend" className="secondary" disabled={busy || wait > 0}>{t('Enviar un código nuevo', 'Envia un codi nou')}</button>}
        {wait > 0 && ['register', 'confirm', 'reset'].includes(mode) && <small>{t(`Podrás solicitar otro correo en ${wait} s.`, `Podràs demanar un altre correu en ${wait} s.`)}</small>}
      </form>
      <div className="auth-links">{mode === 'login' ? <><button disabled={busy} onClick={() => change('reset')}>{t('He olvidado mi contraseña', 'He oblidat la contrasenya')}</button><button disabled={busy} onClick={() => change('register')}>{t('Soy nuevo · Crear cuenta', 'Soc nou · Crea un compte')}</button><button disabled={busy} onClick={() => change('confirm')}>{t('Tengo un código · Confirmar correo', 'Tinc un codi · Confirma el correu')}</button></> : <button disabled={busy} onClick={() => change('login')}>{t('Volver al inicio de sesión', 'Torna a l’inici de sessió')}</button>}</div>
    </div>
  </main>;
}
