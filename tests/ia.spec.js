// The ✦ IA tab: two clear ways (Gemini or Claude), copying and pasting folded away, the welcome, and the notice when Claude finishes.
const { test, expect } = require("@playwright/test");
const { signUp, go, putLocal, getLocal, useWorker, workerUp, mcpCall, WORKER, axe, fakeGemini, geminiReady, FAKE_MODELS } = require("./helpers");

async function project(page, user){
  const now = Date.now();
  await putLocal(page, user, "clarea-projs", {t: now, list: [{id: "tp1", subj: "PJ6", name: "Proyecto de prueba", desc: "", files: 2, lines: 6, created: now}]});
  await putLocal(page, user, "clarea-pcode-tp1", {t: now, files: {"index.php": "<?php\necho 1;\n?>\n", "js/app.js": "function a(){\n  return 1;\n}\n"}});
}

test("ia: sin nada, elegir Gemini o Claude; copiar y pegar en «Otras formas»; bienvenida", async ({ page }) => {
  const user = await signUp(page);
  await project(page, user);
  await page.goto("/proyecto.html?id=tp1");
  await page.locator('[data-ptab="ia"]').first().click();
  await expect(page.locator(".aipick [data-aipick]")).toHaveCount(2);
  await expect(page.locator("details.aimore")).not.toHaveAttribute("open", "");
  await expect(page.locator("[data-aione-copy]")).toBeHidden();                 // folded away
  await page.locator("details.aimore > summary").click();
  await expect(page.locator("[data-aione-copy]")).toBeVisible();
  expect(await axe(page, "proyecto · ✦ IA sin nada")).toEqual([]);
  await page.evaluate(() => CLAI.welcome());
  await expect(page.locator(".aiwel h3")).toHaveText("¿Con qué IA quieres estudiar?");
  expect(await axe(page, "bienvenida de la IA")).toEqual([]);
  await page.locator("[data-aiwelx]").click();
  await expect(page.locator(".aiwel")).toHaveCount(0);
});

test("ia: con Claude conectado, «Enviar a Claude» y Claude primero en Configuración", async ({ page }) => {
  const user = await signUp(page);
  await project(page, user);
  await putLocal(page, user, "clarea-ai", {t: Date.now(), mcp: {k: "a".repeat(32), t: Date.now()}, pick: "claude"});
  await page.goto("/proyecto.html?id=tp1");
  await page.locator('[data-ptab="ia"]').first().click();
  await expect(page.locator("[data-mcpsend]")).toBeVisible();
  await expect(page.locator(".aipick")).toHaveCount(0);
  expect(await axe(page, "proyecto · ✦ IA con Claude")).toEqual([]);
  await page.goto("/configuracion");
  await expect(page.locator("#cfgmcp")).toBeVisible();
  const order = await page.locator("h2.cfgh").allTextContents();
  expect(order.indexOf("Claude con tu cuenta")).toBeLessThan(order.indexOf("Tu IA: Gemini"));
});

test("servidor: al guardar Claude la última parte, la tarea queda avisada (y no falla)", async ({ request }) => {
  test.skip(!(await workerUp()), "sin el servidor local");
  const k = "b".repeat(32), post = (p, b) => request.post(WORKER + p, {data: Object.assign({k}, b)});
  expect((await post("/mcp-hello", {})).ok()).toBeTruthy();
  expect((await post("/mcp-push", {pk: "c".repeat(43), task: {id: "p-x", kind: "proyecto", title: "X", url: "proyecto.html?id=x", intro: "i",
    parts: [{id: "a", title: "A", instructions: "-"}, {id: "b", title: "B", instructions: "-"}]}})).ok()).toBeTruthy();
  expect((await mcpCall(request, WORKER + "/mcp/" + k, "clarea_guardar", {tarea: "p-x", parte: "a", resultado: {ok: 1}})).text).toContain("Faltan: b");
  expect((await mcpCall(request, WORKER + "/mcp/" + k, "clarea_guardar", {tarea: "p-x", parte: "b", resultado: {ok: 1}})).text).toContain("Ya está todo");
  await post("/mcp-forget", {});
});

