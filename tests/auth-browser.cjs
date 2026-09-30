/* eslint-disable @typescript-eslint/no-require-imports */
// Start tests/auth-preview/vite.config.mjs first. Requires Playwright + Chromium.
const {chromium} = require('playwright');
const assert = require('node:assert/strict');
const base = 'http://127.0.0.1:4175';
const address = 'test@example.test';
const deadlineKey = 'taximes-email-send-after';
(async () => {
  const browser = await chromium.launch({headless: true, executablePath: process.env.CHROME_PATH});
  try {
    const context = await browser.newContext({serviceWorkers: 'block'});
    const calls = [];
    let verifyStatus = 200, signupStatus = 200, resendStatus = 200, loginUnconfirmed = true;
    const errors = [];
    const token = `${Buffer.from('{"alg":"HS256"}').toString('base64url')}.${Buffer.from(JSON.stringify({sub: 'test-user', exp: Math.floor(Date.now()/1000)+3600})).toString('base64url')}.test`;
    const user = {id: 'test-user', email: address, aud: 'authenticated', role: 'authenticated', user_metadata: {name: 'Prueba'}, app_metadata: {}, created_at: new Date().toISOString()};
    const session = {access_token: token, refresh_token: 'test-refresh', expires_in: 3600, token_type: 'bearer', user};
    // Intercept ALL non-local requests. No email or production API is ever reached.
    await context.route('**/*', async route => {
      const req = route.request(), url = new URL(req.url());
      if (url.origin === base) return route.continue();
      if (!url.pathname.startsWith('/auth/v1/')) return route.abort();
      const body = req.postDataJSON();
      calls.push({path: url.pathname, body, method: req.method()});
      let status = 200, data = {};
      if (url.pathname.endsWith('/signup')) {status = signupStatus; data = status === 200 ? user : {code: 'over_email_send_rate_limit', msg: 'email rate limit exceeded'};}
      else if (url.pathname.endsWith('/verify')) {status = verifyStatus; data = status === 200 ? session : {code: 'otp_expired', msg: 'Token has expired or is invalid'};}
      else if (url.pathname.endsWith('/resend')) {status = resendStatus; data = status === 200 ? {} : {code: 'over_email_send_rate_limit', msg: 'email rate limit exceeded'};}
      else if (url.pathname.endsWith('/token')) {status = loginUnconfirmed ? 400 : 200; data = loginUnconfirmed ? {code: 'email_not_confirmed', msg: 'Email not confirmed'} : session;}
      else if (url.pathname.endsWith('/user')) data = user;
      else if (!url.pathname.endsWith('/recover')) throw Error('Unexpected auth request: '+url.pathname);
      await route.fulfill({status, json: data, headers: {'X-Supabase-Api-Version': '2024-01-01', 'Access-Control-Expose-Headers': 'X-Supabase-Api-Version'}});
    });
    const page = await context.newPage();
    page.on('pageerror', e => errors.push(e.message));
    async function fresh(url = base) {await page.goto(base); await page.evaluate(() => localStorage.clear()); await page.goto('about:blank'); await page.goto(url); await page.getByRole('heading', {level: 2}).waitFor();}
    const count = path => calls.filter(x => x.path.endsWith(path)).length;
    await fresh(base+'/?confirm=email');
    assert.equal(await page.getByRole('heading', {level: 2}).textContent(), 'Confirma tu correo');
    assert.equal(calls.length, 0, 'Opening the email link (scanner) must not call auth');
    await page.reload();
    await page.getByRole('button', {name: 'Confirmar correo', exact: true}).waitFor();
    assert.equal(calls.length, 0, 'Reloading must not call auth');
    await page.getByLabel('Correo electrónico').fill(address);
    await page.getByRole('button', {name: 'Confirmar correo', exact: true}).click();
    await page.getByRole('alert').waitFor();
    assert.equal(count('/verify'), 0);
    await page.getByRole('button', {name: 'Enviar un código nuevo'}).click();
    await page.getByRole('status').waitFor();
    assert.equal(count('/resend'), 1);
    assert.equal(await page.getByRole('button', {name: 'Enviar un código nuevo'}).isDisabled(), true);
    await page.reload();
    await page.getByRole('button', {name: 'Enviar un código nuevo'}).waitFor();
    assert.equal(await page.getByRole('button', {name: 'Enviar un código nuevo'}).isDisabled(), true, 'Cooldown survives reload');
    await page.getByLabel('Correo electrónico').fill(address);
    await page.getByLabel('Código de verificación').fill('012345');
    verifyStatus = 403;
    await page.getByRole('button', {name: 'Confirmar correo', exact: true}).click();
    await page.getByRole('alert').waitFor();
    assert.match(await page.getByRole('alert').textContent(), /caducado/);
    assert.equal(count('/resend'), 1, 'Bad code must not resend automatically');
    verifyStatus = 200;
    await page.getByRole('button', {name: 'Confirmar correo', exact: true}).click();
    await page.getByText('Sesión confirmada · Solicitar aprobación').waitFor();
    assert.equal(calls.find(x => x.path.endsWith('/verify')).body.token, '012345');
    await fresh();
    await page.getByRole('button', {name: 'Soy nuevo · Crear cuenta'}).click();
    await page.getByLabel('Nombre completo').fill('Persona de prueba');
    await page.getByLabel('Correo electrónico').fill(address);
    await page.getByLabel(/^Contraseña/).fill('Contraseña-test-123');
    await page.getByRole('button', {name: 'Crear cuenta', exact: true}).dblclick();
    await page.getByRole('heading', {name: 'Confirma tu correo', exact: true}).waitFor();
    assert.equal(count('/signup'), 1, 'Double click must submit signup once');
    assert.equal(await page.getByLabel('Correo electrónico').inputValue(), address);
    assert.equal(await page.getByRole('button', {name: 'Enviar un código nuevo'}).isDisabled(), true);
    await fresh();
    await page.getByLabel('Correo electrónico').fill(address);
    await page.getByLabel(/^Contraseña/).fill('Contraseña-test-123');
    await page.getByRole('button', {name: 'Entrar', exact: true}).click();
    await page.getByRole('heading', {name: 'Confirma tu correo', exact: true}).waitFor();
    assert.equal(count('/resend'), 1, 'Unconfirmed login must not send unsolicited email');
    resendStatus = 429;
    await page.getByRole('button', {name: 'Enviar un código nuevo'}).click();
    await page.getByRole('alert').waitFor();
    assert.match(await page.getByRole('alert').textContent(), /límite/);
    assert.equal(await page.getByRole('button', {name: 'Enviar un código nuevo'}).isDisabled(), true);
    await fresh(base+'/#error=access_denied&error_code=otp_expired&error_description=Email+link+has+expired');
    await page.getByRole('heading', {name: 'Confirma tu correo', exact: true}).waitFor();
    assert.equal(new URL(page.url()).hash, '');
    assert.match(await page.getByRole('alert').textContent(), /enlace/);
    await page.getByRole('button', {name: 'ES / CA'}).click();
    assert.equal(await page.getByRole('heading', {level: 2}).textContent(), 'Confirma el correu');
    await page.setViewportSize({width: 390, height: 844});
    if (process.env.AUTH_SCREENSHOT) await page.screenshot({path: process.env.AUTH_SCREENSHOT, fullPage: true});
    assert.equal(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth), true, 'Mobile layout must fit');
    await fresh();
    signupStatus = 429;
    await page.getByRole('button', {name: 'Soy nuevo · Crear cuenta'}).click();
    await page.getByLabel('Nombre completo').fill('Persona de prueba');
    await page.getByLabel('Correo electrónico').fill(address);
    await page.getByLabel(/^Contraseña/).fill('Contraseña-test-123');
    await page.getByRole('button', {name: 'Crear cuenta', exact: true}).click();
    await page.getByRole('heading', {name: 'Confirma tu correo', exact: true}).waitFor();
    assert.match(await page.getByRole('alert').textContent(), /límite/);
    assert.ok(await page.evaluate(key => Number(localStorage.getItem(key)) > Date.now(), deadlineKey));
    await fresh();
    loginUnconfirmed = false;
    await page.getByLabel('Correo electrónico').fill(address);
    await page.getByLabel(/^Contraseña/).fill('Contraseña-test-123');
    await page.getByRole('button', {name: 'Entrar', exact: true}).click();
    await page.getByText('Sesión confirmada · Solicitar aprobación').waitFor();
    await fresh();
    await page.getByRole('button', {name: 'He olvidado mi contraseña'}).click();
    await page.getByLabel('Correo electrónico').fill(address);
    await page.getByRole('button', {name: 'Enviar instrucciones'}).click();
    await page.getByRole('status').waitFor();
    assert.equal(count('/recover'), 1);
    assert.deepEqual(errors, []);
    console.log('Browser auth passed: scanner/reload, OTP validation/expiry/session, resend/cooldown, signup/double-click, unconfirmed login, 429, legacy links, Catalan/mobile, normal login and recovery request.');
  } finally {await browser.close();}
})().catch(error => {console.error(error); process.exitCode = 1;});
