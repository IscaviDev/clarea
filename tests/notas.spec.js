// Notas: reading the assessment sheet with your AI, your marks, «¿Y si saco…?» and sharing the sheet with your class.
const { test, expect } = require("@playwright/test");
const { signUp, go, putLocal, getLocal, useWorker, workerUp, fakeGemini, geminiReady, WORKER, axe } = require("./helpers");

// a small sheet for SM7: 40 % exam (a 6 already), 40 % project, 20 % exercises, and attendance with no weight
const SHEET = () => ({t: Date.now(), pass: 5, noRound: false, minAttendance: null, rules: [], target: null,
  items: [
    {id: "a1", code: "A1", name: "Examen de servicios web", pct: 40, kind: "examen", teacher: "", grade: 6},
    {id: "a2", code: "A2", name: "Proyecto final", pct: 40, kind: "proyecto", teacher: "", grade: null},
    {id: "a3", code: "A3", name: "Ejercicios de clase", pct: 20, kind: "ejercicio", teacher: "", grade: null},
    {id: "a4", code: "", name: "Asistencia", pct: 0, kind: "otro", teacher: "", grade: null}],
  info: {about: "Servicios web y repositorios.", criteria: ["Hay que entregar el proyecto para aprobar."], recovery: ["Examen de recuperación en junio."]}});

test("notas: leer la hoja con tu IA (si un modelo está saturado, sigue con otro de Gemini)", async ({ page }) => {
  const user = await signUp(page);
  await geminiReady(page, user);
  await page.evaluate(u => { const k = "u/" + u + "/clarea-ai", c = JSON.parse(localStorage.getItem(k)); c.cloud = false; localStorage.setItem(k, JSON.stringify(c)); }, user);   // read here, not in the real cloud
  // the school's page with the sheet
  await page.route("https://instituto.test/**", r => r.fulfill({contentType: "text/html", body: "<html><body><h1>SM7 · Avaluació</h1><table><tr><td>A1 Examen</td><td>40%</td></tr><tr><td>A2 Projecte</td><td>60%</td></tr></table><p>S'aprova amb un 5. Cal assistir al 80% de les classes.</p></body></html>"}));
  // the default model is saturated (503 twice: the call and its retry); the next Gemini model reads it
  // (the second model takes a moment, so the notice can be read before the sheet shows)
  const calls = await fakeGemini(page, async (prompt, model) => model === "gemini-9-flash" ? {status: 503}
    : (await new Promise(r => setTimeout(r, 1500)), {subject: "SM7", items: [{code: "A1", name: "Examen", pct: 40, kind: "examen", grade: null}, {code: "A2", name: "Projecte", pct: 60, kind: "proyecto", grade: null}], pass: 5, noRound: false, minAttendance: 80, info: {about: "Servicios web."}}));
  await go(page, "asig/SM7/notas");
  expect(await axe(page, "notas · leer la hoja")).toEqual([]);
  await page.locator('[name="grurl"]').fill("https://instituto.test/sm7.html");
  await page.locator('#grf [type="submit"]').click();
  await expect(page.locator(".grimp .aimsg")).toContainText("«gemini-9-flash» estaba saturado: sigo con «gemini-8-flash»", {timeout: 20000});
  await expect(page.locator(".grrow")).toHaveCount(2, {timeout: 20000});
  await expect(page.locator(".grrow").first()).toContainText("Examen");
  await expect(page.locator(".grrow").nth(1)).toContainText("60 %");
  // only Gemini models, and the default one in Configuración stays the same
  expect(calls.every(c => /^gemini-/.test(c.model))).toBeTruthy();
  expect(calls.map(c => c.model)).toEqual(["gemini-9-flash", "gemini-9-flash", "gemini-8-flash"]);
  expect((await getLocal(page, user, "clarea-ai")).models.gemini).toBe("gemini-9-flash");
  expect(await axe(page, "notas · hoja leída")).toEqual([]);
});

