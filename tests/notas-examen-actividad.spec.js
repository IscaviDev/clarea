// Notas: an exam or a delivery tied to its activity. In the event you choose it; «¿Qué has sacado?» then only asks for the mark.
const { test, expect } = require("@playwright/test");
const { signUp, go, putLocal, getLocal, ymdIn, axe } = require("./helpers");

const sheet = () => ({pass: 5, t: Date.now(), items: [
  {id: "a1", code: "A1", name: "Examen de teoría", pct: 40, kind: "examen", grade: null},
  {id: "a2", code: "A2", name: "Memoria del proyecto", pct: 60, kind: "proyecto", grade: null}]});

test("evento: eliges su actividad de Notas y queda unido", async ({ page }) => {
  const user = await signUp(page);
  await putLocal(page, user, "clarea-notas-PJ6", sheet());
  await go(page, "calendario/nuevo");
  await expect(page.locator(".ev-actf")).toBeHidden();                 // no subject yet: no field
  await page.locator('[data-pick="subj"]').click();
  await page.locator('.pkp [data-pv="PJ6"]').click();
  const act = page.locator('[data-pick="act"]');
  await expect(act).toContainText("Elige cuál (opcional)");
  expect(await axe(page, "evento con actividad")).toEqual([]);
  await act.click();
  await expect(page.locator(".pkp")).toContainText("¿Qué actividad es?");
  await page.locator('.pkp [data-gact="a2"]').click();
  await expect(act).toContainText("A2 · Memoria del proyecto");
  await page.locator('#evf [type="submit"]').click();
  await expect(page.locator(".toast, [role=status]").filter({hasText: "Guardado"}).first()).toBeVisible();
  const ev = (await getLocal(page, user, "clarea-events")).list[0];
  expect((await getLocal(page, user, "clarea-gradeask")).link[ev.id]).toBe("a2");
  // editing it shows it, and it can be taken off
  await go(page, "calendario/editar/" + ev.id);
  await expect(page.locator('[data-pick="act"]')).toContainText("A2 · Memoria del proyecto");
  await page.locator('[data-pick="act"]').click();
  await page.locator('.pkp [data-gact=""]').click();
  await page.locator('#evf [type="submit"]').click();
  await expect.poll(async () => ((await getLocal(page, user, "clarea-gradeask")).link || {})[ev.id] || "").toBe("");
});

test("«¿Qué has sacado?»: con la actividad unida, solo pones la nota", async ({ page }) => {
  const user = await signUp(page);
  await putLocal(page, user, "clarea-notas-PJ6", sheet());
  await putLocal(page, user, "clarea-events", {t: Date.now(), list: [{id: "x1", type: "teorico", name: "Examen teórico PJ6", subj: "PJ6", date: ymdIn(-2), from: "09:00", to: "10:00", group: "DAW-2A"}]});
  await putLocal(page, user, "clarea-gradeask", {done: {}, later: {}, link: {x1: "a2"}, t: Date.now()});
  await go(page, "calendario");
  await page.evaluate(() => gradeAskOpen("x1"));
  const p = page.locator(".pkp");
  await expect(p).toContainText("Va a «A2 · Memoria del proyecto» (60 %)");
  await expect(p.locator(".gapick")).toBeHidden();
  expect(await axe(page, "qué has sacado, unido")).toEqual([]);
  await p.locator("#gsv").fill("8,5");
  await p.locator("[data-gsave]").click();
  await expect(p).toHaveCount(0);
  const g = await getLocal(page, user, "clarea-notas-PJ6");
  expect(g.items.find(i => i.id === "a2").grade).toBe(8.5);
  expect(g.items.find(i => i.id === "a1").grade).toBe(null);
});

test("«¿Qué has sacado?»: «Cambiar» deja elegir otra actividad", async ({ page }) => {
  const user = await signUp(page);
  await putLocal(page, user, "clarea-notas-PJ6", sheet());
  await putLocal(page, user, "clarea-events", {t: Date.now(), list: [{id: "x1", type: "teorico", name: "Examen teórico PJ6", subj: "PJ6", date: ymdIn(-2), from: "09:00", to: "10:00", group: "DAW-2A"}]});
  await putLocal(page, user, "clarea-gradeask", {done: {}, later: {}, link: {x1: "a2"}, t: Date.now()});
  await go(page, "calendario");
  await page.evaluate(() => gradeAskOpen("x1"));
  const p = page.locator(".pkp");
  await p.locator("[data-gactshow]").click();
  await expect(p.locator(".gapick")).toBeVisible();
  await p.locator('[data-gact="a1"]').click();
  await p.locator("#gsv").fill("6");
  await p.locator("[data-gsave]").click();
  await expect(p).toHaveCount(0);
  const g = await getLocal(page, user, "clarea-notas-PJ6");
  expect(g.items.find(i => i.id === "a1").grade).toBe(6);
  expect((await getLocal(page, user, "clarea-gradeask")).link.x1).toBe("a1");
});
