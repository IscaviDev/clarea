// Calendario y avisos: los mismos avisos en todas partes, «Clarea en tu calendario» (webcal) y los avisos de estudio.
const { test, expect } = require("@playwright/test");
const { signUp, go, putLocal, getLocal, ymdIn, axe, fakeGemini, geminiReady } = require("./helpers");

// the local server of this test (CLAREA_WORKER, or the usual one)
const WORKER = process.env.CLAREA_WORKER || "http://127.0.0.1:8797";
async function useWorker(page){
  await page.addInitScript(url => {
    let v = {};
    Object.defineProperty(window, "CLAREA_PUSH", {configurable: true, get: () => Object.assign({}, v, {url}), set: x => { v = x || {}; }});
  }, WORKER);
  await page.route(WORKER + "/**", async route => {
    const cors = {"access-control-allow-origin": "*", "access-control-allow-headers": "Content-Type", "access-control-allow-methods": "GET, POST, OPTIONS"};
    if (route.request().method() === "OPTIONS") return route.fulfill({status: 204, headers: cors});
    const r = await route.fetch();
    await route.fulfill({response: r, headers: Object.assign({}, r.headers(), cors)});
  });
}
const exam = (id, days, alerts) => ({id, type: "teorico", name: "Examen de prueba " + id, subj: "SM7", date: ymdIn(days), from: "09:00", to: "11:00", group: "DAW-2A", alerts});

test("avisos: el .ics y los avisos usan los que eliges en el evento", async ({ page }) => {
  const user = await signUp(page);
  await putLocal(page, user, "clarea-events", {t: Date.now(), list: [exam("a", 3, ["m8", "m15"]), exam("b", 4, [])]});
  const r = await page.evaluate(() => {
    const L = allEvents(), ics = evIcs(L[0]), none = evIcs(L[1]);
    return {trig: ics.split("\r\n").filter(l => l.startsWith("TRIGGER")), none: none.includes("VALARM"), rem: pushReminders().filter(x => !/^(wk|st|falta)\|/.test(x.id)).map(x => x.title)};
  });
  expect(r.trig).toHaveLength(2);
  r.trig.forEach(t => expect(t).toMatch(/^TRIGGER;VALUE=DATE-TIME:\d{8}T\d{6}Z$/));
  expect(r.none).toBe(false);
  expect(r.rem).toEqual(["Hoy: examen teórico de SM7", "Examen en 15 minutos: SM7"]);
  // the panel says which ones
  await go(page, "calendario");
  await page.locator('.calsec [data-evcal="a"]').first().click();
  await expect(page.locator(".pkp")).toContainText("ese mismo día a las 8:00 y 15 minutos antes");
  expect(await axe(page, "añadir a mi calendario")).toEqual([]);
});

test("avisos de estudio: resumen del domingo y repaso la tarde antes del examen", async ({ page }) => {
  const user = await signUp(page);
  await putLocal(page, user, "clarea-events", {t: Date.now(), list: [exam("a", 2), exam("b", 9)]});
  await putLocal(page, user, "clarea-qsets", {t: Date.now(), list: [{id: "q1", subj: "SM7", name: "Tema 1", qs: [{n: 1}, {n: 2}, {n: 3}]}]});
  await putLocal(page, user, "clarea-qp-q1", {t: Date.now(), mine: {1: {box: 3}}});
  const st = await page.evaluate(() => studyReminders());
  const eve = st.find(x => x.id.startsWith("st|a|"));
  expect(eve.title).toBe("Mañana tienes examen teórico de SM7");
  expect(eve.body).toContain("Te quedan 2 preguntas");
  expect(eve.url).toBe("preguntas.html?id=q1");
  expect(new Date(eve.at).getHours()).toBe(18);
  const wk = st.filter(x => x.id.startsWith("wk|"));
  expect(wk.length).toBeGreaterThan(0);
  wk.forEach(w => { expect(new Date(w.at).getDay()).toBe(0); expect(w.title).toBe("Esta semana: 1 examen"); });
  // they can be turned off in Configuración
  await go(page, "configuracion");
  const sw = page.locator("[data-cfgstudy]");
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await sw.click();
  await expect(page.locator("[data-cfgstudy]")).toHaveAttribute("aria-checked", "false");
  expect(await page.evaluate(() => studyReminders().length)).toBe(0);
  expect(await axe(page, "configuración")).toEqual([]);
});

