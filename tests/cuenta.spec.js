// Cuenta: change the password, the recovery code, the safer local copy and the session that ends when the password changes elsewhere.
// The recovery code needs the local Clarea server: `npx wrangler dev --local --port 8797 --var FB_MOCK:http://127.0.0.1:9299` in ../push-worker
// (FB_MOCK: the server sets the new password on the stand-in for Firebase). Without it, that test is skipped.
const { test, expect } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;

const FB = process.env.CLAREA_FB || "http://127.0.0.1:9299";
const WORKER = process.env.CLAREA_WORKER || "http://127.0.0.1:8797";
const PASS = "prueba123", PASS2 = "nueva4567", PASS3 = "otra89012";

async function devApi(page){ await page.addInitScript(fb => { try { localStorage.setItem("clarea-dev-api", fb); } catch(e){} }, FB); }
async function useWorker(page){
  await page.addInitScript(url => {
    let v = {};
    Object.defineProperty(window, "CLAREA_PUSH", {configurable: true, get: () => Object.assign({}, v, {url}), set: x => { v = x || {}; }});
    const tok = async () => "dev|uid-" + window.PJ6USER + "|" + window.PJ6USER;
    Object.defineProperty(window, "clareaIdToken", {configurable: true, get: () => tok, set: () => {}});
  }, WORKER);
  await page.route(WORKER + "/**", async route => {
    const cors = {"access-control-allow-origin": "*", "access-control-allow-headers": "Content-Type", "access-control-allow-methods": "GET, POST, OPTIONS"};
    if (route.request().method() === "OPTIONS") return route.fulfill({status: 204, headers: cors});
    const r = await route.fetch();
    await route.fulfill({response: r, headers: Object.assign({}, r.headers(), cors)});
  });
}
async function workerUp(){ try { return (await fetch(WORKER + "/")).ok; } catch (e) { return false; } }
async function signUp(page, base){
  await page.goto((base || "") + "/index.html");
  const user = "t" + Math.random().toString(36).slice(2, 10), f = page.locator(".authwrap form");
  for (let i = 0; i < 3 && !(await f.locator('[name="pass2"]').isVisible()); i++){
    await page.getByRole("button", { name: "Crear cuenta" }).first().click();
    await f.locator('[name="pass2"]').waitFor({ state: "visible", timeout: 4000 }).catch(() => {});
  }
  await f.locator('[name="user"]').fill(user);
  await f.locator('[name="pass"]').fill(PASS);
  await f.locator('[name="pass2"]').fill(PASS);
  await f.locator('button[type="submit"]').first().click();
  await page.locator('[data-grp="DAW-2A"]').click();
  await page.locator("[data-gok]").click();
  await page.locator("[data-wskip]").click();
  await expect(page.locator(".hello h1")).toContainText(user);
  return user;
}
async function logIn(page, user, pass){
  const f = page.locator(".authwrap form");
  await f.locator('[name="user"]').fill(user);
  await f.locator('[name="pass"]').fill(pass);
  await f.locator('button[type="submit"]').first().click();
}
async function logOut(page){
  await page.evaluate(() => window.clareaAcct.logout());
  await expect(page.locator(".authwrap form")).toBeVisible({ timeout: 10000 });
}
// Yo → «Contraseña»: the app gives security() the element of its page; here, an element over the whole screen
async function openSecurity(page){
  await page.evaluate(() => {
    const d = document.createElement("div"); d.id = "t-mesec"; d.className = "npf";
    d.style.cssText = "position:fixed;inset:0;z-index:90;overflow:auto;background:var(--bg);color:var(--fg);padding:24px 16px";
    document.body.appendChild(d); window.clareaAcct.security(d);
  });
  return page.locator("#t-mesec");
}
// Yo → «Papelera»: like the page of the password, an element over the whole screen
async function openTrash(page){
  await page.evaluate(() => {
    const old = document.getElementById("t-metrash"); if (old) old.remove();
    const d = document.createElement("div"); d.id = "t-metrash"; d.className = "npf";
    d.style.cssText = "position:fixed;inset:0;z-index:90;overflow:auto;background:var(--bg);color:var(--fg);padding:24px 16px";
    document.body.appendChild(d); window.clareaAcct.trash(d);
  });
  return page.locator("#t-metrash");
}
// Yo → «Copias»
async function openBackups(page){
  await page.evaluate(() => {
    const old = document.getElementById("t-mebk"); if (old) old.remove();
    const d = document.createElement("div"); d.id = "t-mebk"; d.className = "npf";
    d.style.cssText = "position:fixed;inset:0;z-index:90;overflow:auto;background:var(--bg);color:var(--fg);padding:24px 16px";
    document.body.appendChild(d); window.clareaAcct.backups(d);
  });
  return page.locator("#t-mebk");
}
const lsPut = (page, user, key, val) => page.evaluate(([u, k, v]) => v === null ? localStorage.removeItem("u/" + u + "/" + k) : localStorage.setItem("u/" + u + "/" + k, typeof v === "string" ? v : JSON.stringify(v)), [user, key, val]);
const lsRead = (page, user, key) => page.evaluate(([u, k]) => JSON.parse(localStorage.getItem("u/" + u + "/" + k)), [user, key]);
async function axe(page, name){
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const bad = r.violations.filter(v => v.impact === "serious" || v.impact === "critical");
  expect(bad.map(v => name + ": " + v.id + " " + v.nodes.map(n => n.target.join(" ")).join(", "))).toEqual([]);
}

