// Projects: updating the code, reviewing your mistakes and sharing without passwords or keys.
const { test, expect } = require("@playwright/test");
const { signUp, axe } = require("./helpers");

// a project saved in the account, as the app keeps it
async function putProject(page, user, files, ai){
  await page.evaluate(([u, files, ai]) => {
    const P = "u/" + u + "/", now = Date.now();
    localStorage.setItem(P + "clarea-projs", JSON.stringify({t: now, list: [{id: "tp1", subj: "PJ6", name: "Proyecto de prueba", desc: "", files: Object.keys(files).length, lines: 6, created: now}]}));
    localStorage.setItem(P + "clarea-pcode-tp1", JSON.stringify({t: now, files}));
    localStorage.setItem(P + "clarea-pai-tp1", JSON.stringify(Object.assign({t: now, glossary: [], exams: {}, files: {}, done: {}}, ai)));
  }, [user, files, ai || {}]);
}
const local = (page, user, key) => page.evaluate(([u, k]) => JSON.parse(localStorage.getItem("u/" + u + "/" + k)), [user, key]);

// a .zip without compression (enough for the reader)
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

test("proyecto: actualizar el código con un .zip guarda las explicaciones de lo que no cambia", async ({ page }) => {
  const user = await signUp(page);
  const block = {from: 1, to: 3, imp: 1, easy: "Explicación.", tech: ""};
  await putProject(page, user, {"index.php": "<?php\necho 1;\n?>\n", "js/app.js": "function a(){\n  return 1;\n}\n"},
    {files: {"index.php": {role: "Página", what: "La portada.", blocks: [block]}, "js/app.js": {role: "Script", what: "Lógica.", blocks: [block]}}});
  await page.goto("/proyecto.html?id=tp1");
  await expect(page.locator("#ptitle")).toHaveText("Proyecto de prueba");
  await page.locator("#pgear").click();
  await page.locator(".psheet summary", {hasText: "Actualizar el código"}).click();
  const chooser = page.waitForEvent("filechooser");
  await page.locator('[data-pset="upzip"]').click();
  (await chooser).setFiles({name: "proyecto.zip", mimeType: "application/zip",
    buffer: zipOf({"proyecto/index.php": "<?php\necho 1;\n?>\n", "proyecto/js/app.js": "function a(){\n  return 2;\n}\n", "proyecto/css/style.css": "body{margin:0}\n"})});
  const diff = page.locator(".updiff");
  await expect(diff).toContainText("1archivo cambia");
  await expect(diff).toContainText("1archivo nuevo");
  await expect(diff).toContainText("1archivo igual");
  expect(await axe(page, "proyecto · actualizar el código")).toEqual([]);
  await page.locator('[data-up="save"]').click();
  await expect(page.locator('[data-ptab="ia"]').first()).toHaveAttribute("aria-selected", "true");
  const code = await local(page, user, "clarea-pcode-tp1"), ai = await local(page, user, "clarea-pai-tp1"), projs = await local(page, user, "clarea-projs");
  expect(Object.keys(code.files).sort()).toEqual(["css/style.css", "index.php", "js/app.js"]);
  expect(code.files["js/app.js"]).toContain("return 2");
  expect(Object.keys(ai.files)).toEqual(["index.php"]);          // the file that did not change keeps its explanation
  expect(projs.list[0].files).toBe(3);
});

test("proyecto: el mismo código no cambia nada", async ({ page }) => {
  const user = await signUp(page);
  await putProject(page, user, {"index.php": "<?php\necho 1;\n?>\n"});
  await page.goto("/proyecto.html?id=tp1");
  await expect(page.locator("#ptitle")).toHaveText("Proyecto de prueba");
  await page.locator("#pgear").click();
  await page.locator(".psheet summary", {hasText: "Actualizar el código"}).click();
  const chooser = page.waitForEvent("filechooser");
  await page.locator('[data-pset="upzip"]').click();
  (await chooser).setFiles({name: "p.zip", mimeType: "application/zip", buffer: zipOf({"index.php": "<?php\necho 1;\n?>\n"})});
  await expect(page.locator("#upb")).toContainText("No hay cambios");
});