test("Clarea en tu calendario: el enlace da tus eventos y se puede dejar de compartir", async ({ page, request }) => {
  test.skip(!(await fetch(WORKER + "/").then(r => r.ok, () => false)), "sin servidor local");
  await useWorker(page);
  const user = await signUp(page);
  await putLocal(page, user, "clarea-events", {t: Date.now(), list: [exam("a", 3), {id: "e", type: "entrega", name: "Memoria, final", subj: "PJ6", date: ymdIn(5), from: "23:59", to: "23:59", group: "DAW-2A"}]});
  await go(page, "calendario");
  await page.locator("[data-calsub]").click();
  await expect(page.locator(".pkp")).toContainText("Clarea en tu calendario");
  expect(await axe(page, "Clarea en tu calendario")).toEqual([]);
  const url = await page.evaluate(() => calUrl(calTok(false)));
  expect(url).toMatch(/\/cal\/[A-Za-z0-9_-]{43}\.ics$/);
  const r = await request.get(url);
  expect(r.ok()).toBeTruthy();
  expect(r.headers()["content-type"]).toContain("text/calendar");
  const ics = await r.text();
  expect(ics).toContain("X-WR-CALNAME:Clarea");
  expect(ics).toContain("SUMMARY:Examen teórico SM7 · Examen de prueba a");
  expect(ics).toContain("SUMMARY:Entrega PJ6 · Memoria\\, final");
  ics.split("\r\n").forEach(l => expect(Buffer.byteLength(l)).toBeLessThanOrEqual(75));
  // a change reaches the calendar
  await page.keyboard.press("Escape");
  await page.evaluate(() => { saveEvents(allEvents().filter(e => e.id !== "e")); });
  await expect.poll(async () => (await (await request.get(url)).text()).includes("Memoria"), {timeout: 8000}).toBe(false);
  // stop sharing: the address stops working
  await page.locator("[data-calsub]").click();
  await page.locator('[data-cto="off"]').click();
  await page.locator(".cdlg .cdok").click();
  await expect.poll(async () => (await request.get(url)).status(), {timeout: 8000}).toBe(404);
  await expect(page.locator(".calsubl")).toContainText("Suscríbete");
});

test("entregas: por entregar, entregada (sigue en el calendario y ya no avisa) y deshacer", async ({ page }) => {
  const user = await signUp(page);
  await putLocal(page, user, "clarea-events", {t: Date.now(), list: [{id: "d", type: "entrega", name: "Memoria final", subj: "PJ6", date: ymdIn(1), from: "23:59", to: "23:59", group: "DAW-2A"}]});
  await go(page, "calendario");
  const pend = page.locator(".calpend");
  await expect(pend.locator(":scope > .evr .evst")).toHaveText("Por entregar");
  const mine = () => page.evaluate(() => pushReminders().filter(r => r.id.startsWith("d|")).map(r => r.id.split("|")[2]));
  expect(await mine()).toEqual(["d1", "30", "chk"]);                                          // and «¿la entregaste?» after the deadline
  await pend.locator("[data-evdone]").click();
  await expect(pend.locator(":scope > .evr")).toHaveCount(0);                                         // out of «Por entregar»…
  await expect(pend.locator(".caldone summary")).toHaveText("Ya entregadas (1)");             // …into «Ya entregadas»
  expect(await mine()).toEqual([]);
  expect(await page.evaluate(() => evIcs(allEvents()[0]).includes("VALARM"))).toBe(false);
  expect((await getLocal(page, user, "clarea-events")).list).toHaveLength(1);              // still in the calendar
  await expect(page.locator(".calday .evc.evdone")).toHaveCount(1);
  await pend.locator(".caldone summary").click();
  await expect(pend.locator(".caldone .evst")).toHaveText("✓ Entregada");
  expect(await axe(page, "calendario con una entrega entregada")).toEqual([]);
  await go(page, "");
  await expect(page.locator(".planr", {hasText: "Memoria final"})).toHaveCount(0);         // «Por hacer»: only what is left
  await go(page, "calendario");
  await pend.locator(".caldone summary").click();
  await pend.locator(".caldone [data-evdone]").click();                                     // undo
  await expect(pend.locator(":scope > .evr .evst").first()).toHaveText("Por entregar");
  expect(await mine()).toEqual(["d1", "30", "chk"]);
});

