// «Falté a esta clase» (with undo, never counted twice) and the «Horario y faltas» block on each subject's page.
const { test, expect } = require("@playwright/test");
const { signUp, go, getLocal, putLocal, axe } = require("./helpers");

const SHOTS = process.env.CLAREA_SHOTS;   // folder for the phone screenshots (optional)
const shot = async (page, name) => { if (SHOTS) await page.screenshot({ path: SHOTS + "/" + name + ".png" }); };

test("Falté a esta clase: suma las horas, se ve en Inicio y se puede deshacer", async ({ page }) => {
  const user = await signUp(page);
  await go(page, "#/horario");
  // SM8 (Desp. web) is on Monday, 1 h, and only once a week in DAW-2A
  await page.locator('.tt .cl:has(b:text-is("SM8"))').click();
  const sheet = page.locator(".sheet");
  const miss = sheet.locator("[data-smiss='1']");
  await expect(miss).toContainText("Falté");
  await expect(miss).toContainText("(1 h)");
  await shot(page, "1-hoja-clase");
  await miss.click();
  await expect(page.locator(".toast.undo")).toContainText("Falta apuntada: 1 h en SM8");
  await shot(page, "2-deshacer");
  expect((await getLocal(page, user, "clarea-faltas")).rows.SM8.f).toBe(1);

  // the same class again: it is already counted, so it offers to take it back instead of adding it twice
  await page.locator('.tt .cl:has(b:text-is("SM8"))').click();
  await expect(sheet.locator(".smiss")).toContainText("Ya apuntaste");
  await expect(sheet.locator("[data-smiss='0']")).toBeVisible();
  await sheet.locator("[data-close]").click();
  await expect(page.locator(".sheetbg")).toHaveCount(0);

  // undo from the notice: back to 0 h
  await page.locator('.tt .cl:has(b:text-is("SM8"))').click();
  await sheet.locator("[data-smiss='0']").click();
  await page.locator(".toast.undo button").click();
  expect((await getLocal(page, user, "clarea-faltas")).rows.SM8.f).toBe(1);   // undoing «quitar» puts it back
  await page.locator('.tt .cl:has(b:text-is("SM8"))').click();
  await sheet.locator("[data-smiss='0']").click();
  expect((await getLocal(page, user, "clarea-faltas")).rows.SM8.f).toBe(0);

  // Inicio: today's class you missed says so (only on a weekday with classes)
  await go(page, "#/");
  const first = page.locator(".tdi[data-cls]").first();
  if (await first.count()){
    await first.click();
    await page.locator(".sheet [data-smiss='1']").click();
    await expect(page.locator(".tdi.miss").first()).toContainText("Faltaste");
    await shot(page, "3-inicio-faltaste");
  }
});

test("Página de la asignatura: horario y faltas plegados", async ({ page }) => {
  await signUp(page);
  await go(page, "#/asig/SM6");
  const box = page.locator("details.swhen");
  await expect(box).not.toHaveAttribute("open", "");
  await expect(box.locator("summary")).toContainText("Horario y faltas");
  await expect(box.locator("summary")).toContainText("4 h a la semana");   // SM6 in DAW-2A: Tue, Wed, Thu and Fri
  await shot(page, "4-asignatura-plegado");
  await box.locator("summary").click();
  await expect(box.locator(".swl li")).toHaveCount(4);
  await expect(box.locator(".swf")).toContainText("te quedan");
  await shot(page, "5-asignatura-abierto");
  if (SHOTS){ await page.emulateMedia({ colorScheme: "dark" }); await shot(page, "6-asignatura-oscuro"); await page.emulateMedia({ colorScheme: "light" }); }
  expect(await axe(page, "asignatura con horario y faltas")).toEqual([]);
  // a class in the list opens the same sheet as the timetable
  await box.locator(".swl button").first().click();
  await expect(page.locator(".sheet [data-smiss='1']")).toBeVisible();
});