test("ia: lo enviado a Claude sale en «Por hacer», con cuánto lleva, hasta que termina", async ({ page, request }) => {
  test.skip(!(await workerUp()), "sin el servidor local");
  await useWorker(page);
  const user = await signUp(page);
  await project(page, user);
  const k = ("h" + Date.now().toString(36) + "x".repeat(32)).slice(0, 32), post = (p, b) => request.post(WORKER + p, {data: Object.assign({k}, b)});
  await putLocal(page, user, "clarea-ai", {t: Date.now(), mcp: {k, t: Date.now()}});
  await post("/mcp-hello", {});
  await post("/mcp-push", {task: {id: "p-tp1", kind: "proyecto", title: "Proyecto de prueba (PJ6)", intro: "i", parts: [{id: "a", title: "A", instructions: "-"}, {id: "b", title: "B", instructions: "-"}]}});
  await putLocal(page, user, "clarea-mcpt-p-tp1", {t: Date.now(), parts: ["a", "b"]});
  await go(page, "");
  const row = page.locator(".planr", {hasText: "«Proyecto de prueba»"});
  await expect(row).toContainText("Claude prepara");
  await expect(row).toContainText("Esperando a que pulses enviar en Claude");
  await mcpCall(request, WORKER + "/mcp/" + k, "clarea_guardar", {tarea: "p-tp1", parte: "a", resultado: {ok: 1}});
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));       // as when you come back to Clarea
  await expect(row).toContainText("1 de 2 partes hechas");
  expect(await axe(page, "Por hacer con Claude")).toEqual([]);
  await mcpCall(request, WORKER + "/mcp/" + k, "clarea_guardar", {tarea: "p-tp1", parte: "b", resultado: {ok: 1}});
  await page.evaluate(() => document.dispatchEvent(new Event("visibilitychange")));
  await expect(row).toContainText("✓ Claude ha terminado");
  await row.click();
  await expect(page).toHaveURL(/proyecto\.html\?id=tp1/);
  await post("/mcp-forget", {});
});

test("Gemini: el uso gratis de hoy, en Configuración y en la pestaña ✦ IA", async ({ page }) => {
  const user = await signUp(page);
  const model = FAKE_MODELS[0];                                                                // a «flash»: unas 20 al día
  await putLocal(page, user, "clarea-ai", {t: Date.now(), prov: "gemini", keys: {gemini: "clave-de-prueba"}, ok: {gemini: "clave-de-prueba"}, models: {gemini: model}, cloud: false});
  const day = await page.evaluate(() => new Date().toLocaleDateString("en-CA", {timeZone: "America/Los_Angeles"}));
  await putLocal(page, user, "clarea-aiuse", {day, n: {[model]: 17}, out: {}});
  await fakeGemini(page, () => "Hola.");
  await page.goto("/configuracion");
  await expect(page.locator('[data-cfgai="gemini"] > summary')).toContainText("Quedan unas 3 gratis hoy");
  await page.locator('[data-cfgai="gemini"] > summary').click();
  await expect(page.locator(".cfguse")).toContainText("unas 17 de 20 peticiones");
  await expect(page.locator(".cfguse")).toContainText("Te quedan unas 3");
  expect(await axe(page, "Configuración con el uso de Gemini")).toEqual([]);
  // each request counts (on the account, so on every device)
  await page.evaluate(() => CLAI.callAI("Hola", false));
  expect((await getLocal(page, user, "clarea-aiuse")).n[model]).toBe(18);
  // not enough for what is missing: a notice before generating
  expect(await page.evaluate(() => CLAI.useWarn(5))).toContain("te quedan unas 2 peticiones gratis");
  expect(await page.evaluate(() => CLAI.useWarn(1))).toBe("");
  // yesterday's count doesn't count
  await putLocal(page, user, "clarea-aiuse", {day: "2000-01-01", n: {[model]: 20}, out: {[model]: 1}});
  expect(await page.evaluate(() => CLAI.useInfo().used)).toBe(0);
});