test("entregas atrasadas: «Se pasó la fecha», «¿Entregaste…?» en «Por hacer» y aviso en Clarea", async ({ page }) => {
  const user = await signUp(page);
  await putLocal(page, user, "clarea-events", {t: Date.now(), list: [{id: "late", type: "entrega", name: "Práctica 3", subj: "PJ6", date: ymdIn(-2), from: "12:00", to: "12:00", group: "DAW-2A"},
    {id: "ok", type: "entrega", name: "Práctica 2", subj: "PJ6", date: ymdIn(-3), from: "12:00", to: "12:00", group: "DAW-2A"}]});
  await putLocal(page, user, "clarea-delivered", {t: Date.now(), ids: {ok: Date.now()}});
  await go(page, "calendario");
  await expect(page.locator(".calpend > .evr")).toHaveCount(1);
  await expect(page.locator(".calpend > .evr .evst")).toHaveText("Se pasó la fecha");
  await expect(page.locator(".calpend .calcnt")).toHaveText("1");
  await go(page, "");
  await expect(page.locator(".planr", {hasText: "¿Entregaste «Práctica 3»?"})).toHaveCount(1);
  await expect(page.locator(".planr", {hasText: "Práctica 2"})).toHaveCount(0);
  await page.evaluate(() => checkReminders());
  const n = await getLocal(page, user, "clarea-notifs");
  expect(n.list.map(x => x.title)).toContain("¿Has entregado «Práctica 3»?");
  expect(n.list.map(x => x.title)).not.toContain("¿Has entregado «Práctica 2»?");
});

test("importar fechas al calendario de un grupo", async ({ page }) => {
  const user = await signUp(page);
  await geminiReady(page, user);
  await fakeGemini(page, () => ({events: [{type: "entrega", subj: "PJ6", name: "Proyecto final", date: ymdIn(6)}, {type: "teorico", subj: "SM7", name: "Examen UF3", date: ymdIn(8)}]}));
  const sent = [], me = {uid: "u0", u: user};
  const view = () => ({u: user, code: "TEST-4F2K", mute: false, friends: [], inReq: [], outReq: [], groups: [{id: "g1", name: "PJ6 equipo", color: "#7b5ea7", owner: "u0", members: [me], events: sent.filter(b => b.op === "event-save").map(b => Object.assign({by: user}, b.ev))}]});
  await page.route("**/social", async route => { const b = JSON.parse(route.request().postData() || "{}"); sent.push(b);
    await route.fulfill({status: 200, contentType: "application/json", headers: {"Access-Control-Allow-Origin": "*"}, body: JSON.stringify(view())}); });
  await page.evaluate(() => { window.clareaIdToken = async () => "test-token"; });
  await page.reload();
  await page.evaluate(() => { window.clareaIdToken = async () => "test-token"; });
  await go(page, "calendario"); await expect(page.locator(".gfilter")).toContainText("PJ6 equipo");
  await go(page, "calendario/importar");
  await page.locator('[name="imptext"]').fill("Fechas de PJ6 y SM7.");
  await page.getByRole("button", { name: "Leer con tu IA" }).click();
  await expect(page.locator(".imr")).toHaveCount(2);
  await page.locator('[data-impw="g1"]').click();
  await expect(page.locator(".imwhere")).toContainText("Lo verán todos los del grupo");
  expect(await axe(page, "importar a un grupo")).toEqual([]);
  await page.getByRole("button", { name: "Guardar 2" }).click();
  await expect(page.locator("h1")).toHaveText("Agenda");
  const saves = sent.filter(b => b.op === "event-save");
  expect(saves).toHaveLength(2);
  expect(saves.every(b => b.gid === "g1")).toBe(true);
  expect(saves.map(b => b.ev.name).sort()).toEqual(["Examen UF3", "Proyecto final"]);
  expect(((await getLocal(page, user, "clarea-events")) || {list: []}).list).toHaveLength(0);   // not in «Mi calendario»
});

test("importar fechas con tu IA: revisar y guardar las que marques", async ({ page }) => {
  const user = await signUp(page);
  await geminiReady(page, user);
  const calls = await fakeGemini(page, () => ({events: [
    {type: "entrega", subj: "PJ6", name: "Proyecto final", date: ymdIn(6), from: "", to: "", notes: ""},
    {type: "teorico", subj: "SM7", name: "Examen UF3", date: ymdIn(8), from: "", to: "", notes: "Temas 4 y 5"},
    {type: "teorico", subj: "XYZ", name: "No es mía", date: ymdIn(9)}]}));
  await page.reload();
  await go(page, "calendario");
  await page.locator(".calimp [data-go]").click();
  await expect(page.locator("h1")).toHaveText("Importar fechas");
  expect(await axe(page, "importar fechas")).toEqual([]);
  await page.locator('[name="imptext"]').fill("Entrega del proyecto de PJ6 y examen de SM7.");
  await page.getByRole("button", { name: "Leer con tu IA" }).click();
  await expect(page.locator(".imr")).toHaveCount(2);
  expect(calls[0].prompt).toContain("PJ6");
  await expect(page.locator(".fnote").first()).toContainText("1 no eran de tus asignaturas");
  expect(await axe(page, "importar fechas: revisar")).toEqual([]);
  await page.locator(".imr").nth(1).click();                                                // keep only the delivery
  await page.getByRole("button", { name: "Guardar 1" }).click();
  await expect(page.locator("h1")).toHaveText("Agenda");
  const L = (await getLocal(page, user, "clarea-events")).list;
  expect(L).toHaveLength(1);
  expect(L[0]).toMatchObject({type: "entrega", subj: "PJ6", name: "Proyecto final", from: "23:59", group: "DAW-2A"});
});

