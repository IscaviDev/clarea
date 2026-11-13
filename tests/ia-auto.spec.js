// With a Gemini key, a project's AI work (explanations, glossary, exams) starts by itself: no need to press «Generar».
const { test, expect } = require("@playwright/test");
const { signUp, putLocal, getLocal, fakeGemini, FAKE_MODELS } = require("./helpers");

// the same small answers as fakeai.py, for each kind of job
function fakeProject(p){
  if (/"glossary"/.test(p)) return {glossary: ["echo", "return", "function"].map(t => ({term: t, cat: "Prueba", easy: "Concepto de prueba.", tech: "Detalle.", code: "", file: "", line: 0}))};
  if (/"questions"/.test(p)){
    const mc = [0, 1, 2, 3, 4, 5, 6, 7].map(i => ({type: "mc", q: "Pregunta de prueba " + i, options: ["a", "b", "c", "d"], answer: i % 4, why: "Porque sí.", wrong: ["", "", "", ""]}));
    return {questions: mc.concat([{type: "written", q: "Escrita de prueba", model: "Respuesta modelo de prueba.", keyTerms: ["prueba"], wrong: []}])};
  }
  if (/"files"/.test(p) && p.includes("=== ")){
    const files = {};
    for (const m of p.matchAll(/=== (.+?) \(líneas (\d+)-(\d+) de \d+\) ===/g))
      files[m[1]] = {role: "Archivo de prueba", what: "Explicación de prueba.", blocks: [{from: +m[2], to: +m[3], imp: 2, easy: "Bloque de prueba.", tech: "Detalle de prueba."}]};
    return {files};
  }
  return {summary: "Resumen de prueba.", branches: {}, prs: {}};
}

test("proyecto: con clave de Gemini, se genera solo al abrirlo", async ({ page }) => {
  const user = await signUp(page);
  const now = Date.now();
  await putLocal(page, user, "clarea-projs", {t: now, list: [{id: "tauto", subj: "PJ6", name: "Proyecto solo", desc: "", files: 2, lines: 6, created: now}]});
  await putLocal(page, user, "clarea-pcode-tauto", {t: now, files: {"index.php": "<?php\necho 1;\n?>\n", "js/app.js": "function a(){\n  return 1;\n}\n"}});
  await putLocal(page, user, "clarea-ai", {t: now, prov: "gemini", keys: {gemini: "clave-de-prueba"}, ok: {gemini: "clave-de-prueba"}, models: {gemini: FAKE_MODELS[0]}, cloud: false});
  const calls = await fakeGemini(page, fakeProject);
  await page.goto("/proyecto.html?id=tauto");
  await expect(page.locator("#ptitle")).toHaveText("Proyecto solo");
  // nothing pressed: the explanations and the glossary arrive by themselves
  await expect.poll(async () => { const ai = await getLocal(page, user, "clarea-pai-tauto") || {}; return Object.keys(ai.files || {}).length > 0 && (ai.glossary || []).length > 0 && Object.keys(ai.exams || {}).length > 0; }, { timeout: 30000 }).toBe(true);
  expect(calls.length).toBeGreaterThan(0);
});
