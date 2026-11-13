// Projects for any course: documents (PDF, Word, notes) instead of code, rehearsing the defence, and the real exam mode.
const { test, expect } = require("@playwright/test");
const { signUp, go, axe, fakeGemini, geminiReady } = require("./helpers");

// a .zip without compression (a .docx is a .zip too)
function zipOf(files){
  const crcT = Array.from({length: 256}, (_, n) => { let c = n; for (let k = 0; k < 8; k++) c = c & 1 ? 0xEDB88320 ^ (c >>> 1) : c >>> 1; return c >>> 0; });
  const crc = b => { let c = 0xFFFFFFFF; for (const x of b) c = crcT[(c ^ x) & 255] ^ (c >>> 8); return (c ^ 0xFFFFFFFF) >>> 0; };
  const loc = [], cen = []; let off = 0;
  for (const [name, text] of Object.entries(files)){
    const n = Buffer.from(name), d = Buffer.from(text), c = crc(d);
    const h = Buffer.alloc(30); h.writeUInt32LE(0x04034b50, 0); h.writeUInt16LE(20, 4); h.writeUInt32LE(c, 14); h.writeUInt32LE(d.length, 18); h.writeUInt32LE(d.length, 22); h.writeUInt16LE(n.length, 26);
    loc.push(h, n, d);
    const e = Buffer.alloc(46); e.writeUInt32LE(0x02014b50, 0); e.writeUInt16LE(20, 4); e.writeUInt16LE(20, 6); e.writeUInt32LE(c, 16); e.writeUInt32LE(d.length, 20); e.writeUInt32LE(d.length, 24); e.writeUInt16LE(n.length, 28); e.writeUInt32LE(off, 42);
    cen.push(e, n); off += 30 + n.length + d.length;
  }
  const cd = Buffer.concat(cen), end = Buffer.alloc(22);
  end.writeUInt32LE(0x06054b50, 0); end.writeUInt16LE(cen.length / 2, 8); end.writeUInt16LE(cen.length / 2, 10); end.writeUInt32LE(cd.length, 12); end.writeUInt32LE(off, 16);
  return Buffer.concat([...loc, cd, end]);
}
const docx = paras => zipOf({"[Content_Types].xml": "<Types/>", "word/document.xml": '<?xml version="1.0"?><w:document xmlns:w="x"><w:body>' + paras.map(p => '<w:p><w:r><w:t xml:space="preserve">' + p + '</w:t></w:r></w:p>').join("") + '</w:body></w:document>'});
const local = (page, user, key) => page.evaluate(([u, k]) => JSON.parse(localStorage.getItem("u/" + u + "/" + k)), [user, key]);
async function putProject(page, user, P, files, ai){
  await page.evaluate(([u, P, files, ai]) => {
    const K = "u/" + u + "/", now = Date.now();
    localStorage.setItem(K + "clarea-projs", JSON.stringify({t: now, list: [Object.assign({id: "tp1", subj: "PJ6", name: "Proyecto de prueba", desc: "", files: Object.keys(files).length, lines: 6, created: now}, P)]}));
    localStorage.setItem(K + "clarea-pcode-tp1", JSON.stringify({t: now, files}));
    localStorage.setItem(K + "clarea-pai-tp1", JSON.stringify(Object.assign({t: now, glossary: [], exams: {}, files: {}, done: {}}, ai)));
  }, [user, P, files, ai || {}]);
}
// everything already prepared, so the automatic AI has nothing to do
const READY_AI = {files: {"index.php": {role: "Página", what: "La portada.", blocks: [{from: 1, to: 3, imp: 1, easy: "Escribe 1.", tech: ""}]}},
  glossary: [{term: "echo", cat: "PHP", easy: "Escribe texto."}],
  exams: {facil: [0, 1, 2, 3, 4, 5].map(i => ({type: "mc", q: "Pregunta " + i, options: ["a", "b", "c", "d"], answer: 0, why: "Así."})).concat([{type: "written", q: "Explica echo.", model: "Escribe.", keyTerms: ["escribe"]}]),
    media: [{type: "mc", q: "Media", options: ["a", "b", "c", "d"], answer: 0}], dificil: [{type: "mc", q: "Difícil", options: ["a", "b", "c", "d"], answer: 0}]},
  done: {gloss: 1, "exam-facil": 1, "exam-media": 1, "exam-dificil": 1}};

