// Exam questions: a Simulacro with the weakest questions first, and answering by speaking («Dictar»).
const { test, expect } = require("@playwright/test");
const { signUp, putLocal, axe } = require("./helpers");

const item = q => ({q, level: "media", short: "Corta.", answer: "Respuesta modelo.", points: [], keyTerms: ["HTTP"], example: "", mistakes: [], tip: ""});
async function withSet(page, user){
  await putLocal(page, user, "clarea-qsets", {t: Date.now(), list: [{id: "qsim", subj: "SM7", subjName: "", name: "Prueba", lang: "es", created: Date.now(),
    qs: [{n: 1, q: "¿Qué es REST?"}, {n: 2, q: "¿Qué es SOAP?"}, {n: 3, q: "¿Qué es JSON?"}]}]});
  await putLocal(page, user, "clarea-qai-qsim", {t: Date.now(), items: {1: item("¿Qué es REST?"), 2: item("¿Qué es SOAP?"), 3: item("¿Qué es JSON?")}, done: {}});
  // REST: known (9); SOAP: your AI gave it a 3; JSON: never practised
  await putLocal(page, user, "clarea-qp-qsim", {t: Date.now(), mine: {1: {box: 3, seen: Date.now(), ai: {s: 9, t: Date.now()}}, 2: {box: 0, seen: Date.now(), ai: {s: 3, t: Date.now()}}}});
}
// a stand-in for the browser's speech recognition: it «hears» a sentence and then stops when asked
const fakeSpeech = page => page.addInitScript(() => {
  window.SpeechRecognition = window.webkitSpeechRecognition = class {
    start(){ this.t = setTimeout(() => { const r = [{transcript: "Es un protocolo de mensajes XML"}]; r.isFinal = true; this.onresult && this.onresult({results: [r]}); }, 50); }
    stop(){ clearTimeout(this.t); setTimeout(() => this.onend && this.onend(), 0); }
  };
});

test("simulacro: «Las que flojean» pone primero la de nota más baja", async ({ page }) => {
  const user = await signUp(page);
  await withSet(page, user);
  await page.goto("/preguntas.html?id=qsim");
  await page.getByRole("tab", { name: "Simulacro" }).click();
  const weak = page.locator('[data-simpick="flojas"]');
  await expect(weak).toContainText("1");                                // only SOAP is weak
  expect(await axe(page, "simulacro · elegir cuáles")).toEqual([]);
  await weak.click();
  await page.locator('[data-simn="99"]').click();
  await page.locator("[data-simgo]").first().click();
  await expect(page.locator(".prq b")).toHaveCount(3);
  await expect(page.locator(".prq b").first()).toHaveText("1. ¿Qué es SOAP?");
  await expect(page.locator(".prq b").last()).toHaveText("3. ¿Qué es REST?");   // the one you know, last
});

test("dictar: la respuesta hablada se escribe sola (practicar y simulacro)", async ({ page }) => {
  await fakeSpeech(page);
  const user = await signUp(page);
  await withSet(page, user);
  await page.goto("/preguntas.html?id=qsim");
  await page.getByRole("tab", { name: "Ponte a prueba" }).click();
  await page.locator('[data-prmode="azar"]').click();
  await page.locator("[data-prgo]").click();
  const mic = page.locator('[data-mic="#prans"]');
  await mic.click();
  await expect(page.locator("#prans")).toHaveValue("Es un protocolo de mensajes XML");
  await expect(mic).toHaveAttribute("aria-pressed", "true");
  expect(await axe(page, "practicar · dictando")).toEqual([]);
  await mic.click();
  await expect(mic).toHaveAttribute("aria-pressed", "false");
  await page.getByRole("button", { name: "Ver la respuesta" }).click();
  await expect(page.locator(".prq .qsec p").first()).toHaveText("Es un protocolo de mensajes XML");
  // in the Simulacro, each answer has its own «Dictar»
  await page.locator("[data-prexit]").click();
  await page.getByRole("tab", { name: "Simulacro" }).click();
  await page.locator("[data-simgo]").first().click();
  await expect(page.locator("[data-mic]")).toHaveCount(3);
  await page.locator("[data-mic]").nth(1).click();
  await expect(page.locator("[data-simans]").nth(1)).toHaveValue("Es un protocolo de mensajes XML");
  await expect(page.locator("[data-simans]").nth(0)).toHaveValue("");
});