test("Historial de faltas, aviso cerca del límite y faltas en el Horario", async ({ page }) => {
  const user = await signUp(page);
  // SM8: 28 h in total, 5,6 h allowed; with 4 h it is still «OK» (the warning starts at 4,2 h)
  await putLocal(page, user, "clarea-faltas", {t: Date.now(), rows: {SM8: {tot: 28, f: 4}}});
  await go(page, "#/horario");
  const sm8 = page.locator('.tt .cl:has(b:text-is("SM8"))');
  await sm8.click();
  await page.locator(".sheet [data-smiss='1']").click();
  await expect(page.locator(".toast.undo")).toContainText("Ojo: te quedan 0,6 h en SM8");
  await shot(page, "7-aviso-limite");
  // the timetable: SM8 is on Monday, so this week's class says «Faltaste»
  await expect(sm8).toHaveClass(/miss/);
  await expect(sm8).toContainText("Faltaste");
  await shot(page, "8-horario-faltaste");

  // «Faltas»: the day is in the subject's history, and can be taken back (and undone)
  await go(page, "#/faltas");
  const row = page.locator('[data-f="SM8"]');
  await row.locator("summary").click();
  await expect(row.locator(".fhist li")).toHaveCount(1);
  await expect(row.locator(".fhist li")).toContainText("lunes");
  if (SHOTS){ await page.evaluate(() => document.querySelectorAll(".toast").forEach(t => t.remove())); await row.locator(".fhist").scrollIntoViewIfNeeded(); await shot(page, "9-historial"); }
  expect(await axe(page, "faltas con historial")).toEqual([]);
  await row.locator("[data-funmiss]").click();
  expect((await getLocal(page, user, "clarea-faltas")).rows.SM8.f).toBe(4);
  await expect(page.locator('[data-f="SM8"]')).toHaveAttribute("open", "");
  await expect(page.locator('[data-f="SM8"] .fhist')).toHaveCount(0);
  await page.locator(".toast.undo button").click();
  expect((await getLocal(page, user, "clarea-faltas")).rows.SM8.f).toBe(5);
  await expect(page.locator('[data-f="SM8"] .fhist li')).toHaveCount(1);
});

test("Ahora y siguiente clase, «Llegué tarde» y el aviso «¿Faltaste hoy?»", async ({ page }) => {
  // Monday 16 November 2026 at 16:00 in Madrid: SM8 (15:55–16:50) is on, PJ9 comes next
  await page.clock.setFixedTime(new Date("2026-11-16T16:00:00+01:00"));
  const user = await signUp(page);
  const now = page.locator(".tdnow");
  await expect(now).toContainText("Ahora: SM8");
  await expect(now).toContainText("hasta las 16:50");
  await expect(now).toContainText("luego PJ9");

  // «Llegué tarde»: half an hour, marked «Tarde», and it can be undone
  await now.click();
  await expect(page.locator(".sheet [data-smiss='late']")).toContainText("Llegué tarde (0,5 h)");
  await shot(page, "11-hoja-tarde");
  await page.locator(".sheet [data-smiss='late']").click();
  await expect(page.locator(".toast.undo")).toContainText("Retraso apuntado: 0,5 h en SM8");
  expect((await getLocal(page, user, "clarea-faltas")).rows.SM8.f).toBe(0.5);
  await expect(page.locator(".tdi.miss")).toContainText("Tarde");
  await page.locator(".toast.undo button").click();
  expect((await getLocal(page, user, "clarea-faltas")).rows.SM8.f).toBe(0);
  await expect(page.locator(".tdi.miss")).toHaveCount(0);
  if (SHOTS){ await page.evaluate(() => document.querySelectorAll(".toast").forEach(t => t.remove())); await shot(page, "10-ahora-siguiente"); }

  // the reminder: 10 minutes after the last class of the day (Monday ends at 21:00), and it can be turned off
  const rem = () => page.evaluate(() => window.clareaPushReminders().filter(r => r.id.startsWith("falta|")).map(r => [r.id, new Date(r.at).toISOString(), r.title]));
  const list = await rem();
  expect(list[0]).toEqual(["falta|2026-11-16", "2026-11-16T20:10:00.000Z", "¿Faltaste a alguna clase hoy?"]);
  expect(list.length).toBe(10);   // the school days of the next two weeks
  await go(page, "configuracion");
  const sw = page.locator("[data-cfgfrem]");
  await expect(sw).toHaveAttribute("aria-checked", "true");
  await sw.click();
  await expect(page.locator("[data-cfgfrem]")).toHaveAttribute("aria-checked", "false");
  expect(await rem()).toEqual([]);
});