test("proyecto: repasar mis fallos y las tarjetas de esos conceptos", async ({ page }) => {
  const user = await signUp(page);
  const mc = i => ({type: "mc", q: "¿Qué hace «echo» en el caso " + i + "?", options: ["a", "b", "c", "d"], answer: i % 4, why: "Porque sí."});
  await putProject(page, user, {"index.php": "<?php\necho 1;\n?>\n"}, {
    glossary: [{term: "echo", cat: "PHP", easy: "Escribe texto."}, {term: "return", cat: "PHP", easy: "Devuelve un valor."}],
    exams: {facil: [0, 1, 2, 3, 4, 5].map(mc).concat([{type: "written", q: "Explica «echo».", model: "Escribe.", keyTerms: ["escribe"]}])}, done: {gloss: 1, "exam-facil": 1}});
  // «echo» was known on the cards two days ago: without mistakes it would not be due for days
  await page.evaluate(u => localStorage.setItem("u/" + u + "/clarea-pcards-tp1", JSON.stringify({t: Date.now(), box: {echo: 4}, seen: {echo: Date.now() - 2 * 864e5}})), user);
  await page.goto("/proyecto.html?id=tp1&tab=examenes");
  // the first exam, corrected with 3 test questions wrong
  await page.evaluate(() => { const qs = examQs("facil", 0), st = {ans: {}, ai: {}}; let bad = 0;
    qs.forEach((q, i) => { if (q.type === "mc") st.ans[i] = bad++ < 3 ? (q.answer + 1) % 4 : q.answer; });
    const G = gradeExam(qs, st); st.graded = true; st.nota = G.nota; st.pts = G.pts; st.gt = Date.now() - 1000; exSave("facil", 0, st); render(); });
  const call = page.locator(".cardcall", {hasText: "Repasar mis fallos"});
  await expect(call).toContainText("3 preguntas que aún fallas");
  expect(await axe(page, "proyecto · exámenes con fallos")).toEqual([]);
  await call.locator("[data-xfallos]").click();
  await expect(page.locator(".xexhead h3")).toHaveText("Las que fallaste");
  await expect(page.locator("details.xq")).toHaveCount(3);
  // two right and one wrong
  const answers = await page.evaluate(() => examQs("fallos", 0).map(q => q.answer));
  for (let i = 0; i < 3; i++){
    await page.locator("#xq" + i + " summary").click();
    await page.locator('#xq' + i + ' [data-xo="' + (i < 2 ? answers[i] : (answers[i] + 1) % 4) + '"]').click();
  }
  await page.locator('[data-xconfirm="1"]').click();
  await page.locator('[data-xgrade="1"]').click();
  await expect(page.locator(".cardcall").first()).toContainText("Aún falla 1 pregunta");
  expect(await axe(page, "proyecto · repaso de fallos corregido")).toEqual([]);
  await page.locator("[data-xfallos]").click();
  await expect(page.locator("details.xq")).toHaveCount(1);
  // the cards: «echo» comes first, because it is in the questions still wrong
  await page.locator('[data-ptab="glosario"]').first().click();
  await page.locator("[data-cards]").click();
  await expect(page.locator(".cardterm")).toHaveText("echo");
  await expect(page.locator(".card")).toContainText("Sale en preguntas que fallas");
});