test("chat: guardar una respuesta para repasar, en «Mis dudas de PJ6»", async ({ page }) => {
  const user = await signUp(page);
  await project(page, user);
  await geminiReady(page, user);
  await page.evaluate(u => { const k = "u/" + u + "/clarea-ai", c = JSON.parse(localStorage.getItem(k)); c.cloud = false; localStorage.setItem(k, JSON.stringify(c)); }, user);   // here, not in the real cloud
  await fakeGemini(page, p => /Conversación:/.test(p) ? "Un «echo» escribe texto en la página. Por ejemplo, echo 1 escribe un 1." : {items: []});
  await page.goto("/proyecto.html?id=tp1");
  await page.locator("#pchat").click();
  await page.locator(".chatf textarea").fill("¿Qué hace echo?");
  await page.locator(".chatf .btn").click();
  await expect(page.locator(".chatb.ai").last()).toContainText("escribe texto");
  await page.locator("[data-chatsave]").click();
  await expect(page.locator(".chatsaved")).toContainText("Mis dudas de PJ6");
  expect(await axe(page, "chat con una respuesta guardada")).toEqual([]);
  const d = (await getLocal(page, user, "clarea-qsets")).list.find(x => x.dudas);
  expect(d.name).toBe("Mis dudas de PJ6");
  expect(d.qs[0].q).toContain("¿Qué hace echo?");
  expect((await getLocal(page, user, "clarea-qai-" + d.id)).items[1].answer).toContain("escribe texto");
  await page.goto("/preguntas.html?id=" + d.id);
  await expect(page.locator('details[data-qn="1"]')).toContainText("¿Qué hace echo?");
});

test("todo a Claude: un toque envía lo pendiente (proyectos y preguntas) y Claude lo ve todo", async ({ page, request }) => {
  test.skip(!(await workerUp()), "sin el servidor local");
  await useWorker(page);
  await page.context().route(/claude\.ai/, r => r.abort());                                   // Claude doesn't really open
  const user = await signUp(page);
  await project(page, user);
  await putLocal(page, user, "clarea-qsets", {t: Date.now(), list: [{id: "qs1", subj: "SM7", name: "Preguntas de prueba", lang: "es", qs: [{n: 1, q: "¿Qué es HTTP?"}, {n: 2, q: "¿Qué es REST?"}], created: Date.now()}]});
  const k = ("t" + Date.now().toString(36) + "x".repeat(32)).slice(0, 32);
  await putLocal(page, user, "clarea-ai", {t: Date.now(), mcp: {k, t: Date.now()}, mcpNoAsk: true});
  await request.post(WORKER + "/mcp-hello", {data: {k}});
  await go(page, "");
  const all = page.locator("[data-claudeall]");
  await expect(all).toContainText("Enviar a Claude lo pendiente");
  await expect(all).toContainText("1 proyecto y 1 tanda de preguntas");
  expect(await axe(page, "Por hacer con «Enviar a Claude lo pendiente»")).toEqual([]);
  await all.click();
  await expect(page.locator("[data-claudeall]")).toHaveCount(0);
  await expect(page.locator(".planr", {hasText: "«Proyecto de prueba»"})).toContainText("Claude prepara");
  await expect(page.locator(".planr", {hasText: "«Preguntas de prueba»"})).toContainText("Claude prepara");
  const pend = (await mcpCall(request, WORKER + "/mcp/" + k, "clarea_pendiente", {})).text;
  expect(pend).toContain("p-tp1");
  expect(pend).toContain("q-qs1");
  const leer = (await mcpCall(request, WORKER + "/mcp/" + k, "clarea_leer", {tarea: "q-qs1"})).text;
  expect(leer).toContain("¿Qué es REST?");
  await request.post(WORKER + "/mcp-forget", {data: {k}});
});
