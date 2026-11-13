// Studying is never interrupted: a sync from another device, the AI saving a part or the cloud check redraw the page,
// but the question you have open stays open and the page doesn't jump (13-11-2026: it closed by itself while reading).
const { test, expect } = require("@playwright/test");
const { signUp, putLocal } = require("./helpers");

const long = "Respuesta modelo larga. ".repeat(80);
const item = (q, k) => ({q, level: "media", short: "Corta de prueba.", answer: long, points: ["Una idea", "Otra idea"], keyTerms: [k], example: "", mistakes: [], tip: ""});

test("preguntas: la que lees sigue abierta y la página no salta al sincronizar o al guardar la IA otra parte", async ({ page }) => {
  const user = await signUp(page);
  const qs = Array.from({length: 8}, (_, i) => ({n: i + 1, q: "Pregunta " + (i + 1) + ": ¿qué es esto?"}));
  await putLocal(page, user, "clarea-qsets", {t: Date.now(), list: [{id: "qlee", subj: "SM7", subjName: "", name: "Lectura", lang: "es", created: Date.now(), qs}]});
  const items = {}; qs.slice(0, 7).forEach(q => items[q.n] = item(q.q, "T" + q.n));   // the 8th is still being prepared
  await putLocal(page, user, "clarea-qai-qlee", {t: Date.now(), items, done: {}});
  await page.goto("/preguntas.html?id=qlee");
  const q1 = page.locator('details[data-qn="1"]');
  await q1.locator("summary").click();
  await expect(q1).toHaveAttribute("open", "");
  await page.mouse.wheel(0, 900); await page.waitForTimeout(300);
  const y = await page.evaluate(() => window.scrollY);
  expect(y).toBeGreaterThan(300);
  // 1) a sync with nothing new for this page
  await page.evaluate(() => window.clareaRefresh());
  await expect(q1).toHaveAttribute("open", "");
  expect(await page.evaluate(() => window.scrollY)).toBe(y);
  // 2) the AI saves the 8th explanation (the page does change) and then a sync arrives
  await page.evaluate(([u, it]) => { const k = "u/" + u + "/clarea-qai-qlee", a = JSON.parse(localStorage.getItem(k)); a.items[8] = it; a.t = Date.now(); localStorage.setItem(k, JSON.stringify(a)); window.clareaRefresh(); },
    [user, item("Pregunta 8: ¿qué es esto?", "T8")]);
  await expect(q1).toHaveAttribute("open", "");
  expect(Math.abs(await page.evaluate(() => window.scrollY) - y)).toBeLessThan(2);
});

test("inicio: lo que tienes abierto sigue abierto si llega una sincronización", async ({ page }) => {
  await signUp(page);
  await page.evaluate(() => window.clareaGo("configuracion"));
  const d = page.locator("#app details").first();
  test.skip(!(await d.count()), "no hay apartados plegables en Configuración");
  await d.locator(":scope > summary").click();
  await page.evaluate(() => window.clareaRefresh());
  await expect(d).toHaveAttribute("open", "");
});
