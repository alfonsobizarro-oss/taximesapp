/* eslint-disable @typescript-eslint/no-require-imports */
// Run tests/integration-preview/vite.config.mjs first. Local fixture only.
const {chromium}=require('playwright');
const assert=require('node:assert/strict');
(async()=>{
 const browser=await chromium.launch({headless:true,executablePath:process.env.CHROME_PATH});
 try{
  const errors=[];
  async function login(email){
   const context=await browser.newContext({serviceWorkers:'block'});
   await context.route('**/*',route=>new URL(route.request().url()).origin==='http://127.0.0.1:4183'?route.continue():route.abort());
   const page=await context.newPage();page.on('pageerror',e=>errors.push(e.message));
   await page.goto('http://127.0.0.1:4183');
   await page.getByLabel('Correo electrónico').fill(email);await page.getByLabel('Contraseña',{exact:true}).fill('local-test-password');
   await page.getByRole('button',{name:'Entrar',exact:true}).click();return page;
  }
  const pending=await login('new@example.test');
  await pending.getByText('Tu solicitud está pendiente de aprobación por Administración.',{exact:true}).waitFor();
  assert.equal(await pending.getByRole('button',{name:'Administración',exact:true}).count(),0);
  const admin=await login('admin@example.test');
  await admin.getByRole('button',{name:'Administración',exact:true}).click();
  const row=admin.locator('.user-row').filter({hasText:'Usuario nuevo local'});
  await row.getByRole('button',{name:'Gestionar',exact:true}).click();
  const dialog=admin.getByRole('dialog');
  await dialog.getByRole('combobox').nth(0).click();
  for(const label of ['Administrador','Asesor de Flota','Asociado'])await admin.getByRole('option',{name:label,exact:true}).waitFor();
  await admin.getByRole('option',{name:'Asociado',exact:true}).click();
  await dialog.getByLabel('Monovolumen',{exact:true}).check();await dialog.getByLabel('Adaptado',{exact:true}).check();
  await dialog.getByLabel('Asociado del directorio',{exact:true}).selectOption('real-local');
  await dialog.getByRole('combobox').last().click();await admin.getByRole('option',{name:'Alta',exact:true}).click();
  await dialog.getByRole('button',{name:'Guardar',exact:true}).click();await dialog.waitFor({state:'hidden'});
  assert.match(await row.textContent(),/Asociado/);
  await pending.reload();
  await pending.getByRole('button',{name:'Servicios disponibles',exact:true}).waitFor();
  for(const label of ['Servicios disponibles','Mis servicios','Avisos','Mi perfil'])assert.equal(await pending.getByRole('button',{name:label,exact:true}).count(),1);
  for(const label of ['Administración','Incidencias','Chat interno','Documentos'])assert.equal(await pending.getByRole('button',{name:label,exact:true}).count(),0);
  await pending.getByRole('button',{name:'Mi perfil',exact:true}).click();
  await pending.getByText('Autorizaciones: MONOVOLUMEN · ADAPTADO',{exact:true}).waitFor();
  await pending.setViewportSize({width:390,height:844});
  assert.ok(await pending.evaluate(()=>document.documentElement.scrollWidth<=window.innerWidth),'Mobile layout must not overflow');
  assert.deepEqual(errors,[]);
  console.log('PASS browser: pending account, explicit profile picker, both authorizations and real link, approved Associate limited to four reservation tabs, mobile layout, no runtime errors.');
 }finally{await browser.close()}
})().catch(error=>{console.error(error);process.exitCode=1});
