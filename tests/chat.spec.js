// «Pregúntale a tu IA»: with Gemini (a fake one), and with Claude through the Clarea connector (the test plays Claude).
const { test, expect } = require("@playwright/test");
const { signUp, go, putLocal, getLocal, useWorker, workerUp, mcpCall, fakeGemini, geminiReady, axe } = require("./helpers");

const SHEET = () => ({t: Date.now(), pass: 5, items: [
  {id: "a1", code: "A1", name: "Examen de servicios web", pct: 40, kind: "examen", grade: 6},
  {id: "a2", code: "A2", name: "Proyecto final", pct: 60, kind: "proyecto", grade: null}]});

test("chat con Gemini: tu IA responde con tus notas delante, y la conversación se guarda", async ({ page }) => {
  const user = await signUp(page);
  await geminiReady(page, user);
  await putLocal(page, user, "clarea-notas-SM7", SHEET());
  const calls = await fakeGemini(page, () => "Necesitas un **4,34** de media en el proyecto para aprobar.");
  await go(page, "asig/SM7/notas");
  await page.locator("[data-grchat]").first().click();
  const chat = page.getByRole("dialog", {name: "Pregúntale a tu IA"});
  await expect(chat).toBeVisible();
  await expect(chat.locator(".chatvia")).toBeHidden();                                    // only Gemini: nothing to choose
  expect(await axe(page, "chat · vacío")).toEqual([]);
  await chat.getByLabel("Tu pregunta").fill("¿Cuánto necesito en el proyecto?");
  await chat.getByRole("button", {name: "Enviar"}).click();
  await expect(chat.locator(".chatb.ai").last()).toContainText("Necesitas un 4,34 de media");
  // Gemini had the sheet and the marks in front (and the question)
  expect(calls).toHaveLength(1);
  expect(calls[0].prompt).toContain("Asignatura SM7");
  expect(calls[0].prompt).toContain("A1 Examen de servicios web: 40 % (Examen) → nota 6");
  expect(calls[0].prompt).toContain("¿Cuánto necesito en el proyecto?");
  expect(await axe(page, "chat · con respuesta")).toEqual([]);
  // close (X at the top) and open again: the conversation is still there
  await chat.getByRole("button", {name: "Cerrar"}).click();
  await expect(chat).toHaveCount(0);
  await page.locator("[data-grchat]").first().click();
  await expect(chat.locator(".chatb")).toHaveCount(2);
  expect((await getLocal(page, user, "clarea-chat-n-SM7")).msgs).toHaveLength(2);
});

test("chat con Claude (conector): se abre Claude con la pregunta escrita y su respuesta llega a Clarea", async ({ page, request }) => {
  test.skip(!(await workerUp()), "Necesita el servidor local (push-worker con wrangler dev)");
  await useWorker(page);
  // Claude itself is not opened: its page is answered here, and we only check the address
  await page.context().route("https://claude.ai/**", r => r.fulfill({contentType: "text/html", body: "<title>Claude</title>"}));
  const user = await signUp(page);
  await putLocal(page, user, "clarea-notas-SM7", SHEET());
  // connect Claude in Configuración (a new address on the local server)
  await go(page, "configuracion");
  await page.locator("[data-mcpon]").first().click();
  const addr = page.getByLabel("Dirección del conector");
  await expect(addr).toHaveValue(/\/mcp\/[A-Za-z0-9_-]{32}$/);
  const mcpUrl = await addr.inputValue();

  await go(page, "asig/SM7/notas");
  await page.locator("[data-grchat]").first().click();
  const chat = page.getByRole("dialog", {name: "Pregúntale a tu IA"});
  await chat.getByLabel("Tu pregunta").fill("¿Qué pasa si suspendo el examen?");
  await chat.getByRole("button", {name: "Enviar"}).click();
  // the notice first; then Claude opens with the message already written (the student only taps send)
  const dlg = page.locator(".cdlg");
  await expect(dlg.locator("h3")).toHaveText("Vas a abrir Claude");
  expect(await axe(page, "aviso · abrir Claude")).toEqual([]);
  const [popup] = await Promise.all([page.waitForEvent("popup"), dlg.getByRole("button", {name: "Abrir Claude"}).click()]);
  const q = new URL(popup.url()).searchParams.get("q");
  expect(popup.url()).toMatch(/^https:\/\/claude\.ai\/new\?q=/);
  expect(q).toContain("¿Qué pasa si suspendo el examen?");
  expect(q).toContain("c-n-SM7");
  await popup.close();
  await expect(chat.locator(".chatb.claude")).toContainText("Pregunta enviada a Claude.");
  expect(await axe(page, "chat · esperando a Claude")).toEqual([]);

  // Claude, with the connector: sees the task, reads it (with the sheet) and saves its answer
  expect((await mcpCall(request, mcpUrl, "clarea_pendiente")).text).toContain("c-n-SM7");
  const read = (await mcpCall(request, mcpUrl, "clarea_leer", {tarea: "c-n-SM7"})).text;
  expect(read).toContain("¿Qué pasa si suspendo el examen?");
  expect(read).toContain("Examen de servicios web");
  await mcpCall(request, mcpUrl, "clarea_guardar", {tarea: "c-n-SM7", parte: "respuesta", resultado: {texto: "Tendrías que recuperarlo en junio."}});
  // Clarea looks every few seconds: the answer arrives by itself
  await expect(chat.locator(".chatb.ai").last()).toContainText("Tendrías que recuperarlo en junio.", {timeout: 15000});
  await expect(chat.locator(".chatb.claude")).toHaveCount(0);
  // with Gemini too, the student chooses who answers (the chosen one, readable in light and dark)
  await page.evaluate(() => { const k = "u/" + window.PJ6USER + "/clarea-ai", c = JSON.parse(localStorage.getItem(k));
    Object.assign(c, {prov: "gemini", keys: {gemini: "k"}, ok: {gemini: "k"}, models: {gemini: "gemini-9-flash"}}); localStorage.setItem(k, JSON.stringify(c)); });
  await chat.getByRole("button", {name: "Cerrar"}).click();
  await page.locator("[data-grchat]").first().click();
  await expect(chat.locator(".chatvia")).toBeVisible();
  await expect(chat.locator('[data-via="claude"]')).toHaveAttribute("aria-pressed", "true");
  expect(await axe(page, "chat · elegir quién responde")).toEqual([]);
});