test("proyecto: al compartir se tapan las contraseñas y las claves", async ({ page }) => {
  const SHARE = "http://127.0.0.1:8799";
  await page.addInitScript(url => { let v = {}; Object.defineProperty(window, "CLAREA_PUSH", {configurable: true, get: () => Object.assign({}, v, {url}), set: x => { v = x || {}; }}); }, SHARE);
  const sent = [];
  await page.route(SHARE + "/**", async route => {
    if (route.request().method() === "OPTIONS") return route.fulfill({status: 204, headers: {"access-control-allow-origin": "*", "access-control-allow-headers": "Content-Type"}});
    sent.push(route.request().postDataJSON());
    await route.fulfill({json: {id: "abcdefghijkl", del: "borrar"}, headers: {"access-control-allow-origin": "*"}});
  });
  const user = await signUp(page);
  await putProject(page, user, {"conexion.php": '<?php\n$conn = mysqli_connect("localhost", "root", "s3cr3ta", "tienda");\n?>\n', ".env.example": "DB_PASS=tu_contraseña\n"},
    {glossary: [{term: "mysqli_connect", cat: "PHP", easy: "Conecta.", code: '$conn = mysqli_connect("localhost", "root", "s3cr3ta", "tienda");'}], done: {gloss: 1}});
  await page.goto("/proyecto.html?id=tp1");
  await expect(page.locator("#ptitle")).toHaveText("Proyecto de prueba");
  await page.locator("#pshare").click();
  const warn = page.locator(".shwarn");
  await expect(warn).toContainText("algo que parece una contraseña o clave");
  await warn.locator("summary").click();
  await expect(warn.locator(".shsec")).toContainText("conexion.php, línea 2");
  await expect(warn.locator(".shsec code")).not.toContainText("s3cr3ta");
  expect(await axe(page, "proyecto · compartir con claves")).toEqual([]);
  await page.locator('[data-sh="create"]').first().click();
  await expect(page.locator("#shm")).toContainText("tapadas");
  const snap = JSON.stringify((sent.find(x => x && x.snap) || {}).snap);   // other calls to the server (your devices) may come first
  expect(snap).not.toContain("s3cr3ta");
  expect(snap).toContain("•••");
  expect(snap).toContain("tu_contraseña");                       // the example file is fine as it is
  expect((await local(page, user, "clarea-pcode-tp1")).files["conexion.php"]).toContain("s3cr3ta");   // your project does not change
});

test("proyecto: al actualizar, un archivo que cambia poco guarda lo que no cambió", async ({ page }) => {
  const user = await signUp(page);
  const app = "function a(){\n  return 1;\n}\n\nfunction b(){\n  return 2;\n}\n";
  await putProject(page, user, {"js/app.js": app}, {files: {"js/app.js": {role: "Script", what: "Lógica.", blocks: [{from: 1, to: 4, imp: 2, easy: "La función a.", tech: ""}, {from: 5, to: 7, imp: 1, easy: "La función b.", tech: ""}]}}});
  await page.goto("/proyecto.html?id=tp1");
  await expect(page.locator("#ptitle")).toHaveText("Proyecto de prueba");
  await page.locator("#pgear").click();
  await page.locator(".psheet summary", {hasText: "Actualizar el código"}).click();
  const chooser = page.waitForEvent("filechooser");
  await page.locator('[data-pset="upzip"]').click();
  (await chooser).setFiles({name: "p.zip", mimeType: "application/zip", buffer: zipOf({"p/js/app.js": "// nuevo\nfunction a(){\n  return 1;\n}\n\nfunction b(){\n  return 22;\n}\n"})});
  await expect(page.locator("#upb")).toContainText("1 bloque que no cambian");
  await page.locator('[data-up="save"]').click();
  const F = (await local(page, user, "clarea-pai-tp1")).files["js/app.js"];
  expect(F.blocks).toEqual([expect.objectContaining({from: 2, to: 4, easy: "La función a."})]);
  expect(F.gaps).toEqual([[1, 1], [5, 8]]);
  // the AI is asked only for the lines that changed, and with them the file is done
  const st = await page.evaluate(() => { const c = CLAI.ctx("tp1"), j = CLAI.buildJobs(c).find(x => x.kind === "code");
    const before = CLAI.isDone(c, j), parts = j.parts.map(x => [x.from, x.to]);
    CLAI.applyResult(c, j, {files: {"js/app.js": {blocks: [{from: 1, to: 1, imp: 0, easy: "Comentario."}, {from: 5, to: 8, imp: 1, easy: "La función b, nueva."}]}}});
    return {before, parts, title: CLAI.jobTitle(c, j), after: CLAI.isDone(CLAI.ctx("tp1"), j)}; });
  expect(st).toEqual({before: false, parts: [[1, 1], [5, 8]], title: "app.js (partes que cambian)", after: true});
});

