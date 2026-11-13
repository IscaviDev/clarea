// Exam questions for any course: the AI is told your course and subject; «Escuchar» reads the answer aloud; «Tarjetas rápidas».
const { test, expect } = require("@playwright/test");
const { signUp, putLocal, fakeGemini, FAKE_MODELS, axe } = require("./helpers");

const item = (q, short) => ({q, level: "media", short, answer: "La **fotosíntesis** convierte la luz en energía química.", points: [], keyTerms: ["clorofila"], example: "", mistakes: [], tip: ""});
async function withSet(page, user, prepared){
  await putLocal(page, user, "clarea-qsets", {t: Date.now(), list: [{id: "qbio", subj: "BIO", subjName: "Biología", course: "1º de Bachillerato", lang: "es", name: "Tema 3", created: Date.now(),
    qs: [{n: 1, q: "¿Qué es la fotosíntesis?"}, {n: 2, q: "¿Dónde ocurre?"}, {n: 3, q: "¿Qué produce?"}]}]});
  if (prepared) await putLocal(page, user, "clarea-qai-qbio", {t: Date.now(), items: {1: item("¿Qué es la fotosíntesis?", "Luz → energía."), 2: item("¿Dónde ocurre?", "En los cloroplastos."), 3: item("¿Qué produce?", "Glucosa y oxígeno.")}, done: {}});
}

test("la IA prepara las preguntas con tu curso y tu asignatura (no da por hecho ningún curso)", async ({ page }) => {
  const user = await signUp(page);
  await withSet(page, user, false);
  await putLocal(page, user, "clarea-ai", {t: Date.now(), prov: "gemini", keys: {gemini: "clave-de-prueba"}, ok: {gemini: "clave-de-prueba"}, models: {gemini: FAKE_MODELS[0]}, cloud: false});
  const calls = await fakeGemini(page, p => ({items: [1, 2, 3].map(n => Object.assign({n}, item("Pregunta " + n, "Corta.")))}));
  await page.goto("/preguntas.html?id=qbio");
  await expect.poll(() => calls.length, { timeout: 15000 }).toBeGreaterThan(0);
  expect(calls[0].prompt).toContain("BIO (Biología)");
  expect(calls[0].prompt).toContain("1º de Bachillerato");
  expect(calls[0].prompt).not.toContain("DAW");
  expect(calls[0].prompt).not.toContain("Desarrollo de Aplicaciones Web");
});

test("escuchar: lee en voz alta la pregunta y su respuesta, y se para", async ({ page }) => {
  await page.addInitScript(() => {
    window.__spoken = [];
    Object.defineProperty(window, "speechSynthesis", {configurable: true, value: {speak(u){ window.__spoken.push(u.text); }, cancel(){}}});
  });
  const user = await signUp(page);
  await withSet(page, user, true);
  await page.goto("/preguntas.html?id=qbio");
  await page.locator(".qi summary").first().click();
  const b = page.locator('.qi [data-speak="1"]');
  await b.click();
  await expect(b).toHaveAttribute("aria-pressed", "true");
  await expect(b).toContainText("Parar");
  expect(await page.evaluate(() => window.__spoken)).toEqual(["¿Qué es la fotosíntesis? La fotosíntesis convierte la luz en energía química."]);
  expect(await axe(page, "preguntas · escuchando")).toEqual([]);
  await b.click();
  await expect(b).toContainText("Escuchar");
});

test("tarjetas rápidas: ver la respuesta, «Otra vez» vuelve al final y cuenta las que sabías", async ({ page }) => {
  const user = await signUp(page);
  await withSet(page, user, true);
  await page.goto("/preguntas.html?id=qbio");
  await page.getByRole("tab", { name: "Ponte a prueba" }).click();
  await page.getByRole("button", { name: "Tarjetas rápidas" }).click();
  await expect(page.locator(".prtop")).toContainText("Tarjeta 1 de 3");
  expect(await axe(page, "tarjetas · pregunta")).toEqual([]);
  await page.getByRole("button", { name: "Ver la respuesta" }).click();
  await expect(page.locator(".qcard .qshort")).toBeVisible();
  expect(await axe(page, "tarjetas · respuesta")).toEqual([]);
  await page.getByRole("button", { name: "Otra vez" }).click();
  await expect(page.locator(".prtop")).toContainText("Tarjeta 2 de 4");
  for (let i = 0; i < 3; i++){ await page.getByRole("button", { name: "Ver la respuesta" }).click(); await page.getByRole("button", { name: "La sé" }).click(); }
  await expect(page.locator(".prend")).toContainText("Sabías 2 de 3 a la primera");
  await page.getByRole("button", { name: "Volver" }).click();
  await expect(page.locator("[data-prgo]")).toBeVisible();
});