test("vista de semana: cada día con sus clases, entregas y exámenes", async ({ page }) => {
  const user = await signUp(page);
  await putLocal(page, user, "clarea-events", {t: Date.now(), list: [exam("a", 0)]});
  await go(page, "calendario");
  await page.getByRole("button", { name: "Semana", exact: true }).click();
  await expect(page.getByRole("button", { name: "Semana", exact: true })).toHaveAttribute("aria-pressed", "true");
  expect(await page.locator(".wkday").count()).toBeGreaterThanOrEqual(5);
  await expect(page.locator(".wkday.today")).toContainText("SM7");
  expect(await axe(page, "calendario: semana")).toEqual([]);
  const lab = await page.locator(".calnav b").textContent();
  await page.locator('[data-calw="1"]').click();
  await expect(page.locator(".calnav b")).not.toHaveText(lab);
  await page.reload();                                                                     // remembered on this device
  await go(page, "calendario");
  await expect(page.locator(".wklist")).toBeVisible();
});

test("nota tras el examen: aviso al móvil al día siguiente y el enlace abre «¿Qué has sacado?»", async ({ page }) => {
  const user = await signUp(page);
  await putLocal(page, user, "clarea-notas-SM7", {t: Date.now(), pass: 5, items: [{id: "i1", code: "UF2", name: "Examen UF2", pct: 40, kind: "examen", grade: null}]});
  await putLocal(page, user, "clarea-events", {t: Date.now(), list: [exam("a", -1), exam("b", 3)]});
  const nota = () => page.evaluate(() => gradeReminders().map(r => ({id: r.id.split("|")[0], at: r.at, url: r.url, title: r.title})));
  let r = await nota();
  expect(r.map(x => x.id)).toEqual(["a", "b"]);
  const d = new Date(r[0].at); expect(d.getHours()).toBe(18);
  expect(Math.floor((d - new Date(new Date().setHours(0, 0, 0, 0))) / 864e5)).toBe(0);    // the day after the exam
  expect(r[0].title).toBe("¿Qué has sacado en «Examen de prueba a»?");
  expect(r[0].url).toBe("calendario?nota=a");
  // «Aún no lo sé»: the notice moves; the mark put: no more
  await page.evaluate(() => { const a = gradeAsk(); a.later.a = Date.now() + 2 * 864e5; gradeAskSet(a); });
  r = await nota(); expect(r[0].at).toBeGreaterThan(Date.now() + 864e5);
  await page.evaluate(() => { const a = gradeAsk(); a.done.b = {none: true}; gradeAskSet(a); });
  expect((await nota()).map(x => x.id)).toEqual(["a"]);
  // the notice's link
  await page.evaluate(() => { const a = gradeAsk(); delete a.later.a; gradeAskSet(a); });
  await page.goto("/calendario?nota=a");
  await expect(page.locator(".pkp")).toContainText("¿Qué has sacado?");
  expect(new URL(page.url()).search).toBe("");
});

test("avisos por defecto: se eligen en Configuración y los usan los eventos nuevos", async ({ page }) => {
  const user = await signUp(page);
  await go(page, "configuracion");
  await expect(page.locator(".cfgcard", {hasText: "Avisos de los eventos nuevos"})).toContainText("El día antes a las 20:00 y 30 minutos antes");
  await page.locator("[data-cfgaldef]").click();
  expect(await axe(page, "avisos por defecto")).toEqual([]);
  await page.locator('[data-dal="d1"]').click();
  await page.locator('[data-dal="h1"]').click();
  await page.locator("[data-dalok]").click();
  await expect(page.locator(".cfgcard", {hasText: "Avisos de los eventos nuevos"})).toContainText("1 hora antes y 30 minutos antes");
  expect((await getLocal(page, user, "clarea-alertdef")).list).toEqual(["h1", "m30"]);
  // a new event starts with them; one that doesn't say (like a group's) follows them too
  await go(page, "calendario/nuevo");
  await expect(page.locator('[data-al="h1"]')).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator('[data-al="d1"]')).toHaveAttribute("aria-pressed", "false");
  await putLocal(page, user, "clarea-events", {t: Date.now(), list: [Object.assign(exam("x", 3), {alerts: undefined})]});
  expect(await page.evaluate(() => pushReminders().filter(r => r.id.startsWith("x|")).map(r => r.id.split("|")[2]))).toEqual(["60", "30"]);
  expect(await page.evaluate(() => window.clareaPushGdef())).toEqual(["60", "30"]);
});
