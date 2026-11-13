// Amigos y grupos: the list, a friend's profile and the notices switch (the server is stood in for: /social answers fake data).
const { test, expect } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;

const PASS = "prueba123";
async function signUp(page){
  await page.addInitScript(() => { try { localStorage.setItem("clarea-dev-api", "http://127.0.0.1:9299"); } catch(e){} });
  await page.goto("/index.html");
  const user = "t" + Math.random().toString(36).slice(2, 10), f = page.locator(".authwrap form");
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
  await page.locator("[data-wskip]").click();
  await expect(page.locator(".hello h1")).toContainText(user);
  return user;
}
// the chat fills the screen between Clarea's header and the tabs, with no gaps: header · chat's top · messages · box to write · tabs
async function chatLayout(page){
  return page.evaluate(() => { const r = q => document.querySelector(q).getBoundingClientRect();
    return {hdr: r(".cbar"), top: r(".chhead"), log: r("#chatlog"), comp: r("#chf"), tabs: r(".tabbar"), vh: innerHeight, scrollY: scrollY}; });
}
function expectNoGaps(L, label){
  const near = (a, b, what) => expect(Math.abs(a - b), label + ": " + what + " (" + a + " / " + b + ")").toBeLessThan(2);
  near(L.hdr.top, 0, "la cabecera arriba del todo");
  near(L.top.top, L.hdr.bottom, "la barra del chat justo debajo de la cabecera");
  near(L.log.top, L.top.bottom, "los mensajes justo debajo");
  near(L.comp.top, L.log.bottom, "la caja de escribir justo debajo de los mensajes");
  near(L.comp.bottom, L.tabs.top, "la caja de escribir justo encima de las pestañas");
  near(L.tabs.bottom, L.vh, "las pestañas abajo del todo");
  expect(L.scrollY, label + ": la página no se desplaza").toBe(0);
}
async function axe(page, name){
  const out = [];
  for (const scheme of ["light", "dark"]){
    await page.emulateMedia({ colorScheme: scheme }); await page.waitForTimeout(150);
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const bad = r.violations.filter(v => v.impact === "serious" || v.impact === "critical");
    if (bad.length) console.log("\n[a11y] " + name + " (" + scheme + "):\n" + bad.map(v => "  - " + v.id + ": " + v.help + "\n      " + v.nodes.slice(0, 3).map(n => n.target.join(" ")).join("\n      ")).join("\n"));
    out.push(...bad);
  }
  await page.emulateMedia({ colorScheme: "light" });
  return out;
}