test("documentos: un proyecto con un Word y unos apuntes", async ({ page }) => {
  const user = await signUp(page);
  await go(page, "asig/PJ6/nuevo");
  const chooser = page.waitForEvent("filechooser");
  await page.locator('[data-np="doc"]').click();
  (await chooser).setFiles([
    {name: "Memoria final.docx", mimeType: "application/vnd.openxmlformats-officedocument.wordprocessingml.document", buffer: docx(["Introducción", "La fotosíntesis convierte la luz en energía química.", "Conclusiones &amp; mejoras"])},
    {name: "apuntes.txt", mimeType: "text/plain", buffer: Buffer.from("Tema 1\nLa célula es la unidad básica de la vida.\n")}]);
  await expect(page.locator("#npres")).toContainText("2 archivos");
  await expect(page.locator('#npf [name="pname"]')).toHaveValue("Memoria final");
  expect(await axe(page, "nuevo proyecto con documentos")).toEqual([]);
  await page.locator("#npgo").click();
  await expect(page).toHaveURL(/proyecto\.html\?id=/);
  await expect(page.locator('[data-ptab="codigo"]').first()).toHaveText("Documento");
  await expect(page.locator('[data-ptab="github"]')).toHaveCount(0);
  await expect(page.locator(".pstats")).toContainText("2 documentos");
  const P = (await local(page, user, "clarea-projs")).list[0], id = P.id;
  expect(P.kind).toBe("doc");
  const code = await local(page, user, "clarea-pcode-" + id);
  expect(code.files["Memoria final.md"]).toBe("Introducción\nLa fotosíntesis convierte la luz en energía química.\nConclusiones & mejoras\n");
  // the AI explains the documents by parts, and the glossary and exams are about the work, not code
  const j = await page.evaluate(pid => { const c = CLAI.ctx(pid), jobs = CLAI.buildJobs(c), code = jobs.find(x => x.kind === "code");
    return {parts: code.parts.map(x => x.p).sort(), code: CLAI.prompt(c, code).slice(0, 400), gloss: CLAI.prompt(c, jobs.find(x => x.kind === "gloss")).slice(0, 400)}; }, id);
  expect(j.parts).toEqual(["Memoria final.md", "apuntes.md"]);
  expect(j.code).toContain("Explícale este documento por partes");
  expect(j.code).not.toContain("programación");
  expect(j.gloss).toContain("conceptos clave de este trabajo");
  await page.locator("details.pfile", {hasText: "apuntes.md"}).locator("summary").click();
  await expect(page.locator(".acc summary", {hasText: "Texto completo"})).toBeVisible();
  expect(await axe(page, "proyecto de documentos")).toEqual([]);
});

test("ensayar la defensa: pregunta a pregunta, con nota", async ({ page }) => {
  const user = await signUp(page);
  await putProject(page, user, {}, {"index.php": "<?php\necho 1;\n?>\n"}, READY_AI);
  await geminiReady(page, user);
  const calls = await fakeGemini(page, prompt => {
    if (/Escribe 8 preguntas como las que haría un tribunal/.test(prompt)) return {questions: [{q: "¿De qué trata tu proyecto?", model: "Es una tienda."}, {q: "¿Por qué usaste PHP?", model: "Porque…"}, {q: "¿Qué mejorarías?", model: "La seguridad."}]};
    if (/Corrige la respuesta del estudiante a esta pregunta del tribunal/.test(prompt)) return {score: 7.5, good: "Explicas bien la idea.", missing: "Falta decir quién lo usa.", model: "Es una tienda para…"};
    return {};
  });
  await page.goto("/proyecto.html?id=tp1&tab=examenes");
  const call = page.locator(".cardcall", {hasText: "Ensayar la defensa"});
  await expect(call).toBeVisible();
  await call.locator('[data-def="open"]').click();
  await page.locator('[data-def="start"]').click();
  await expect(page.locator(".defqt")).toHaveText("¿De qué trata tu proyecto?");
  expect(await axe(page, "defensa · pregunta")).toEqual([]);
  await page.locator("#defa").fill("Es una tienda online para mi barrio.");
  await page.locator('[data-def="answer"]').click();
  await expect(page.locator(".xverd")).toContainText("7,5");
  await expect(page.locator(".xfb")).toContainText("Falta decir quién lo usa.");
  expect(calls.filter(c => /Respuesta del estudiante: Es una tienda online para mi barrio\./.test(c.prompt))).toHaveLength(1);
  expect(await axe(page, "defensa · corregida")).toEqual([]);
  await page.locator('[data-def="next"]').click();
  await page.locator('[data-def="skip"]').click();
  await page.locator('[data-def="next"]').click();
  await page.locator('[data-def="skip"]').click();
  await page.locator('[data-def="next"]').click();
  await expect(page.locator(".xgrade b")).toHaveText("2,5");
  expect((await local(page, user, "clarea-pdef-tp1")).done).toEqual([2.5]);
  await page.locator('[data-xback="home"]').click();
  await expect(page.locator(".cardcall", {hasText: "Ensayar la defensa"})).toContainText("Última nota: 2,5");
});

test("modo examen real: con tiempo, y al acabarse se corrige solo", async ({ page }) => {
  const user = await signUp(page);
  await putProject(page, user, {}, {"index.php": "<?php\necho 1;\n?>\n"}, READY_AI);
  await page.goto("/proyecto.html?id=tp1&tab=examenes");
  await page.locator('[data-xdiff="facil"]').click();
  await page.locator('[data-xopen="facil|0"]').click();
  const box = page.locator(".xrealbox");
  await expect(box).toContainText("13 minutos");
  await box.locator("[data-xreal]").click();
  await expect(page.locator("#xtimer")).toContainText("Modo examen");
  await expect(page.locator("#xtleft")).toHaveText(/^1[23]:\d\d$/);
  await expect(page.locator("#pchat")).toBeHidden();
  expect(await axe(page, "modo examen real")).toEqual([]);
  // the time is up
  await page.evaluate(() => { const st = exLoad("facil", 0); st.real.start -= 13 * 60e3; st.real.end = Date.now() - 1; exSave("facil", 0, st); });
  await expect(page.locator(".xres")).toBeVisible();
  await expect(page.locator("#pv")).toContainText("Hecho en modo examen");
  expect((await local(page, user, "clarea-px-tp1-facil-0")).graded).toBe(true);
  await expect(page.locator("#pchat")).toBeVisible();
});
