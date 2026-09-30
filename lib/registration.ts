import type {SupabaseClient} from '@supabase/supabase-js';

export const EMAIL_COOLDOWN_KEY = 'taximes-email-send-after';
export const EMAIL_COOLDOWN_MS = 60_000;
export type AuthFailure = {message?: string; code?: string; status?: number};

export function isRateLimited(error: AuthFailure) {
  return error.status === 429 || !!error.code?.includes('rate_limit');
}

export function cooldownSeconds(deadline: number, now = Date.now()) {
  return Number.isFinite(deadline) ? Math.max(0, Math.ceil((deadline - now) / 1000)) : 0;
}

// Email OTP verification works even if the email is opened on another device.
// Never call this from a page load, an effect, or a URL parameter.
export async function confirmRegistration(auth: SupabaseClient['auth'], email: string, code: string) {
  const token = code.trim();
  if (!/^[0-9]{6,10}$/.test(token)) throw {code: 'invalid_otp', message: 'Invalid code format'};
  const {data, error} = await auth.verifyOtp({email: email.trim(), token, type: 'email'});
  if (error) throw error;
  if (!data.session) throw {code: 'missing_session', message: 'No session returned'};
  return data.session;
}

export async function resendRegistration(auth: SupabaseClient['auth'], email: string) {
  // Resend an existing signup; do not create users or send passwordless login links.
  const {error} = await auth.resend({type: 'signup', email: email.trim()});
  if (error) throw error;
}

export function expiredEmailLink(url: URL) {
  const hash = new URLSearchParams(url.hash.slice(1));
  return [url.searchParams, hash].some(params =>
    params.get('error_code') === 'otp_expired' ||
    /expired|invalid|one.time token/i.test(params.get('error_description') || ''),
  );
}