for (const scheme of ["light", "dark"]) test.describe("modo " + scheme, () => {
  test.use({ colorScheme: scheme });

  test("cambiar la contraseña y la copia del dispositivo protegida", async ({ page }) => {
    await devApi(page);
    const user = await signUp(page);
    // the copy kept for entering without internet: PBKDF2
    expect(await page.evaluate(u => JSON.parse(localStorage.getItem("pj6-accounts") || localStorage.getItem("clarea-accounts") || "{}")[u], user)).toMatchObject({kdf: "p2"});
    const dlg = await openSecurity(page);
    await expect(dlg.getByRole("heading", { name: "Código de recuperación" })).toBeVisible();
    await axe(page, "contraseña");
    await dlg.getByRole("button", { name: "Cambiar la contraseña" }).click();
    const f = dlg.locator("form[data-pw]");
    await axe(page, "contraseña abierta");
    await f.locator('[name="p0"]').fill("mala1234");
    await f.locator('[name="p1"]').fill(PASS2);
    await f.locator('[name="p2"]').fill(PASS2);
    await f.getByRole("button", { name: "Cambiar contraseña" }).click();
    await expect(f.locator(".autherr")).toContainText("no es correcta");
    await f.locator('[name="p0"]').fill(PASS);
    await f.getByRole("button", { name: "Cambiar contraseña" }).click();
    await expect(f).toBeHidden();
    await page.evaluate(() => document.getElementById("t-mesec").remove());
    await logOut(page);
    await logIn(page, user, PASS);
    await expect(page.locator(".autherr")).toContainText("incorrect");
    await logIn(page, user, PASS2);
    await expect(page.locator(".hello h1")).toContainText(user);
  });

  test("con la contraseña cambiada en otro dispositivo, aquí se cierra la sesión", async ({ page, browser }) => {
    await devApi(page);
    const user = await signUp(page);
    // the same account on a second device
    const other = await browser.newPage();
    await devApi(other);
    await other.goto("/index.html");
    await logIn(other, user, PASS);
    await expect(other.locator(".hello h1")).toContainText(user);
    await other.evaluate(([a, b]) => window.clareaAcct.changePw(a, b), [PASS, PASS2]);
    // here: the pass runs out, the next sync finds out
    await page.evaluate(u => { const k = "clarea-cloud/" + u, c = JSON.parse(localStorage.getItem(k)); c.exp = 0; localStorage.setItem(k, JSON.stringify(c)); }, user);
    await page.evaluate(() => window.clareaAcct.sync());
    await expect(page.locator(".authinfo")).toContainText("se ha cerrado desde otro dispositivo", { timeout: 10000 });
    await expect(page.locator('.authwrap [name="user"]')).toHaveValue(user);
    await logIn(page, user, PASS2);
    await expect(page.locator(".hello h1")).toContainText(user);
    await other.close();
  });

  test("código de recuperación: crearlo y poner una contraseña nueva con él", async ({ page }) => {
    test.skip(!(await workerUp()), "sin el servidor local de Clarea (wrangler dev)");
    await devApi(page); await useWorker(page);
    const user = await signUp(page);
    const dlg = await openSecurity(page);
    await dlg.getByRole("button", { name: "Crear código" }).click();
    const code = (await dlg.locator(".seccode").textContent()).trim();
    expect(code).toMatch(/^[A-Z0-9]{4}(-[A-Z0-9]{4}){3}$/);
    await axe(page, "código");
    await dlg.getByRole("button", { name: "Ya lo he guardado" }).click();
    await expect(dlg.locator("[data-rec]")).toContainText("Tienes un código");
    await page.evaluate(() => document.getElementById("t-mesec").remove());
    await logOut(page);
    await page.getByRole("button", { name: "¿Has olvidado la contraseña?" }).click();
    await page.getByRole("button", { name: "← Entrar" }).click();                 // back to the login, as it was
    await expect(page.locator(".authwrap form").first()).toBeVisible();
    await expect(page.locator(".authinfo")).toBeHidden();
    await page.getByRole("button", { name: "¿Has olvidado la contraseña?" }).click();
    const r = page.locator(".authrec form");
    await r.locator('[name="user"]').fill(user);
    await r.locator('[name="code"]').fill("AAAA-BBBB-CCCC-DDDD");
    await r.locator('[name="p1"]').fill(PASS3);
    await r.locator('[name="p2"]').fill(PASS3);
    await axe(page, "recuperar");
    await r.getByRole("button", { name: "Cambiar y entrar" }).click();
    await expect(r.locator(".autherr")).toContainText("incorrectos");
    await r.locator('[name="code"]').fill(code.toLowerCase());
    await r.getByRole("button", { name: "Cambiar y entrar" }).click();
    await expect(page.locator(".hello h1")).toContainText(user);
    // the code is used up: it doesn't work twice
    const again = await page.evaluate(([w, u, c]) => fetch(w + "/account", {method: "POST", headers: {"Content-Type": "application/json"}, body: JSON.stringify({op: "reset", u, code: c, pass: "otra000000"})}).then(r => r.status), [WORKER, user, code]);
    expect(again).toBe(400);
  });
  test("cerrar sesión en los demás dispositivos", async ({ page, browser }) => {
    test.skip(!(await workerUp()), "sin el servidor local de Clarea (wrangler dev)");
    await devApi(page); await useWorker(page);
    const user = await signUp(page);
    const other = await browser.newPage();
    await devApi(other); await useWorker(other);
    await other.goto("/index.html");
    await logIn(other, user, PASS);
    await expect(other.locator(".hello h1")).toContainText(user);
    const sec = await openSecurity(page);
    await sec.getByRole("button", { name: "Cerrar sesión en los demás" }).click();
    await axe(page, "otros dispositivos");
    const f = sec.locator("form[data-out]");
    await f.locator('[name="p0"]').fill("mala1234");
    await f.getByRole("button", { name: "Cerrar en los demás" }).click();
    await expect(f.locator(".autherr")).toContainText("no es correcta");
    await f.locator('[name="p0"]').fill(PASS);
    await f.getByRole("button", { name: "Cerrar en los demás" }).click();
    await expect(f).toBeHidden({ timeout: 10000 });
    const expire = (pg, u) => pg.evaluate(u => { const k = "clarea-cloud/" + u, c = JSON.parse(localStorage.getItem(k)); c.exp = 0; localStorage.setItem(k, JSON.stringify(c)); }, u);
    // the other device: its session ends
    await expire(other, user); await other.evaluate(() => window.clareaAcct.sync());
    await expect(other.locator(".authinfo")).toContainText("se ha cerrado desde otro dispositivo", { timeout: 10000 });
    // this one stays open
    await page.evaluate(() => document.getElementById("t-mesec").remove());
    await expire(page, user); await page.evaluate(() => window.clareaAcct.sync());
    await expect(page.locator(".hello h1")).toContainText(user);
    expect(await page.evaluate(() => window.clareaAcct.info().on)).toBe(true);
    await other.close();
  });
  test("papelera: lo borrado se recupera (también un proyecto con su código)", async ({ page }) => {
    await devApi(page);
    const user = await signUp(page);
    let trash = await openTrash(page);
    await expect(trash).toContainText("Está vacía");
    // an event deleted from the calendar
    await lsPut(page, user, "clarea-events", {t: 1, list: [{id: "e1", name: "Examen teórico SM7"}, {id: "e2", name: "Entrega PJ6"}]});
    await lsPut(page, user, "clarea-events", {t: 2, list: [{id: "e2", name: "Entrega PJ6"}]});
    // a project: first its code, then the list (as the project page does)
    await lsPut(page, user, "clarea-projs", {t: 1, list: [{id: "p1", name: "Tienda PHP"}]});
    await lsPut(page, user, "clarea-pcode-p1", {"index.php": "<?php echo 1;"});
    await lsPut(page, user, "clarea-pcode-p1", null);
    await lsPut(page, user, "clarea-projs", {t: 2, list: []});
    // all the grades of a subject
    await lsPut(page, user, "clarea-notas-PJ6", {t: 1, items: [{id: "m1", name: "Práctica 1", grade: 8}]});
    await lsPut(page, user, "clarea-notas-PJ6", null);
    // an old entry: more than 30 days, gone
    await lsPut(page, user, "clarea-trash-viejo", {id: "viejo", t: 1, at: Date.now() - 31 * 864e5, k: "clarea-tasks", f: "list", kind: "Tarea", name: "Tarea vieja", item: {id: "t0", name: "Tarea vieja"}});
    trash = await openTrash(page);
    await expect(trash.locator(".trl li")).toHaveCount(3);
    await expect(trash).not.toContainText("Tarea vieja");
    await axe(page, "papelera");
    await trash.locator("li", { hasText: "Examen teórico SM7" }).getByRole("button", { name: "Recuperar" }).click();
    expect((await lsRead(page, user, "clarea-events")).list.map(x => x.id).sort()).toEqual(["e1", "e2"]);
    await trash.locator("li", { hasText: "Tienda PHP" }).getByRole("button", { name: "Recuperar" }).click();
    expect((await lsRead(page, user, "clarea-projs")).list.map(x => x.id)).toEqual(["p1"]);
    expect(await lsRead(page, user, "clarea-pcode-p1")).toEqual({"index.php": "<?php echo 1;"});
    await trash.locator("li", { hasText: "Notas de PJ6" }).getByRole("button", { name: "Recuperar" }).click();
    expect((await lsRead(page, user, "clarea-notas-PJ6")).items[0].grade).toBe(8);
    await expect(trash).toContainText("Está vacía");
    // and it is synced: an entry reaches the cloud
    await lsPut(page, user, "clarea-tasks", {t: 1, list: [{id: "t1", name: "Deberes SM6"}]});
    await lsPut(page, user, "clarea-tasks", {t: 2, list: []});
    await page.evaluate(() => window.clareaAcct.sync());
    const docs = await (await fetch(FB + "/debug")).json();
    expect(Object.values(docs.docs).some(d => d.name.includes("clarea-trash-") && (d.fields.v || {}).stringValue && d.fields.v.stringValue.includes("Deberes SM6"))).toBe(true);
    // emptying it
    trash = await openTrash(page);
    await trash.getByRole("button", { name: "Vaciar la papelera" }).click();
    await page.locator(".cdlg").getByRole("button", { name: "Vaciar" }).click();
    await expect(trash).toContainText("Está vacía");
  });
  test("tus dispositivos: verlos y cerrar uno", async ({ page, browser }) => {
    test.skip(!(await workerUp()), "sin el servidor local de Clarea (wrangler dev)");
    await devApi(page); await useWorker(page);
    const user = await signUp(page);
    const other = await browser.newPage();
    await devApi(other); await useWorker(other);
    await other.goto("/index.html");
    await logIn(other, user, PASS);
    await expect(other.locator(".hello h1")).toContainText(user);
    await other.waitForTimeout(1500);                                  // (it says hello after its first sync)
    const sec = await openSecurity(page);
    const rows = sec.locator("[data-devs] li");
    await expect(rows).toHaveCount(2);
    await expect(rows.first()).toContainText("este");
    await axe(page, "dispositivos");
    await rows.nth(1).getByRole("button", { name: "Cerrar" }).click();
    await expect(rows).toHaveCount(1);
    // the other device: at its next hello (opening Clarea) its session ends
    await other.reload();
    await expect(other.locator(".authinfo")).toContainText("se ha cerrado desde otro dispositivo", { timeout: 10000 });
    await other.close();
  });
  test("sincronizar al instante entre dos dispositivos abiertos", async ({ page, browser }) => {
    test.skip(!(await workerUp()), "sin el servidor local de Clarea (wrangler dev)");
    await devApi(page); await useWorker(page);
    const user = await signUp(page);
    const other = await browser.newPage();
    await devApi(other); await useWorker(other);
    await other.goto("/index.html");
    await logIn(other, user, PASS);
    await expect(other.locator(".hello h1")).toContainText(user);
    await other.waitForTimeout(2000);                       // (both connected after their first sync)
    // a task on this device: on the other, in seconds (without it, it waits up to 2 minutes)
    await lsPut(page, user, "clarea-tasks", {t: Date.now(), list: [{id: "x1", name: "Deberes de SM6"}]});
    await expect.poll(async () => ((await lsRead(other, user, "clarea-tasks")) || {list: []}).list.map(x => x.name), {timeout: 8000}).toEqual(["Deberes de SM6"]);
    // and back
    await lsPut(other, user, "clarea-tasks", {t: Date.now(), list: []});
    await expect.poll(async () => ((await lsRead(page, user, "clarea-tasks")) || {list: [1]}).list.length, {timeout: 8000}).toBe(0);
    await other.close();
  });
  test("aviso de nuevo inicio de sesión en los otros dispositivos", async ({ page, browser }) => {
    test.skip(!(await workerUp()), "sin el servidor local de Clarea (wrangler dev)");
    await devApi(page); await useWorker(page);
    const user = await signUp(page);
    await page.waitForTimeout(1500);                                   // (this device has said hello)
    const other = await browser.newPage({userAgent: "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/130.0 Safari/537.36"});
    await devApi(other); await useWorker(other);
    await other.goto("/index.html");
    await logIn(other, user, PASS);
    await expect(other.locator(".hello h1")).toContainText(user);
    // here, in seconds: in the notifications, with the kind of device
    await expect.poll(async () => ((await lsRead(page, user, "clarea-notifs")) || {list: []}).list.map(n => n.title + ": " + n.body).join("|"), {timeout: 10000}).toContain("Nuevo inicio de sesión: Windows · Chrome");
    await other.close();
  });
  test("estado de sincronización: el punto de arriba sin internet", async ({ page, context }) => {
    await devApi(page);
    const user = await signUp(page);
    const dot = page.locator(".syncst");
    await expect(dot).toBeHidden();
    await context.setOffline(true);
    await lsPut(page, user, "clarea-tasks", {t: Date.now(), list: [{id: "s1", name: "Sin internet"}]});
    await expect(dot).toBeVisible({ timeout: 6000 });
    await expect(dot).toHaveAttribute("aria-label", /Sin internet: \d+ cambios? por subir/);
    await axe(page, "punto de sincronización");
    await dot.click();
    await expect(page.locator(".toast").last()).toContainText("Se subirá al volver internet");
    await context.setOffline(false);
    await page.evaluate(() => window.clareaAcct.sync());
    await expect(dot).toBeHidden({ timeout: 8000 });
  });

  test("copia semanal: se hace sola y vuelve todo como estaba", async ({ page }) => {
    test.skip(!(await workerUp()), "sin el servidor local de Clarea (wrangler dev)");
    await devApi(page); await useWorker(page);
    const user = await signUp(page);
    await lsPut(page, user, "clarea-events", {t: Date.now(), list: [{id: "e1", name: "Examen SM7"}]});
    await page.evaluate(() => window.clareaAcct.sync());
    // opening Clarea: no copy this week yet, so it makes one
    await page.reload();
    await expect(page.locator(".hello h1")).toContainText(user);
    await expect.poll(async () => !!(await lsRead(page, user, "clarea-backup-last")), {timeout: 12000}).toBe(true);
    let bk = await openBackups(page);
    await expect(bk.locator(".trl li")).toHaveCount(1);
    await axe(page, "copias");
    // later: the exam deleted, a new one…
    await lsPut(page, user, "clarea-events", {t: Date.now(), list: [{id: "e2", name: "Entrega PJ6"}]});
    await bk.getByRole("button", { name: "Recuperar" }).click();
    await page.locator(".cdlg").getByRole("button", { name: "Recuperar" }).click();
    await expect.poll(async () => (await lsRead(page, user, "clarea-events")).list.map(x => x.name).join(), {timeout: 8000}).toBe("Examen SM7");
    // …and what the copy took away is in the trash
    const trash = await openTrash(page);
    await expect(trash).toContainText("Entrega PJ6");
  });
});
