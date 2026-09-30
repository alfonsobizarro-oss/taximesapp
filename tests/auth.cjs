/* eslint-disable @typescript-eslint/no-require-imports */
const assert = require('node:assert/strict');
const {createClient} = require('@supabase/supabase-js');
const {confirmRegistration, resendRegistration, expiredEmailLink, cooldownSeconds} = require('./load.cjs')('lib/registration.ts');

(async () => {
  const calls = [];
  let status = 200, body = {};
  const auth = createClient('https://auth.test', 'test-publishable-key', {
    auth: {persistSession: false, autoRefreshToken: false, detectSessionInUrl: false, flowType: 'pkce'},
    global: {fetch: async (url, options) => {
      calls.push({url: String(url), method: options.method, body: JSON.parse(options.body)});
      return new Response(JSON.stringify(body), {status, headers: {'Content-Type': 'application/json', 'X-Supabase-Api-Version': '2024-01-01'}});
    }},
  }).auth;
  await assert.rejects(confirmRegistration(auth, 'person@example.test', '123'), e => e.code === 'invalid_otp');
  await assert.rejects(confirmRegistration(auth, 'person@example.test', 'abcdef'), e => e.code === 'invalid_otp');
  assert.equal(calls.length, 0, 'Invalid input must not consume a token or make a request');
  const token = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({sub: 'test-user', exp: Math.floor(Date.now()/1000)+3600})).toString('base64url')}.test`;
  body = {access_token: token, token_type: 'bearer', expires_in: 3600, refresh_token: 'refresh-test', user: {id: 'test-user'}};
  assert.equal((await confirmRegistration(auth, ' person@example.test ', ' 012345 ')).user.id, 'test-user');
  assert.deepEqual(calls.at(-1).body, {email: 'person@example.test', token: '012345', type: 'email', gotrue_meta_security: {}});
  assert.equal(calls.at(-1).method, 'POST');
  assert.equal(calls.at(-1).url, 'https://auth.test/auth/v1/verify');
  status = 403; body = {code: 'otp_expired', msg: 'Token has expired or is invalid'};
  await assert.rejects(confirmRegistration(auth, 'person@example.test', '012345'), e => e.code === 'otp_expired');
  status = 429; body = {code: 'over_email_send_rate_limit', msg: 'email rate limit exceeded'};
  await assert.rejects(resendRegistration(auth, 'person@example.test'), e => e.status === 429);
  status = 200; body = {};
  await resendRegistration(auth, ' person@example.test ');
  assert.equal(calls.at(-1).body.email, 'person@example.test');
  assert.equal(calls.at(-1).body.type, 'signup');
  assert.equal(calls.at(-1).body.code_challenge_method, 's256');
  assert.ok(calls.at(-1).body.code_challenge);
  assert.equal(calls.at(-1).url, 'https://auth.test/auth/v1/resend');
  await assert.rejects(confirmRegistration(auth, 'person@example.test', '123456'), e => e.code === 'missing_session');
  assert.equal(cooldownSeconds(60_000, 0), 60);
  assert.equal(cooldownSeconds(60_000, 59_999), 1);
  assert.equal(cooldownSeconds(60_000, 60_000), 0);
  assert.equal(cooldownSeconds(NaN), 0);
  assert.equal(expiredEmailLink(new URL('https://app.test/#error=access_denied&error_code=otp_expired')), true);
  assert.equal(expiredEmailLink(new URL('https://app.test/?error_description=Email+link+is+invalid+or+has+expired')), true);
  assert.equal(expiredEmailLink(new URL('https://app.test/?code=valid-recovery')), false);
  assert.equal(expiredEmailLink(new URL('https://app.test/?confirm=email')), false);
  console.log('Auth: OTP contract, expiry, resend, 429, cooldown (email template intentionally excluded) passed.');
})().catch(error => {console.error(error); process.exitCode = 1;});