test("Días sin clase: se guardan desde el Horario y ese día no hay clases, aviso ni faltas", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-16T16:00:00+01:00"));   // Monday, during SM8
  const user = await signUp(page);
  await go(page, "horario");
  const box = page.locator(".ncbox");
  await box.locator("summary").click();
  await box.locator("[data-ncadd]").click();
  await page.locator('.pkp [data-pd="2026-11-16"]').first().click();      // today
  await page.locator(".pkp [data-nc1]").click();                           // only that day
  await expect(box.locator(".nclist li")).toBeVisible();   // the list stays open after saving
  await expect(box.locator(".nclist li")).toContainText("lun 16 nov");
  expect((await getLocal(page, user, "clarea-noclass")).list).toEqual([{from: "2026-11-16", to: "2026-11-16"}]);
  // this week's Monday classes say «Sin clase», and their sheet doesn't take absences
  const sm8 = page.locator('.tt .cl:has(b:text-is("SM8"))');
  await expect(sm8).toHaveClass(/nc/);
  await expect(sm8).toContainText("Sin clase");
  await expect(sm8).not.toHaveClass(/now/);
  await expect(page.locator(".pkw")).toHaveCount(0);
  if (SHOTS){ await page.evaluate(() => document.querySelectorAll(".toast").forEach(t => t.remove())); await shot(page, "12-dias-sin-clase"); }
  expect(await axe(page, "horario con días sin clase")).toEqual([]);
  await sm8.click();
  await expect(page.locator(".sheet .smiss")).toContainText("Hoy no hay clase");
  await expect(page.locator(".sheet [data-smiss]")).toHaveCount(0);
  await page.locator(".sheet [data-close]").click();
  // Inicio: nothing today, and no «¿Faltaste hoy?» for that day
  await go(page, "#/");
  await expect(page.locator(".tdempty")).toContainText("Hoy no hay clase");
  await expect(page.locator(".tdnow")).toHaveCount(0);
  const ids = await page.evaluate(() => window.clareaPushReminders().map(r => r.id).filter(i => i.startsWith("falta|")));
  expect(ids).not.toContain("falta|2026-11-16");
  expect(ids).toContain("falta|2026-11-17");
  // it can be taken back (and undone)
  await go(page, "horario");
  await page.locator(".ncbox summary").click();
  await page.locator("[data-ncdel]").click();
  expect((await getLocal(page, user, "clarea-noclass")).list).toEqual([]);
  await page.locator(".toast.undo button").click();
  expect((await getLocal(page, user, "clarea-noclass")).list).toHaveLength(1);
});

test("Resumen de faltas en el aviso del domingo", async ({ page }) => {
  await page.clock.setFixedTime(new Date("2026-11-19T10:00:00+01:00"));   // Thursday
  const user = await signUp(page);
  // Monday's SM8 (1 h) noted as missed; SM8 had 4 h already, so it is close to its limit (5,6 h)
  await putLocal(page, user, "clarea-faltas", {t: Date.now(), rows: {SM8: {tot: 28, f: 5}}, log: {"2026-11-16|0-1-SM8": {c: "SM8", h: 1}}});
  const sunday = () => page.evaluate(() => window.clareaPushReminders().filter(r => /^(wk|fs)\|2026-11-22/.test(r.id)).map(r => [r.id, r.title, r.body]));
  // no exams next week: a notice of its own
  expect(await sunday()).toEqual([["fs|2026-11-22", "Tus faltas de esta semana", "Faltas esta semana: 1 h · en SM8 te quedan 0,6 h."]]);
  // with an exam next week: one more line in the week's notice
  await putLocal(page, user, "clarea-events", {t: Date.now(), list: [{id: "x", type: "teorico", name: "Examen de SM7", subj: "SM7", date: "2026-11-24", from: "16:50", to: "17:45", group: "DAW-2A"}]});
  const r = await sunday();
  expect(r).toHaveLength(1);
  expect(r[0][0]).toBe("wk|2026-11-22");
  expect(r[0][2]).toContain(". Faltas esta semana: 1 h · en SM8 te quedan 0,6 h.");
});