test("proyecto: el hueco que cambió se ve en «Línea a línea»", async ({ page }) => {
  const user = await signUp(page);
  await putProject(page, user, {"js/app.js": "// nuevo\nfunction a(){\n  return 1;\n}\n"}, {files: {"js/app.js": {role: "Script", what: "Lógica.", blocks: [{from: 2, to: 4, imp: 2, easy: "La función a.", tech: ""}], gaps: [[1, 1]]}}});
  await page.goto("/proyecto.html?id=tp1");
  await page.locator("details.pfile summary").first().click();
  await page.locator(".acc summary", {hasText: "Línea a línea"}).click();
  await expect(page.locator(".lhole")).toContainText("Ha cambiado y aún no tiene explicación");
  expect(await axe(page, "proyecto · línea a línea con un hueco")).toEqual([]);
});

test("proyecto: examen de un archivo", async ({ page }) => {
  const user = await signUp(page);
  const q = (i, file) => ({type: "mc", q: "Pregunta " + i, options: ["a", "b", "c", "d"], answer: 0, why: "Así.", file, line: 1});
  await putProject(page, user, {"index.php": "<?php\necho 1;\n?>\n", "js/app.js": "function a(){\n  return 1;\n}\n"},
    {exams: {facil: [q(1, "index.php"), q(2, "index.php"), q(3, "js/app.js")], media: [q(4, "index.php")]}, done: {"exam-facil": 1, "exam-media": 1}});
  await page.goto("/proyecto.html?id=tp1");
  await page.locator("details.pfile", {hasText: "index.php"}).locator("summary").click();
  const b = page.locator('[data-xfile="index.php"]');
  await expect(b).toHaveText("Examen de este archivo · 3 preguntas");
  expect(await axe(page, "proyecto · archivo con examen")).toEqual([]);
  await b.click();
  await expect(page.locator('[data-ptab="examenes"]').first()).toHaveAttribute("aria-selected", "true");
  await expect(page.locator(".xexhead h3")).toHaveText("index.php");
  await expect(page.locator("details.xq")).toHaveCount(3);
  expect(await axe(page, "proyecto · examen de un archivo")).toEqual([]);
});

test("repaso compartido: al volver, dice qué ha cambiado", async ({ page }) => {
  const SHARE = "http://127.0.0.1:8799";
  await page.addInitScript(url => { let v = {}; Object.defineProperty(window, "CLAREA_PUSH", {configurable: true, get: () => Object.assign({}, v, {url}), set: x => { v = x || {}; }}); }, SHARE);
  const snap = (t, files, glossary) => ({v: 1, by: "ana", p: {name: "Tienda", desc: "", subj: "PJ6", files: Object.keys(files).length, lines: 4}, files, ai: {files: {}, glossary, exams: {}, done: {}}, git: null, t});
  let current = snap(1000, {"index.php": "<?php\necho 1;\n?>\n"}, [{term: "echo", cat: "PHP", easy: "Escribe."}]);
  await page.route(SHARE + "/share/**", route => route.fulfill({json: current, headers: {"access-control-allow-origin": "*"}}));
  await signUp(page);
  await page.goto("/proyecto.html?share=abcdefghijkl");
  await expect(page.locator(".sharebar")).toContainText("Repaso compartido por ana");
  await expect(page.locator(".shnew")).toHaveCount(0);                 // the first visit: nothing to compare with
  current = snap(2000, {"index.php": "<?php\necho 2;\n?>\n", "css/a.css": "body{}\n"}, [{term: "echo", cat: "PHP", easy: "Escribe."}, {term: "body", cat: "CSS", easy: "La página."}]);
  await page.goto("/proyecto.html?share=abcdefghijkl");
  const n = page.locator(".shnew");
  await expect(n).toContainText("Hay cambios desde tu última visita");
  await expect(n).toContainText("1 archivo cambia · 1 archivo nuevo · 1 concepto nuevo en el glosario");
  await expect(page.locator("details.pfile", {hasText: "index.php"}).locator(".newtag")).toHaveText("Cambia");
  expect(await axe(page, "repaso compartido con cambios")).toEqual([]);
  await page.goto("/proyecto.html?share=abcdefghijkl");
  await expect(page.locator(".sharebar")).toBeVisible();
  await expect(page.locator(".shnew")).toHaveCount(0);                 // seen: it does not come back
});

