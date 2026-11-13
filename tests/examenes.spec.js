// Exam questions: edit them (also from photos or a PDF), prepared by themselves with a key, the AI's mark in «Ponte a prueba» (remembered), the answers' language, and the review round from «Por hacer».
const { test, expect } = require("@playwright/test");
const { signUp, putLocal, getLocal, fakeGemini, FAKE_MODELS, axe } = require("./helpers");

const item = (q, k) => ({q, level: "media", short: "Corta de prueba.", answer: "Respuesta modelo de prueba.", points: [], keyTerms: [k], example: "", mistakes: [], tip: ""});
async function withSet(page, user){
  await putLocal(page, user, "clarea-qsets", {t: Date.now(), list: [{id: "qprueba", subj: "SM7", subjName: "", name: "Prueba", lang: "es", created: Date.now(),
    qs: [{n: 1, q: "¿Qué es REST?"}, {n: 2, q: "¿Qué es SOAP?"}, {n: 3, q: "¿Qué es un servcio web mal leido?"}]}]});
  await putLocal(page, user, "clarea-qai-qprueba", {t: Date.now(), items: {1: item("¿Qué es REST?", "HTTP"), 2: item("¿Qué es SOAP?", "XML"), 3: item("¿Qué es un servcio web mal leido?", "API")}, done: {}});
}

test("preguntas de examen: editar, preparar solas, corregir con IA, idioma y repaso desde «Por hacer»", async ({ page }) => {
  test.setTimeout(120000);                                              // many screens, each checked for accessibility in light and dark
  const user = await signUp(page);
  await withSet(page, user);
  await page.goto("/preguntas.html?id=qprueba");
  await expect(page.locator(".qi")).toHaveCount(3);

  // edit: fix the third one, remove the first and add a new one
  await page.getByRole("button", { name: "Editar preguntas" }).click();
  await expect(page.locator("[data-qedq]")).toHaveCount(3);
  await page.locator('[data-qedq="2"]').fill("¿Qué es un servicio web?");
  expect(await axe(page, "editar preguntas")).toEqual([]);
  await page.getByRole("button", { name: "Quitar la pregunta 1" }).click();
  await expect(page.locator("[data-qedq]")).toHaveCount(2);
  await page.locator("[data-qedadd]").fill("¿Qué es gRPC?");
  await page.getByRole("button", { name: "Guardar", exact: true }).click();
  await expect(page.locator(".qi")).toHaveCount(3);
  await expect(page.locator(".qi .qtx b")).toHaveText(["¿Qué es SOAP?", "¿Qué es un servicio web?", "¿Qué es gRPC?"]);
  await expect(page.locator(".qi .qn")).toHaveText(["1", "2", "3"]);
  const set = (await getLocal(page, user, "clarea-qsets")).list[0];
  expect(set.qs.map(q => q.n)).toEqual([2, 3, 4]);                   // the ids stay; a new one never reuses an old one
  const ai = await getLocal(page, user, "clarea-qai-qprueba");
  expect(Object.keys(ai.items)).toEqual(["2"]);                         // removed and changed ones lose their explanation

  // the answers' language: Clarea's own buttons, not a native select
  await page.locator("#pgear").click();
  await expect(page.locator(".psheet select")).toHaveCount(0);
  await page.locator('[data-qslang="ca"]').click();
  await page.locator('[data-qset="save"]').click();
  expect((await getLocal(page, user, "clarea-qsets")).list[0].lang).toBe("ca");

  // with a Gemini key (here, on this device), the questions without an explanation are prepared by themselves
  await putLocal(page, user, "clarea-ai", {t: Date.now(), prov: "gemini", keys: {gemini: "clave-de-prueba"}, ok: {gemini: "clave-de-prueba"}, models: {gemini: FAKE_MODELS[0]}, cloud: false});
  const calls = await fakeGemini(page, p => {
    if (/"score"/.test(p)) return {score: 8.5, feedback: "Bien explicado: falta nombrar **XML**."};
    if (/"questions"/.test(p)) return {questions: ["¿Qué es WSDL?"]};
    const qs = [...(p.split("Preguntas:\n")[1] || "").matchAll(/^(\d+)\. ([^\n[]+)/gm)];
    return {items: qs.map(m => ({n: +m[1], q: m[2].trim(), level: "facil", why: "", short: "Corta.", answer: "Respuesta preparada sola.", points: [], keyTerms: ["prueba"], example: "", mistakes: [], tip: ""}))};
  });
  await page.reload();
  await expect.poll(async () => Object.keys((await getLocal(page, user, "clarea-qai-qprueba")).items).sort().join(","), { timeout: 15000 }).toBe("2,3,4");
  expect(calls.filter(c => /"items"/.test(c.prompt)).length).toBe(1);

  // «Ponte a prueba»: your AI marks what you wrote, its suggestion is the highlighted button, and the mark is remembered
  await page.getByRole("tab", { name: "Ponte a prueba" }).click();
  await page.locator('[data-prmode="azar"]').click();
  await page.locator("[data-prgo]").click();
  await page.locator("#prans").fill("Un protocolo con mensajes XML.");
  await page.getByRole("button", { name: "Ver la respuesta" }).click();
  await expect(page.locator(".prmark .lv")).toHaveText("8,5 / 10");
  await expect(page.getByText("Bien explicado")).toBeVisible();
  await expect(page.locator('[data-prgrade="2"]')).not.toHaveClass(/ghostbtn/);
  await expect(page.locator('[data-prgrade="0"]')).toHaveClass(/ghostbtn/);
  expect(await axe(page, "ponte a prueba con nota de la IA")).toEqual([]);
  await page.locator("[data-prexit]").click();
  await page.getByRole("tab", { name: "Preguntas" }).click();
  await expect(page.locator(".qi .lv", { hasText: "Tu IA: 8,5" })).toHaveCount(1);
  expect(await axe(page, "preguntas con la nota de la IA")).toEqual([]);

  // «Editar preguntas» → «Desde fotos o PDF»: your AI reads them into «Añadir preguntas»
  await page.getByRole("button", { name: "Editar preguntas" }).click();
  await page.locator("[data-qedphoto]").setInputFiles({ name: "examen.pdf", mimeType: "application/pdf", buffer: Buffer.from("%PDF-1.4 prueba") });
  await expect(page.locator("[data-qedadd]")).toHaveValue("1. ¿Qué es WSDL?");
  await expect(page.getByText("1 pregunta leída")).toBeVisible();
  expect(await axe(page, "editar con preguntas leídas de un PDF")).toEqual([]);
  await page.getByRole("button", { name: "Cancelar" }).click();

  // «Por hacer» → the review round straight away (SOAP was studied 2 days ago and its turn has come)
  await putLocal(page, user, "clarea-qp-qprueba", {t: Date.now(), mine: {2: {box: 1, seen: Date.now() - 2 * 864e5}}});
  await page.goto("/index.html");
  const row = page.locator(".planr", { hasText: "Repasar 1 pregunta" });
  await row.click();
  await expect(page).toHaveURL(/preguntas\.html\?id=qprueba$/);
  await expect(page.locator(".prtop")).toContainText("Pregunta 1 de 1");
  await expect(page.locator(".prq b").first()).toHaveText("¿Qué es SOAP?");
});
