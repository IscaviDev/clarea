// Sesión: estando dentro, ninguna página vuelve a pedir la sesión (ni la contraseña ni Face ID), y «Recordarme» entra directamente.
// Face ID: Chromium's virtual authenticator. (WebAuthn doesn't take an IP address as the site: these tests use «localhost», like clarea.dev.)
const { test, expect } = require("@playwright/test");

const FB = process.env.CLAREA_FB || "http://127.0.0.1:9299";
const PASS = "prueba123";
const local = () => test.info().project.use.baseURL.replace("127.0.0.1", "localhost");

async function devApi(page){ await page.addInitScript(fb => { try { localStorage.setItem("clarea-dev-api", fb); } catch(e){} }, FB); }
async function faceId(page, ok = true){
  const cdp = await page.context().newCDPSession(page);
  await cdp.send("WebAuthn.enable");
  const {authenticatorId} = await cdp.send("WebAuthn.addVirtualAuthenticator", {options: {protocol: "ctap2", transport: "internal", hasResidentKey: true, hasUserVerification: true, isUserVerified: ok, automaticPresenceSimulation: true}});
  return v => cdp.send("WebAuthn.setUserVerified", {authenticatorId, isUserVerified: v});
}
async function signUp(page, remember = true){
  await page.goto(local() + "/index.html");
  const user = "t" + Math.random().toString(36).slice(2, 10), f = page.locator(".authwrap form");
  for (let i = 0; i < 3 && !(await f.locator('[name="pass2"]').isVisible()); i++){
    await page.getByRole("button", { name: "Crear cuenta" }).first().click();
    await f.locator('[name="pass2"]').waitFor({ state: "visible", timeout: 4000 }).catch(() => {});
  }
  await f.locator('[name="user"]').fill(user);
  await f.locator('[name="pass"]').fill(PASS);
  await f.locator('[name="pass2"]').fill(PASS);
  if (!remember) await f.locator('[name="remember"]').uncheck();
  await f.locator('button[type="submit"]').first().click();
  await page.locator('[data-grp="DAW-2A"]').click();
  await page.locator("[data-gok]").click();
  await page.locator("[data-wskip]").click();
  await expect(page.locator(".hello h1")).toContainText(user);
  return user;
}
async function activateFaceId(page){
  await page.evaluate(() => {
    const d = document.createElement("div"); d.id = "t-mesec";
    d.style.cssText = "position:fixed;inset:0;z-index:90;overflow:auto;background:var(--bg);padding:24px 16px";
    document.body.appendChild(d); window.clareaAcct.security(d);
  });
  await page.locator("#t-mesec").getByRole("button", { name: "Activar Face ID" }).click();
  await expect(page.locator("#t-mesec").getByRole("button", { name: "Quitar Face ID" })).toBeVisible();
  await page.evaluate(() => document.getElementById("t-mesec").remove());
}
const put = (page, user, key, val) => page.evaluate(([u, k, v]) => localStorage.setItem("u/" + u + "/" + k, JSON.stringify(v)), [user, key, val]);
// a page opened while inside: no login, no lock, and the same account
async function inside(page, user, url){
  await page.goto(local() + url);
  await page.waitForLoadState("load"); await page.waitForTimeout(1200);
  await expect(page.locator(".authwrap"), url).toHaveCount(0);
  expect(await page.evaluate(() => window.PJ6USER || null), url).toBe(url.startsWith("/privacidad") ? null : user);
}
const PAGES = ["/index.html", "/proyecto.html?id=p1", "/proyecto.html?id=p1&tab=ia", "/preguntas.html?id=q1", "/preguntas.html?id=q1&ronda=3",
               "/privacidad.html", "/calendario", "/yo", "/yo/contrasena", "/asig/PJ6", "/index.html"];

test("ya dentro, ninguna página vuelve a pedir la sesión (ni con Face ID activado)", async ({ page }) => {
  await devApi(page); await faceId(page);
  const user = await signUp(page);
  await put(page, user, "clarea-projs", {t: Date.now(), list: [{id: "p1", subj: "PJ6", name: "Tienda PHP", files: 1, lines: 1, created: Date.now()}]});
  await put(page, user, "clarea-pcode-p1", {"index.php": "<?php echo 1;"});
  await put(page, user, "clarea-qsets", {t: Date.now(), list: [{id: "q1", subj: "PJ6", name: "Preguntas PHP", lang: "es", qs: [{n: 1, q: "¿Qué es PHP?", a: "Un lenguaje"}], created: Date.now()}]});
  for (const u of PAGES) await inside(page, user, u);
  // with Face ID activated: the same, and also coming back to Clarea after a long while
  await activateFaceId(page);
  for (const u of PAGES) await inside(page, user, u);
  await page.evaluate(() => {
    sessionStorage.setItem("clarea-away", String(Date.now() - 60 * 60000));
    Object.defineProperty(document, "visibilityState", {configurable: true, get: () => "visible"});
    document.dispatchEvent(new Event("visibilitychange"));
  });
  await page.waitForTimeout(600);
  await expect(page.locator(".authwrap")).toHaveCount(0);
});

test("«Recordarme»: abrir Clarea entra directamente, también con Face ID activado", async ({ page }) => {
  await devApi(page);
  const setUV = await faceId(page, true);
  const user = await signUp(page);                          // «Recordarme» is ticked by default
  await activateFaceId(page);
  // opening Clarea again: straight in
  await page.goto(local() + "/index.html");
  await expect(page.locator(".hello h1")).toContainText(user);
  await expect(page.locator(".authwrap")).toHaveCount(0);
  // after «Cerrar sesión»: one tap, and it never asks Face ID (if it did, this phone would say no)
  await setUV(false);
  await page.evaluate(() => window.clareaAcct.logout());
  const row = page.locator(".authknown [data-pick]", { hasText: user });
  await expect(row).toContainText("Recordada · sin contraseña");
  await row.click();
  await expect(page.locator(".hello h1")).toContainText(user);
});

test("sin «Recordarme»: con Face ID se vuelve a entrar sin contraseña; sin él, la pide", async ({ page }) => {
  await devApi(page); await faceId(page, true);
  const user = await signUp(page, false);
  // while inside, still never asked
  await page.goto(local() + "/proyecto.html?id=nada");
  await page.waitForTimeout(1000);
  await expect(page.locator(".authwrap")).toHaveCount(0);
  await page.goto(local() + "/index.html");
  await activateFaceId(page);
  await page.evaluate(() => window.clareaAcct.logout());
  const row = page.locator(".authknown [data-pick]", { hasText: user });
  await expect(row).toContainText("Con Face ID");
  await row.click();
  await expect(page.locator(".hello h1")).toContainText(user);
  // Face ID taken away: the password, as always
  await page.evaluate(() => { const d = document.createElement("div"); document.body.appendChild(d); window.clareaAcct.security(d); d.id = "x"; });
  await page.locator("#x").getByRole("button", { name: "Quitar Face ID" }).click();
  await page.evaluate(() => window.clareaAcct.logout());
  await expect(page.locator(".authknown [data-pick]", { hasText: user })).toContainText("Pide la contraseña");
});