test("amigos: perfil de un amigo, crear un grupo juntos y avisos", async ({ page }) => {
  const user = await signUp(page);
  const soon = new Date(Date.now() + 3 * 864e5), ymd = soon.getFullYear() + "-" + String(soon.getMonth() + 1).padStart(2, "0") + "-" + String(soon.getDate()).padStart(2, "0");
  const state = {mute: false, sent: []};
  const me = {uid: "u0", u: user}, ana = {uid: "u1", u: "ana"}, leo = {uid: "u2", u: "leo"};
  const view = () => ({u: user, code: "TEST-4F2K", mute: state.mute, friends: [ana, leo], inReq: [], outReq: [],
    groups: [{id: "g1", name: "PJ6 equipo", color: "#7b5ea7", owner: "u0", members: [me, ana], events: [{id: "e1", subj: "BD", type: "teorico", name: "Examen de BD", date: ymd, from: "09:00", to: "11:00", by: "ana"}]}]});
  await page.route("**/social", async route => {
    const b = JSON.parse(route.request().postData() || "{}"); state.sent.push(b);
    if (b.op === "prefs") state.mute = !!b.mute;
    await route.fulfill({ status: 200, contentType: "application/json", headers: {"Access-Control-Allow-Origin": "*"}, body: JSON.stringify(view()) });
  });
  await page.evaluate(() => { window.clareaIdToken = async () => "test-token"; window.clareaGo("amigos"); });

  // the list: each friend says how many groups we share
  const row = page.locator('[data-socprof="u1"]');
  await expect(row).toContainText("1 grupo en común");
  await expect(page.locator('[data-socprof="u2"]')).toContainText("Sin grupos en común");
  expect(state.sent[0].tz).toBe("Europe/Madrid");
  await page.screenshot({ path: "test-results/amigos-lista.png", fullPage: true });
  expect(await axe(page, "amigos")).toEqual([]);

  // a friend's profile: groups in common and what's next in them
  await row.click();
  const win = page.locator(".pkp");
  await expect(win.locator(".socph")).toContainText("ana");
  await expect(win.locator(".socchip")).toHaveText("PJ6 equipo");
  await expect(win.locator(".socev")).toContainText("Examen de BD");
  await expect(win.locator(".pkx")).toBeVisible();                                   // close at the top
  await page.screenshot({ path: "test-results/amigos-perfil.png" });
  expect(await axe(page, "perfil de un amigo")).toEqual([]);

  // «Crear un grupo juntos»: only that friend is chosen
  await win.locator('[data-pv="grp"]').click();
  await expect(page.locator('#socgmem [data-socmem="u1"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('#socgmem [data-socmem="u2"]')).toHaveAttribute("aria-pressed", "false");
  await page.locator(".pkx").last().click();

  // the notices switch
  const sw = page.locator("[data-socmute]");
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "false");
  expect(state.sent.some(b => b.op === "prefs" && b.mute === true)).toBe(true);
});

test("grupo: enlace para unirse, silenciar el grupo y quitar a alguien", async ({ page }) => {
  // the app's token for the stand-in server (kept across page loads)
  await page.addInitScript(() => { Object.defineProperty(window, "clareaIdToken", {get: () => async () => "test-token", set(){}, configurable: true}); });
  const user = await signUp(page);
  const state = {muted: false, members: ["u0", "u1", "u2"], sent: [], shared: null};
  const people = {u0: user, u1: "ana", u2: "leo"};
  const view = () => ({u: user, code: "TEST-4F2K", mute: false, friends: [{uid: "u1", u: "ana"}], inReq: [], outReq: [],
    groups: [{id: "g1", name: "PJ6 equipo", color: "#7b5ea7", owner: "u0", mine: true, muted: state.muted, members: state.members.map(uid => ({uid, u: people[uid]})), events: [], tasks: []}]});
  await page.route("**/social", async route => {
    const b = JSON.parse(route.request().postData() || "{}"); state.sent.push(b);
    let out = view();
    if (b.op === "group-mute") { state.muted = !!b.mute; out = view(); }
    if (b.op === "group-kick") { state.members = state.members.filter(x => x !== b.uid); out = view(); }
    if (b.op === "group-link") out = {ginv: "AbCdEfGhIjKlMnOp", name: "PJ6 equipo", u: user};
    if (b.op === "group-join-info") out = {name: "DAW tarde", color: "#1b7a63", n: 5, by: "marta", in: false, full: false};
    if (b.op === "chat-list") out = {msgs: []};
    await route.fulfill({ status: 200, contentType: "application/json", headers: {"Access-Control-Allow-Origin": "*"}, body: JSON.stringify(out) });
  });
  await page.evaluate(() => { navigator.share = async d => { window.__shared = d; }; window.clareaGo("grupos/g1/info"); });

  // whoever created the group sees «Quitar» next to the others (not next to themself)
  await expect(page.locator('[data-socgkick="g1|u1"]')).toBeVisible();
  await expect(page.locator('[data-socgkick="g1|u0"]')).toHaveCount(0);
  const sw = page.locator('[data-socgmute="g1"]');
  await expect(sw).toHaveAttribute("aria-checked", "true");
  const skip = page.locator("[data-wskip]"); if (await skip.isVisible()) await skip.click();   // (the welcome may come back on a new page)
  await page.waitForTimeout(300);
  await page.screenshot({ path: "test-results/grupo-info.png", fullPage: true });
  expect(await axe(page, "grupo · info")).toEqual([]);

  // silence this group
  await sw.click();
  await expect(sw).toHaveAttribute("aria-checked", "false");
  await expect(sw).toContainText("Sus exámenes te siguen avisando");
  expect(state.sent.some(b => b.op === "group-mute" && b.gid === "g1" && b.mute === true)).toBe(true);

  // take ana out (after confirming)
  await page.locator('[data-socgkick="g1|u1"]').click();
  await page.getByRole("button", { name: "Quitar", exact: true }).last().click();
  await expect(page.locator('[data-socgkick="g1|u1"]')).toHaveCount(0);
  expect(state.sent.some(b => b.op === "group-kick" && b.uid === "u1")).toBe(true);

  // invite with a link: shared with the system's share sheet
  await page.locator('[data-socglink="g1"]').click();
  await expect.poll(() => page.evaluate(() => window.__shared && window.__shared.url)).toContain("grupos?ginv=AbCdEfGhIjKlMnOp");

  // someone opens a link: the card to join
  await page.goto("/grupos?ginv=AbCdEfGhIjKlMnOp");
  const card = page.locator(".socinv");
  await expect(card).toContainText("marta te invita a «DAW tarde»");
  await expect(card).toContainText("5 personas");
  await page.screenshot({ path: "test-results/grupo-unirse.png" });
  expect(await axe(page, "grupo · unirse")).toEqual([]);
  await card.locator("[data-socgjoin]").click();
  await expect.poll(() => state.sent.some(b => b.op === "group-join" && b.ginv === "AbCdEfGhIjKlMnOp")).toBe(true);
});

test("chat del grupo: como WhatsApp (cabecera, burbujas, día y escribir abajo)", async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, "clareaIdToken", {get: () => async () => "test-token", set(){}, configurable: true}); });
  const user = await signUp(page);
  const now = Date.now(), msgs = [
    {id: "1", u: "ana", text: "¿Alguien tiene los apuntes de SM6?", at: now - 3600e3 * 2},
    {id: "2", u: "ana", text: "Los del tema 4", at: now - 3600e3 * 2 + 30e3},
    {id: "3", u: user, text: "Yo sí, ahora te los paso", at: now - 3600e3, reply: {u: "ana", text: "¿Alguien tiene los apuntes de SM6?"}},
    {id: "4", u: "leo", text: "Y yo los del 5. ¿Quedamos el jueves en la biblio para repasar?", at: now - 1800e3},
    {id: "5", u: user, text: "Vale 👍", at: now - 60e3}];
  const sent = [];
  await page.route("**/social", async route => {
    const b = JSON.parse(route.request().postData() || "{}"); sent.push(b);
    let out = {u: user, code: "TEST-4F2K", mute: false, friends: [], inReq: [], outReq: [],
      groups: [{id: "g1", name: "Los chavales", color: "#7b5ea7", owner: "u0", mine: true, muted: false, members: [{uid: "u0", u: user}, {uid: "u1", u: "ana"}, {uid: "u2", u: "leo"}], events: [], tasks: []}]};
    if (b.op === "chat-list") out = {msgs: b.gid === "g1" ? msgs : []};
    if (b.op === "chat-send") { const m = {id: "9", u: user, text: b.text, at: Date.now()}; msgs.push(m); out = {msg: m}; }
    await route.fulfill({ status: 200, contentType: "application/json", headers: {"Access-Control-Allow-Origin": "*"}, body: JSON.stringify(out) });
  });
  await page.evaluate(() => window.clareaGo("grupos/g1"));
  const skip = page.locator("[data-wskip]"); if (await skip.isVisible()) await skip.click();

  // the chat's bar (as in the style guide): ←, the group's circle, its name and who's in it, and its photos
  await expect(page.locator('.chhead [aria-label="Volver a Grupos"]')).toBeVisible();
  await expect(page.locator(".chhead .chwho b")).toHaveText("Los chavales");
  await expect(page.locator(".chhead .chwho small")).toHaveText("ana, leo, tú");
  await expect(page.locator('.chhead [aria-label="Fotos del grupo"]')).toBeVisible();
  // «Enviar» is off while there's nothing written
  await expect(page.locator("#chf .chsend")).toBeDisabled();
  await expect(page.locator(".cbar")).toBeVisible();
  await expect(page.locator(".tabbar")).toBeVisible();
  // bubbles: mine on the right, the others' with their name once per run
  await expect(page.locator(".chm")).toHaveCount(5);
  await expect(page.locator(".chm.me")).toHaveCount(2);
  await expect(page.locator(".chm .chu")).toHaveText(["ana", "leo"]);
  await expect(page.locator(".chday").last()).toHaveText("Hoy");
  // the whole screen, with no gaps, and the newest message in sight (the messages scroll inside)
  await page.waitForTimeout(300);
  expectNoGaps(await chatLayout(page), "chat del grupo");
  const lastIn = await page.evaluate(() => { const b = document.querySelector("#chatlog"), m = [...b.querySelectorAll(".chm")].pop().getBoundingClientRect(), r = b.getBoundingClientRect(); return m.bottom <= r.bottom + 1 && m.top >= r.top - 1; });
  expect(lastIn).toBe(true);
  // the phone's keyboard (iOS shows less of the screen and shifts it): the header, the chat's top and the box follow what you see
  const kb = await page.evaluate(async () => {
    const real = window.visualViewport, fake = new EventTarget(); fake.height = innerHeight - 300; fake.offsetTop = 120; fake.width = innerWidth;
    Object.defineProperty(window, "visualViewport", {value: fake, configurable: true}); dispatchEvent(new Event("resize"));
    await new Promise(r => requestAnimationFrame(() => requestAnimationFrame(r)));
    const r = q => document.querySelector(q).getBoundingClientRect(), out = {hdr: r(".cbar"), top: r(".chhead"), comp: r("#chf"), vis: {top: fake.offsetTop, bottom: fake.offsetTop + fake.height}};
    Object.defineProperty(window, "visualViewport", {value: real, configurable: true}); dispatchEvent(new Event("resize"));
    return out;
  });
  expect(Math.abs(kb.hdr.top - kb.vis.top)).toBeLessThan(2);                 // Clarea's header at the top of what you see
  expect(Math.abs(kb.top.top - kb.hdr.bottom)).toBeLessThan(2);              // the chat's top right under it
  expect(Math.abs(kb.comp.bottom - kb.vis.bottom)).toBeLessThan(2);          // the box to write right over the keyboard
  await page.waitForTimeout(200);
  expectNoGaps(await chatLayout(page), "chat del grupo, al cerrar el teclado");
  await page.screenshot({ path: "test-results/chat-claro.png" });
  expect(await axe(page, "chat del grupo")).toEqual([]);
  await page.emulateMedia({ colorScheme: "dark" }); await page.waitForTimeout(200);
  await page.screenshot({ path: "test-results/chat-oscuro.png" });
  await page.emulateMedia({ colorScheme: "light" });
  await page.setViewportSize({ width: 1280, height: 800 }); await page.waitForTimeout(300);
  expectNoGaps(await chatLayout(page), "chat en el ordenador");
  await page.screenshot({ path: "test-results/chat-ordenador.png" });
  await page.setViewportSize({ width: 390, height: 664 });

  // writing
  await page.locator('#chf [name="m"]').fill("Hecho");
  await page.locator("#chf .chsend").click();
  await expect(page.locator(".chm.me").last()).toContainText("Hecho");

});

