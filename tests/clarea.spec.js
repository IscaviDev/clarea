// End-to-end checks of the main screens, plus an accessibility scan (WCAG 2.1 AA) of each one.
const { test, expect } = require("@playwright/test");
const { signUp, go, putLocal, ymdIn, axe } = require("./helpers");

test("inicio: saludo, Hoy, las asignaturas en «Estudiar» y el buscador", async ({ page }) => {
  await signUp(page);
  await expect(page.locator(".today h2")).toContainText("Hoy");
  await expect(page.locator(".sgrid .scard")).toHaveCount(0);                      // Inicio: only today
  await page.locator('[data-tab="estudiar"]').click();
  expect(await page.locator(".sgrid .scard").count()).toBeGreaterThan(8);
  await page.locator('[data-tab=""]').click();
  await page.locator("[data-search]").click();
  await page.locator(".srch input").fill("pj6");
  await expect(page.locator(".srchi").first()).toContainText("PJ6");
  await page.keyboard.press("Escape");
  expect(await axe(page, "inicio")).toEqual([]);
});

test("inicio: «Por hacer» con la entrega de hoy y el examen de mañana (y lo que necesitas)", async ({ page }) => {
  const now = new Date(); test.skip(now.getHours() === 23 && now.getMinutes() === 59, "a las 23:59 la entrega de hoy ya ha vencido");
  const user = await signUp(page);
  await expect(page.locator(".plan")).toHaveCount(0);                                      // nothing close: no «Por hacer»
  await putLocal(page, user, "clarea-events", {t: Date.now(), list: [
    {id: "e1", type: "entrega", name: "Práctica 3", subj: "SM7", date: ymdIn(0), from: "23:59", to: "23:59", group: "DAW-2A"},
    {id: "e2", type: "teorico", name: "Servicios web", subj: "SM7", date: ymdIn(1), from: "09:00", to: "10:00", group: "DAW-2A"},
    {id: "e3", type: "teorico", name: "Muy lejos", subj: "PJ6", date: ymdIn(30), from: "09:00", to: "10:00", group: "DAW-2A"}]});
  await putLocal(page, user, "clarea-notas-SM7", {t: Date.now(), pass: 5, items: [
    {id: "a1", code: "A1", name: "Examen", pct: 40, kind: "examen", grade: 6}, {id: "a2", code: "A2", name: "Proyecto", pct: 60, kind: "proyecto", grade: null}]});
  await go(page, "");
  await expect(page.locator(".plan h3")).toHaveText("Por hacer");
  const rows = page.locator(".plan .planr");
  await expect(rows).toHaveCount(2);
  await expect(rows.nth(0)).toContainText("Práctica 3");
  await expect(rows.nth(0)).toContainText("Entrega hoy hasta las 23:59");
  await expect(rows.nth(1)).toContainText("Servicios web");
  await expect(rows.nth(1)).toContainText("Ex. teórico mañana");
  await expect(rows.nth(1)).toContainText("mañana · Para aprobar SM7 necesitas un 4,34 de media en lo que falta.");
  expect(await axe(page, "inicio · Por hacer")).toEqual([]);
  await rows.nth(0).click();
  await expect(page).toHaveURL(/\/calendario$/);
});

test("calendario: un evento se ve, con sus avisos, y crea el recordatorio de hoy", async ({ page }) => {
  const user = await signUp(page);
  await page.evaluate(u => {
    const d = new Date(), ymd = d.getFullYear() + "-" + String(d.getMonth() + 1).padStart(2, "0") + "-" + String(d.getDate()).padStart(2, "0");
    localStorage.setItem("u/" + u + "/clarea-events", JSON.stringify({t: Date.now(), list: [{id: "e1", type: "entrega", name: "Entrega de prueba", subj: "PJ6", date: ymd, from: "23:59", to: "23:59", group: "DAW-2A"}]}));
  }, user);
  await go(page, "calendario");
  await expect(page.locator(".evr").first()).toContainText("Entrega de prueba");
  await go(page, "calendario/editar/e1");
  await expect(page.locator(".alsw")).toHaveAttribute("aria-checked", "true");
  await expect(page.locator('[data-al="d1"]')).toHaveAttribute("aria-pressed", "true");
  expect(await axe(page, "editar evento")).toEqual([]);
  await go(page, "calendario");
  expect(await axe(page, "calendario")).toEqual([]);
});

test("mi progreso y simulacro", async ({ page }) => {
  await signUp(page);
  await go(page, "progreso");
  await expect(page.locator(".back")).toHaveText("← Estudiar");
  await expect(page.locator(".pgtiles")).toHaveCount(0);                           // no tiles with «–»: only sentences, when there is something
  expect(await axe(page, "mi progreso")).toEqual([]);
});

test("configuración: Claude con tu cuenta y Gemini como clave", async ({ page }) => {
  await signUp(page);
  await go(page, "configuracion");
  // first, Claude with the student's account (the connector); then Gemini, the only key
  await expect(page.locator(".cfgh").first()).toHaveText("Claude con tu cuenta");
  await expect(page.locator("[data-mcpon]")).toBeVisible();
  await expect(page.locator("details.cfgai")).toHaveCount(1);
  await expect(page.locator('details.cfgai[data-cfgai="gemini"]')).toHaveAttribute("open", "");
  expect(await axe(page, "configuración")).toEqual([]);
});

test("preguntas de examen: importar un .txt y estudiarlas", async ({ page }) => {
  await signUp(page);
  await go(page, "asig/SM7/preguntas");
  await page.locator('[name="qtext"]').fill("Preguntas SM7\n1. EXPLICA QUE SON ELS SERVEIS WEB?\n2. AVANTATGES DELS SERVEIS WEB? E INCONVENIENTS?\n3. PERQUE ES FA SERVIR EL REPOSITORI? DESACOPLAR LA LOGICA\n4. ");
  await expect(page.locator(".qprev li")).toHaveCount(3);
  await expect(page.locator(".qprev li").nth(2)).toContainText("Pista");
  expect(await axe(page, "importar preguntas")).toEqual([]);
  await page.locator('#nqf button[type="submit"]').click();
  await expect(page.locator(".qi")).toHaveCount(3);
  expect(await axe(page, "preguntas")).toEqual([]);
});

test("proyecto: código, glosario con tarjetas y exámenes", async ({ page }) => {
  const user = await signUp(page);
  await page.evaluate(u => {
    const P = "u/" + u + "/", now = Date.now();
    localStorage.setItem(P + "clarea-projs", JSON.stringify({t: now, list: [{id: "tp1", subj: "PJ6", name: "Proyecto de prueba", desc: "", files: 2, lines: 6, created: now}]}));
    localStorage.setItem(P + "clarea-pcode-tp1", JSON.stringify({t: now, files: {"index.php": "<?php\necho 1;\n?>\n", "js/app.js": "function a(){\n  return 1;\n}\n"}}));
    localStorage.setItem(P + "clarea-pai-tp1", JSON.stringify({t: now, glossary: [{term: "echo", cat: "PHP", easy: "Escribe texto."}], exams: {}, files: {}, done: {gloss: 1}}));
  }, user);
  await page.goto("/proyecto.html?id=tp1");
  await expect(page.locator("#ptitle")).toHaveText("Proyecto de prueba");
  await expect(page.locator("details.pfile")).toHaveCount(2);
  expect(await axe(page, "proyecto · código")).toEqual([]);
  await page.locator('[data-ptab="glosario"]').first().click();
  await page.locator("[data-cards]").click();
  await expect(page.locator(".cardterm")).toHaveText("echo");
});
