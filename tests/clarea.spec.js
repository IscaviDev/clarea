// End-to-end checks of the main screens, plus an accessibility scan (WCAG 2.1 AA) of each one.
const { test, expect } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;

const PASS = "prueba123";
const newUser = () => "t" + Math.random().toString(36).slice(2, 10);

// a fresh account on the local stand-in for Firebase, class DAW-2A, welcome skipped
async function signUp(page){
  await page.addInitScript(() => { try { localStorage.setItem("clarea-dev-api", "http://127.0.0.1:9299"); } catch(e){} });
  await page.goto("/index.html");
  const user = newUser();
  const f = page.locator(".authwrap form");
  // the «Crear cuenta» tab (tapped again until the second password field shows: the page may still be starting)
  for (let i = 0; i < 3 && !(await f.locator('[name="pass2"]').isVisible()); i++){
    await page.getByRole("button", { name: "Crear cuenta" }).first().click();
    await f.locator('[name="pass2"]').waitFor({ state: "visible", timeout: 4000 }).catch(() => {});
  }
  await f.locator('[name="user"]').fill(user);
  await f.locator('[name="pass"]').fill(PASS);
  await f.locator('[name="pass2"]').fill(PASS);
  await f.locator('button[type="submit"], .btn[type="submit"]').first().click();
  await page.locator('[data-grp="DAW-2A"]').click();
  await page.locator("[data-gok]").click();
  await page.locator("[data-wskip]").click();                         // the welcome, once
  await expect(page.locator(".hello h1")).toContainText(user);
  return user;
}
const go = (page, route) => page.evaluate(r => window.clareaGo(r), route);

async function axe(page, name){
  // light and dark: every screen is checked in both themes
  const light = await axeOnce(page, name);
  await page.emulateMedia({ colorScheme: "dark" }); await page.waitForTimeout(150);
  const dark = await axeOnce(page, name + " (oscuro)");
  await page.emulateMedia({ colorScheme: "light" });
  return light.concat(dark);
}
async function axeOnce(page, name){
  const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
  const bad = r.violations.filter(v => v.impact === "serious" || v.impact === "critical");
  if (bad.length) console.log("\n[a11y] " + name + ":\n" + bad.map(v => "  - " + v.id + " (" + v.impact + ", " + v.nodes.length + "): " + v.help + "\n      " + v.nodes.slice(0, 3).map(n => n.target.join(" ")).join("\n      ")).join("\n"));
  return bad;
}

test("inicio: saludo, Hoy, asignaturas y buscador", async ({ page }) => {
  await signUp(page);
  await expect(page.locator(".today h2")).toContainText("Hoy");
  expect(await page.locator(".sgrid .scard").count()).toBeGreaterThan(8);
  await page.locator("[data-search]").click();
  await page.locator(".srch input").fill("pj6");
  await expect(page.locator(".srchi").first()).toContainText("PJ6");
  await page.keyboard.press("Escape");
  expect(await axe(page, "inicio")).toEqual([]);
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
  await expect(page.locator(".pgtiles")).toBeVisible();
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