test("chat con un amigo: desde su perfil, en la lista de chats y con sin leer", async ({ page }) => {
  await page.addInitScript(() => { Object.defineProperty(window, "clareaIdToken", {get: () => async () => "test-token", set(){}, configurable: true}); });
  const user = await signUp(page);
  const now = Date.now(), dm = [{id: "1", u: "ana", text: "¿Me pasas la hoja de SM6?", at: now - 600e3}], sent = [];
  const G = {id: "g1", name: "Los chavales", color: "#7b5ea7", owner: "u0", mine: true, muted: false, members: [{uid: "u0", u: user}, {uid: "u1", u: "ana"}], events: [], tasks: []};
  await page.route("**/social", async route => {
    const b = JSON.parse(route.request().postData() || "{}"); sent.push(b);
    let out = {u: user, code: "TEST-4F2K", mute: false, friends: [{uid: "u1", u: "ana"}, {uid: "u2", u: "leo"}], inReq: [], outReq: [], groups: [G]};
    if (b.op === "chat-unread") { const seen = (b.seen || {})["@u1"] || 0; out = {unread: {g1: 0, "@u1": dm.filter(m => +m.id > seen && m.u !== user).length},
      last: {g1: {id: 1, at: now - 7200e3, u: "ana", text: "Hola grupo"}, "@u1": Object.assign({}, dm[dm.length - 1], {id: +dm[dm.length - 1].id})}}; }
    if (b.op === "chat-list") out = {msgs: b.dm === "u1" ? dm : []};
    if (b.op === "chat-send") { const m = {id: String(dm.length + 1), u: user, text: b.text, at: Date.now()}; dm.push(m); out = {msg: m}; }
    await route.fulfill({ status: 200, contentType: "application/json", headers: {"Access-Control-Allow-Origin": "*"}, body: JSON.stringify(out) });
  });
  await page.evaluate(async () => { await socCall("me"); await chatUnread(); window.clareaGo("grupos"); });
  const skip = page.locator("[data-wskip]"); if (await skip.isVisible()) await skip.click();

  // the list of chats (.mlist): the friend's chat first (newest), with its last message, when and 1 unread; the number is on «Grupos» too
  const rows = page.locator(".mlist .chrow");
  await expect(rows).toHaveCount(2);
  await expect(rows.first().locator(".chrt b")).toHaveText("ana");
  await expect(rows.first().locator(".chrt small")).toHaveText("¿Me pasas la hoja de SM6?");
  await expect(rows.first().locator(".chn")).toHaveText("1");
  await expect(rows.nth(1).locator(".chrt b")).toHaveText("Los chavales");
  await expect(rows.nth(1).locator(".chrt small")).toHaveText("ana: Hola grupo");
  await expect(page.locator('[data-tab="grupos"] .tbdot')).toHaveText("1");
  await page.waitForTimeout(200);
  await page.screenshot({ path: "test-results/chats-lista.png" });
  expect(await axe(page, "lista de chats")).toEqual([]);

  // opening it: no names on the bubbles (it's just the two of you), and it's read
  await rows.first().click();
  await expect(page).toHaveURL(/\/chat\/u1$/);
  await expect(page.locator(".chhead .chwho b")).toHaveText("ana");
  await page.waitForTimeout(200);
  expectNoGaps(await chatLayout(page), "chat con un amigo");
  await expect(page.locator(".chm")).toHaveCount(1);
  await expect(page.locator(".chm .chu")).toHaveCount(0);
  await expect(page.locator(".chnote").first()).toContainText("Solo lo veis ana y tú");
  await expect(page.locator('[data-tab="grupos"]')).toHaveClass(/on/);
  await page.locator('#chf [name="m"]').fill("Claro, te la mando");
  await page.locator("#chf .chsend").click();
  await expect(page.locator(".chm.me")).toContainText("Claro, te la mando");
  expect(sent.some(b => b.op === "chat-send" && b.dm === "u1" && !b.gid)).toBe(true);
  await page.waitForTimeout(200);
  await page.screenshot({ path: "test-results/chat-amigo.png" });
  expect(await axe(page, "chat con un amigo")).toEqual([]);

  // from a friend's profile: «Enviar mensaje»
  await page.evaluate(() => window.clareaGo("grupos/amigos"));
  await page.locator('[data-socprof="u2"]').click();
  await page.locator('.pkp [data-pv="msg"]').click();
  await expect(page).toHaveURL(/\/chat\/u2$/);
  await expect(page.locator(".chfirst")).toContainText("¡Saluda a leo!");
});