test("proyecto: tarjetas de un archivo", async ({ page }) => {
  const user = await signUp(page);
  await putProject(page, user, {"index.php": "<?php\necho 1;\n?>\n", "js/app.js": "function a(){\n  return 1;\n}\n"},
    {glossary: [{term: "echo", cat: "PHP", easy: "Escribe."}, {term: "return", cat: "JS", easy: "Devuelve.", file: "js/app.js"}, {term: "function", cat: "JS", easy: "Define una función."}], done: {gloss: 1}});
  await page.goto("/proyecto.html?id=tp1");
  await page.locator("details.pfile", {hasText: "app.js"}).locator("summary").click();
  const b = page.locator('[data-cfile="js/app.js"]');
  await expect(b).toHaveText("Tarjetas · 2 conceptos");
  await b.click();
  await expect(page.locator(".cardtop")).toContainText("1 de 2 · app.js");
  expect(await axe(page, "proyecto · tarjetas de un archivo")).toEqual([]);
  await page.locator(".card").click();
  await page.locator('[data-cans="1"]').click();
  await page.locator(".card").click();
  await page.locator('[data-cans="1"]').click();
  await expect(page.locator(".cardend")).toContainText("Sabías 2 de 2");
});

test("proyecto: aviso de código nuevo en GitHub, y actualizar con un toque", async ({ page }) => {
  const user = await signUp(page);
  let sha = "c2";
  const cors = {"access-control-allow-origin": "*", "access-control-expose-headers": "x-ratelimit-remaining"};
  await page.route("https://api.github.com/**", route => {
    const u = new URL(route.request().url());
    if (u.pathname === "/repos/ana/tienda/commits") return route.fulfill({json: [{sha, commit: {message: "Arreglo el login\n\nDetalles", committer: {date: new Date().toISOString()}}}], headers: cors});
    if (u.pathname === "/repos/ana/tienda") return route.fulfill({json: {full_name: "ana/tienda", default_branch: "main", private: false, name: "tienda"}, headers: cors});
    if (u.pathname.startsWith("/repos/ana/tienda/git/trees/")) return route.fulfill({json: {tree: [{type: "blob", path: "index.php", size: 20}]}, headers: cors});
    return route.fulfill({status: 404, json: {}, headers: cors});
  });
  await page.route("https://raw.githubusercontent.com/**", route => route.fulfill({body: "<?php\necho 2;\n?>\n", headers: {"access-control-allow-origin": "*"}}));
  await putProject(page, user, {"index.php": "<?php\necho 1;\n?>\n"});
  // uploaded yesterday, from GitHub
  await page.evaluate(u => { const P = "u/" + u + "/", l = JSON.parse(localStorage.getItem(P + "clarea-projs")), c = JSON.parse(localStorage.getItem(P + "clarea-pcode-tp1"));
    l.list[0].repo = "ana/tienda"; c.t = Date.now() - 864e5; localStorage.setItem(P + "clarea-projs", JSON.stringify(l)); localStorage.setItem(P + "clarea-pcode-tp1", JSON.stringify(c)); }, user);
  await page.goto("/proyecto.html?id=tp1");
  const n = page.locator(".ghnew");
  await expect(n).toContainText("Hay código nuevo en GitHub");
  await expect(n).toContainText("Arreglo el login");
  expect(await axe(page, "proyecto · código nuevo en GitHub")).toEqual([]);
  await n.locator("[data-ghup]").click();
  await expect(page.locator(".updiff")).toContainText("1archivo cambia");
  await page.locator('[data-up="save"]').click();
  expect((await local(page, user, "clarea-projs")).list[0].ghsha).toBe("c2");
  expect((await local(page, user, "clarea-pcode-tp1")).files["index.php"]).toContain("echo 2");
  await page.locator('[data-ptab="codigo"]').first().click();
  await expect(page.locator(".ghnew")).toHaveCount(0);
  // a newer commit, and «Ahora no»: it does not come back for that commit
  sha = "c3";
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await expect(page.locator(".ghnew")).toBeVisible();
  await page.locator("[data-ghskip]").click();
  await expect(page.locator(".ghnew")).toHaveCount(0);
  await page.evaluate(() => sessionStorage.clear());
  await page.reload();
  await expect(page.locator("#ptitle")).toHaveText("Proyecto de prueba");
  await page.waitForTimeout(2000);
  await expect(page.locator(".ghnew")).toHaveCount(0);
});
