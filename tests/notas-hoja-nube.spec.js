// Notas: with a Gemini key the sheet is read in the cloud (Clarea can be closed); the result is saved when it comes back.
const { test, expect } = require("@playwright/test");
const { signUp, go, getLocal, fakeGemini, geminiReady, axe } = require("./helpers");

// a tiny real PNG (2x2), as a photo of the sheet
const PNG = Buffer.from("iVBORw0KGgoAAAANSUhEUgAAAAIAAAACCAIAAAD91JpzAAAAFklEQVR4nGP8z8DAwMDAxMDAwMDAAAANHQEDasKb6QAAAABJRU5ErkJggg==", "base64");
const ANSWER = {subject: "PJ6", items: [{code: "A1", name: "Examen", pct: 40, kind: "examen", grade: null}, {code: "A2", name: "Proyecto", pct: 60, kind: "proyecto", grade: null}], pass: 5, noRound: false, minAttendance: null, info: {}};

async function cloud(page, state){
  const seen = {posted: null, cancelled: 0};
  await page.route(/workers\.dev\/$/, r => r.fulfill({headers: {"access-control-allow-origin": "*"}, json: {ok: true, service: "clarea-push", genFiles: state.old ? undefined : true}}));
  await page.route(/\/gen(\/[A-Za-z0-9_-]+(\/cancel)?)?(\?|$)/, async route => {
    const rq = route.request(), u = new URL(rq.url()), cors = {"access-control-allow-origin": "*"};
    if (rq.method() === "OPTIONS") return route.fulfill({status: 204, headers: Object.assign({"access-control-allow-headers": "Content-Type", "access-control-allow-methods": "GET, POST"}, cors)});
    if (u.pathname.endsWith("/gen")){ seen.posted = rq.postDataJSON(); return route.fulfill({headers: cors, json: {ok: true, id: "abcdefghijkl", secret: "secreto"}}); }
    if (u.pathname.endsWith("/cancel")){ seen.cancelled++; return route.fulfill({headers: cors, json: {ok: true}}); }
    const part = state.now === "ok" ? {id: "hoja", st: "ok", res: JSON.stringify(ANSWER)} : state.now === "err" ? {id: "hoja", st: "err", err: "API key not valid"} : {id: "hoja", st: "wait"};
    return route.fulfill({headers: cors, json: {ok: true, done: state.now !== "wait", model: "gemini-9-flash", parts: [part]}});
  });
  return seen;
}

test("hoja en la nube: se envía con la foto, se puede cerrar y se guarda al volver", async ({ page }) => {
  const state = {now: "wait"}, seen = await cloud(page, state);
  const calls = await fakeGemini(page, () => "{}");
  const user = await signUp(page);
  await geminiReady(page, user);
  await go(page, "asig/PJ6/notas");
  await page.locator('input[name="grimg"]').setInputFiles({name: "hoja.png", mimeType: "image/png", buffer: PNG});
  await page.locator('#grf [type="submit"]').click();
  await expect(page.locator(".grimp .aimsg")).toContainText("Tu IA está leyendo la hoja en la nube");
  expect(await axe(page, "notas: leyendo en la nube")).toEqual([]);
  expect(seen.posted.parts[0].id).toBe("hoja");
  expect(seen.posted.parts[0].text).toContain("Lee cómo se evalúa esta asignatura");
  expect(seen.posted.parts[0].files).toHaveLength(1);
  expect(seen.posted.parts[0].files[0].mime).toBe("image/jpeg");
  expect(calls.filter(c => c.prompt)).toHaveLength(0);                    // not read here
  // «closed» and back: the result is collected and saved
  state.now = "ok";
  await page.reload(); await go(page, "asig/PJ6/notas");
  await expect(page.locator(".grrow")).toHaveCount(2, {timeout: 15000});
  const g = await getLocal(page, user, "clarea-notas-PJ6");
  expect(g.items.map(i => i.pct)).toEqual([40, 60]);
  expect(g.src.name).toContain("hoja");
  expect(await getLocal(page, user, "clarea-gcloud-PJ6")).toBe(null);
  expect(seen.cancelled).toBeGreaterThan(0);                               // the job is cleaned up on the server
});

test("hoja en la nube: si falla, lo dice y deja hacerlo con tu chat; «Cancelar» la quita", async ({ page }) => {
  const state = {now: "wait"}; await cloud(page, state);
  await fakeGemini(page, () => "{}");
  const user = await signUp(page);
  await geminiReady(page, user);
  await go(page, "asig/PJ6/notas");
  await page.locator('input[name="grimg"]').setInputFiles({name: "hoja.png", mimeType: "image/png", buffer: PNG});
  await page.locator('#grf [type="submit"]').click();
  await expect(page.locator(".grimp .aimsg")).toContainText("en la nube");
  await page.locator("[data-grcloudstop]").click();
  await expect(page.locator(".grimp")).toContainText("Cancelado.");
  expect(await getLocal(page, user, "clarea-gcloud-PJ6")).toBe(null);
  // again, and this time the AI fails
  await page.locator('input[name="grimg"]').setInputFiles({name: "hoja.png", mimeType: "image/png", buffer: PNG});
  await page.locator('#grf [type="submit"]').click();
  await expect(page.locator(".grimp .aimsg")).toContainText("en la nube");
  state.now = "err";
  await expect(page.locator(".grimp .aimsg.err")).toContainText("Tu IA no reconoce la clave", {timeout: 15000});
  await expect(page.locator(".grimp")).toContainText("Con tu chat de IA");
});

test("hoja en la nube: con un servidor antiguo (sin fotos en la nube), la foto se lee aquí", async ({ page }) => {
  const state = {now: "wait", old: true}, seen = await cloud(page, state);
  const calls = await fakeGemini(page, () => ANSWER);
  const user = await signUp(page);
  await geminiReady(page, user);
  await go(page, "asig/PJ6/notas");
  await page.locator('input[name="grimg"]').setInputFiles({name: "hoja.png", mimeType: "image/png", buffer: PNG});
  await page.locator('#grf [type="submit"]').click();
  await expect(page.locator(".grrow")).toHaveCount(2, {timeout: 15000});
  expect(seen.posted).toBe(null);
  expect(calls.filter(c => c.prompt).length).toBeGreaterThan(0);
});
