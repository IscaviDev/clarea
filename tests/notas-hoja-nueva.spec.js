// Notas: the sheet you took from a classmate. If they change it, a short notice to change to the new one (keeping your marks).
const { test, expect } = require("@playwright/test");
const { signUp, go, putLocal, getLocal, axe } = require("./helpers");

const ID = "abcdefghijkl";
const item = (code, name, pct, kind) => ({code, name, pct, kind, teacher: "", grade: null});
const snap = items => ({v: 1, kind: "notas", by: "ana", p: {subj: "PJ6", subjName: "Proyecto"}, files: {}, t: Date.now(),
  ai: {items, pass: 5, noRound: false, minAttendance: null, rules: [], info: {}, src: null}});
const OLD = [item("A1", "Examen 1", 40, "examen"), item("A2", "Práctica", 60, "proyecto")];
const NEW = [item("A1", "Examen 1", 30, "examen"), item("A2", "Práctica", 50, "proyecto"), item("A3", "Exposición", 20, "otro")];

async function setup(page, served){
  let now = served;
  await page.route("**/share/" + ID, r => r.fulfill({status: 200, contentType: "application/json", headers: {"access-control-allow-origin": "*"}, body: JSON.stringify(now)}));
  const user = await signUp(page);
  // saved from the shared link a while ago (before this notice existed: no fromSig), with a mark already put
  const items = OLD.map((it, i) => Object.assign({}, it, {id: "s" + i, grade: i === 0 ? 7 : null}));
  await putLocal(page, user, "clarea-notas-PJ6", {items, pass: 5, from: ID, t: Date.now()});
  return {user, serve: s => { now = s; }};
}

test("hoja compartida: sin cambios no avisa; si cambia, avisa y se cambia sin perder la nota", async ({ page }) => {
  const {user, serve} = await setup(page, snap(OLD));
  await go(page, "asig/PJ6/notas");
  await expect(page.locator(".grrow").first()).toBeVisible();
  // the first look takes what there is as the start: no notice
  await expect.poll(async () => (await getLocal(page, user, "clarea-notas-PJ6")).fromSig || "").not.toBe("");
  await expect(page.getByText("Hay una versión nueva")).toHaveCount(0);

  // the classmate changes it (a new look: reload, so the 30-minute wait starts again)
  serve(snap(NEW));
  await page.reload(); await go(page, "asig/PJ6/notas");
  const box = page.locator(".gask", {hasText: "Hay una versión nueva de la hoja de PJ6"});
  await expect(box).toBeVisible();
  await expect(box).toContainText("La ha cambiado ana · cambian 3 actividades · tus notas se quedan");
  expect(await axe(page, "notas: hoja nueva")).toEqual([]);
  await box.getByRole("button", {name: "Cambiar a la nueva"}).click();
  await expect(box).toHaveCount(0);
  const g = await getLocal(page, user, "clarea-notas-PJ6");
  expect(g.items.map(i => i.pct)).toEqual([30, 50, 20]);
  expect(g.items[0].grade).toBe(7);
  expect(g.from).toBe(ID);
  await expect(page.locator('[data-gr="0"]')).toHaveValue("7");
});

test("hoja compartida: «Ahora no» no vuelve a avisar de esa versión", async ({ page }) => {
  const {user, serve} = await setup(page, snap(OLD));
  await go(page, "notas");
  await expect.poll(async () => (await getLocal(page, user, "clarea-notas-PJ6")).fromSig || "").not.toBe("");
  serve(snap(NEW));
  await page.reload(); await go(page, "notas");
  const box = page.locator(".gask", {hasText: "Hay una versión nueva"});
  await expect(box).toBeVisible();
  expect(await axe(page, "notas: lista con hoja nueva")).toEqual([]);
  await box.getByRole("button", {name: "Ahora no"}).click();
  await expect(box).toHaveCount(0);
  await page.reload(); await go(page, "asig/PJ6/notas");
  await expect(page.locator(".grrow").first()).toBeVisible();
  await page.waitForTimeout(800);
  await expect(page.getByText("Hay una versión nueva")).toHaveCount(0);
  expect((await getLocal(page, user, "clarea-notas-PJ6")).items.map(i => i.pct)).toEqual([40, 60]);
});
