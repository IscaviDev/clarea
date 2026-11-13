// Shared by every test file: a fresh account, the local server (Worker), a fake Gemini and the accessibility scan.
const { expect } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;

const PASS = "prueba123";
const newUser = () => "t" + Math.random().toString(36).slice(2, 10);
// the local Clarea server (wrangler dev --local, started by playwright.config.js when ../push-worker is here)
const WORKER = process.env.CLAREA_WORKER || "http://127.0.0.1:8797";   // CLAREA_WORKER: another local server (sessions in parallel)

// a fresh account on the local stand-in for Firebase, class DAW-2A, welcome skipped
async function signUp(page, user){
  await page.addInitScript(() => { try { localStorage.setItem("clarea-dev-api", "http://127.0.0.1:9299"); } catch(e){} });
  await page.goto("/index.html");
  user = user || newUser();
  const f = page.locator(".authwrap form");
  // the «Crear cuenta» tab (tapped again until the second password field shows: the page may still be starting)
  for (let i = 0; i < 3 && !(await f.locator('[name="pass2"]').isVisible()); i++){
    await page.getByRole("button", { name: "Crear cuenta" }).first().click();
    await f.locator('[name="pass2"]').waitFor({ state: "visible", timeout: 4000 }).catch(() => {});
  }
  await f.locator('[name="user"]').fill(user);
  await f.locator('[name="pass"]').fill(PASS);
  await f.locator('[name="pass2"]').fill(PASS);
  await f.locator('button[type="submit"], .btn[type="submit"]').first().click();
  await page.locator('[data-grp="DAW-2A"]').click();
  await page.locator("[data-gok]").click();
  await page.locator("[data-wskip]").click();                         // the welcome, once
  await expect(page.locator(".hello h1")).toContainText(user);
  return user;
}
const go = (page, route) => page.evaluate(r => window.clareaGo(r), route);
// something in the account's storage («u/<user>/<key>»), as the app keeps it
const putLocal = (page, user, key, val) => page.evaluate(([u, k, v]) => localStorage.setItem("u/" + u + "/" + k, JSON.stringify(v)), [user, key, val]);
const getLocal = (page, user, key) => page.evaluate(([u, k]) => JSON.parse(localStorage.getItem("u/" + u + "/" + k)), [user, key]);
const ymdIn = days => { const d = new Date(); d.setDate(d.getDate() + days); return d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0"); };

/* The local server, before the page loads:
   - the app talks to it (window.CLAREA_PUSH.url), whatever the built page says;
   - the requests go through Playwright, so the server's CORS list (only clarea.dev and port 8141) doesn't matter;
   - friends and groups: the account proves who it is with a test pass «dev|uid|user», which the server takes only on 127.0.0.1;
   - navigator.share keeps what it was given (window.__shared), so no system sheet opens. */
async function useWorker(page){
  await page.addInitScript(url => {
    let v = {};
    Object.defineProperty(window, "CLAREA_PUSH", {configurable: true, get: () => Object.assign({}, v, {url}), set: x => { v = x || {}; }});
    const tok = async () => "dev|uid-" + window.PJ6USER + "|" + window.PJ6USER;
    Object.defineProperty(window, "clareaIdToken", {configurable: true, get: () => tok, set: () => {}});
    window.__shared = [];
    Object.defineProperty(navigator, "share", {configurable: true, value: async d => { window.__shared.push(d); }});
  }, WORKER);
  await page.route(WORKER + "/**", async route => {
    const cors = {"access-control-allow-origin": "*", "access-control-allow-headers": "Content-Type", "access-control-allow-methods": "GET, POST, OPTIONS"};
    if (route.request().method() === "OPTIONS") return route.fulfill({status: 204, headers: cors});
    // (a call still on its way when the test ends is just dropped: not a failure of the app)
    try { const r = await route.fetch(); await route.fulfill({response: r, headers: Object.assign({}, r.headers(), cors)}); } catch (e) {}
  });
}
async function workerUp(){
  try { const r = await fetch(WORKER + "/"); return r.ok; } catch (e) { return false; }
}
// Claude, as the connector sees it: a JSON-RPC call to /mcp/<key>
async function mcpCall(request, mcpUrl, name, args){
  const r = await request.post(mcpUrl, {data: {jsonrpc: "2.0", id: 1, method: "tools/call", params: {name, arguments: args || {}}}});
  expect(r.ok()).toBeTruthy();
  const j = await r.json();
  const text = ((j.result || {}).content || []).map(c => c.text || "").join("\n");
  return {j, text};
}

/* A fake Gemini: the app's calls to generativelanguage.googleapis.com are answered here (no key, no internet).
   answer(prompt, model) -> the text the model returns, or {status, body} to fail (e.g. 503 «high demand»). */
const FAKE_MODELS = ["gemini-9-flash", "gemini-9-flash-lite", "gemini-8-flash"];
async function fakeGemini(page, answer){
  const calls = [];
  await page.route(/generativelanguage\.googleapis\.com/, async route => {
    const u = new URL(route.request().url());
    if (/\/models$/.test(u.pathname)) return route.fulfill({json: {models: FAKE_MODELS.map(m => ({name: "models/" + m, supportedGenerationMethods: ["generateContent"]}))}});
    const model = decodeURIComponent((u.pathname.match(/models\/([^:]+):/) || [])[1] || "");
    const body = route.request().postDataJSON() || {}, prompt = ((((body.contents || [])[0] || {}).parts) || []).map(p => p.text || "").join("");
    calls.push({model, prompt});
    const a = await answer(prompt, model, calls.length);
    if (a && typeof a === "object" && a.status) return route.fulfill({status: a.status, json: a.body || {error: {code: a.status, message: "This model is currently experiencing high demand.", status: "UNAVAILABLE"}}});
    await route.fulfill({json: {candidates: [{content: {parts: [{text: typeof a === "string" ? a : JSON.stringify(a)}]}, finishReason: "STOP"}]}});
  });
  return calls;
}
// a Gemini key already checked (as Configuración leaves it), so «your AI» is ready
const geminiReady = (page, user, model) => putLocal(page, user, "clarea-ai", {t: Date.now(), prov: "gemini", keys: {gemini: "clave-de-prueba"}, ok: {gemini: "clave-de-prueba"}, models: {gemini: model || FAKE_MODELS[0]}});

async function axe(page, name){
  // light and dark: every screen is checked in both themes
  const light = await axeOnce(page, name);
  await page.emulateMedia({ colorScheme: "dark" }); await page.waitForTimeout(150);
  const dark = await axeOnce(page, name + " (oscuro)");
  await page.emulateMedia({ colorScheme: "light" });
  return light.concat(dark);
}
async function axeOnce(page, name){
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const bad = r.violations.filter(v => v.impact === "serious" || v.impact === "critical");
  if (bad.length) console.log("\n[a11y] " + name + ":\n" + bad.map(v => "  - " + v.id + " (" + v.impact + ", " + v.nodes.length + "): " + v.help + "\n      " + v.nodes.slice(0, 3).map(n => n.target.join(" ")).join("\n      ")).join("\n"));
  return bad;
}

module.exports = { PASS, newUser, WORKER, signUp, go, putLocal, getLocal, ymdIn, useWorker, workerUp, mcpCall, fakeGemini, FAKE_MODELS, geminiReady, axe };