test("notas: poner notas, objetivo y «¿Y si saco…?» (sin guardar)", async ({ page }) => {
  const user = await signUp(page);
  await putLocal(page, user, "clarea-notas-SM7", SHEET());
  await go(page, "notas");
  await expect(page.locator(".pgsub")).toHaveCount(1);
  await expect(page.locator(".pgsub")).toContainText("Para un 5: media de 4,34 en el resto");
  expect(await axe(page, "notas")).toEqual([]);

  await go(page, "asig/SM7/notas");
  await expect(page.locator(".grverd").first()).toContainText("necesitas una media de 4,34 en lo que falta (60 % de la nota)");
  const main = page.locator(".grlist").first().locator(".grrow");
  await expect(main).toHaveCount(3);                                                        // the 0 % one is folded apart
  await expect(page.locator("details.grzero summary")).toContainText("Sin peso en la nota (1)");
  expect(await axe(page, "notas de SM7")).toEqual([]);

  // a mark: saved, and the summary changes
  await page.getByLabel("Nota de A2 Proyecto final").fill("8");
  await page.getByLabel("Nota de A2 Proyecto final").press("Tab");
  await expect(page.locator(".grverd").first()).toContainText("El aprobado ya lo tienes");
  await expect(page.locator("#grsum .pgtiles b").first()).toHaveText("7");
  expect((await getLocal(page, user, "clarea-notas-SM7")).items[1].grade).toBe(8);
  // a wrong mark is not saved
  await page.getByLabel("Nota de A3 Ejercicios de clase").fill("12");
  await page.getByLabel("Nota de A3 Ejercicios de clase").press("Tab");
  await expect(page.locator(".toast", {hasText: "Pon una nota de 0 a 10"})).toBeVisible();
  expect((await getLocal(page, user, "clarea-notas-SM7")).items[2].grade).toBe(null);

  // the goal: an 8
  await page.locator('[data-grgoal="8"]').click();
  await expect(page.locator('[data-grgoal="8"]')).toHaveAttribute("aria-checked", "true");
  await expect(page.locator(".grverd").first()).toContainText("No llegas al 8: como máximo puedes sacar un 7,6");

  // «¿Y si saco…?»: imaginary marks, not saved
  await page.locator("[data-grsim-on]").click();
  await expect(page.getByLabel("Nota imaginaria de A3 Ejercicios de clase")).toBeVisible();
  expect(await axe(page, "¿Y si saco…?")).toEqual([]);
  await page.locator('[data-grsim-all="5"]').click();
  await expect(page.locator(".grsim .grverd")).toContainText("tu nota final sería un 6,6: aprobada");
  await page.getByLabel("Nota imaginaria de A3 Ejercicios de clase").fill("2");
  await expect(page.locator(".grsim .grverd")).toContainText("tu nota final sería un 6: aprobada");
  await page.locator("[data-grsim-off]").click();
  await expect(page.locator(".grsim")).toHaveCount(0);
  expect((await getLocal(page, user, "clarea-notas-SM7")).items[2].grade).toBe(null);
});

test("notas: compartir la hoja con tu clase (sin tus notas) y guardarla otro", async ({ browser }) => {
  test.skip(!(await workerUp()), "Necesita el servidor local (push-worker con wrangler dev)");
  const ctxA = await browser.newContext(), a = await ctxA.newPage();
  await useWorker(a);
  const userA = await signUp(a);
  await putLocal(a, userA, "clarea-notas-SM7", SHEET());
  await go(a, "asig/SM7/notas");
  await a.locator("[data-grshare]").click();
  await expect(a.locator(".pkw, [role=dialog]").filter({hasText: "Compartir con tu clase"}).first()).toBeVisible();
  await a.locator('[data-gsh="create"]').click();
  const link = a.locator('input[aria-label="Enlace para compartir"]');
  await expect(link).toHaveValue(/\/notas\?share=[A-Za-z0-9_-]{12}$/);
  expect(await axe(a, "compartir la hoja")).toEqual([]);
  const url = await link.inputValue(), id = url.split("share=")[1];
  // the server has the sheet, never the marks
  const snap = await (await a.request.get(WORKER + "/share/" + id)).json();
  expect(snap.kind).toBe("notas");
  expect(snap.ai.items.map(x => x.grade)).toEqual([null, null, null, null]);
  expect((await getLocal(a, userA, "clarea-notas-SM7")).share.id).toBe(id);

  // a classmate opens the link and keeps it
  const ctxB = await browser.newContext(), b = await ctxB.newPage();
  await useWorker(b);
  const userB = await signUp(b);
  await b.goto("/notas?share=" + id);
  await expect(b.locator(".thead h1")).toHaveText("Cómo se evalúa SM7");
  await expect(b.locator(".thead span")).toContainText("compartida por " + userA);
  await expect(b.locator(".grrow")).toHaveCount(3);
  await expect(b.locator(".grin")).toHaveCount(0);                                         // only to read: no marks here
  expect(await axe(b, "hoja compartida")).toEqual([]);
  await b.locator("[data-gskeep]").click();
  await expect(b.locator(".thead h1")).toHaveText("Notas de SM7");
  const kept = await getLocal(b, userB, "clarea-notas-SM7");
  expect(kept.items.length).toBe(4);
  expect(kept.items.every(x => x.grade === null)).toBeTruthy();

  // stop sharing: the link stops working
  await a.locator('[data-gsh="stop"]').click();
  await expect(a.locator('[data-gsh="create"]')).toBeVisible();
  expect((await a.request.get(WORKER + "/share/" + id)).status()).toBe(404);
  await ctxA.close(); await ctxB.close();
});
