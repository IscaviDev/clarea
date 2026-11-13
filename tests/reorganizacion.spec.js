// Las 5 pestañas, «Yo» como página, tareas y deberes, y el chat y las fotos de un grupo.
const { test, expect } = require("@playwright/test");
const { signUp, go, putLocal, getLocal, ymdIn, useWorker, workerUp, axe } = require("./helpers");

test("pestañas y «Yo»: una página normal, con «← Yo» al entrar en sus partes", async ({ page }) => {
  await signUp(page);
  await expect(page.locator("[data-tabs] button")).toHaveCount(5);
  await expect(page.locator('[data-tab=""]')).toHaveAttribute("aria-current", "page");
  await expect(page.locator(".umenu, .ubtn")).toHaveCount(0);                          // no profile drop-down any more
  await page.locator('[data-tab="yo"]').click();
  await expect(page).toHaveURL(/\/yo$/);
  await expect(page.locator(".mehead h1")).toBeVisible();
  await expect(page.locator(".mrow small")).toHaveCount(0);                            // rows without subtitles
  expect(await axe(page, "yo")).toEqual([]);
  await page.locator(".mrow", { hasText: "Configuración" }).click();
  await expect(page.locator(".back")).toHaveText("← Yo");
  await expect(page.locator('[data-tab="yo"]')).toHaveAttribute("aria-current", "page");
  await page.locator(".back").click();
  await page.locator(".mrow", { hasText: "En segundo plano" }).click();
  await expect(page.locator(".authwrap")).toHaveCount(0);                              // a page, not a window in the middle
  await expect(page.locator("#mebg .bgcard").first()).toBeVisible();
  await go(page, "yo/eliminar");
  await expect(page.locator(".btndel")).toBeDisabled();
});

test("tareas: apuntar, sale en «Por hacer» y en el calendario, y se marca hecha", async ({ page }) => {
  const user = await signUp(page);
  await page.locator('[data-tab="agenda"]').click();
  await expect(page.locator(".tkempty")).toBeVisible();
  await page.getByRole("button", { name: "+ Tarea" }).click();
  await page.locator('[name="tname"]').fill("Ejercicios del tema 4");
  await page.locator('#tkf button[type="submit"]').click();
  await expect(page.locator("#tkerr")).toHaveText("Elige la asignatura.");
  await page.locator('[data-tkpick="subj"]').click();
  await page.locator('.pkw [data-pv="SM6"]').click();
  await page.locator('[data-tkpick="date"]').click();
  await page.locator(".pkw .pkquick button", { hasText: "Hoy" }).click();
  expect(await axe(page, "nueva tarea")).toEqual([]);
  await page.locator('#tkf button[type="submit"]').click();
  await expect(page).toHaveURL(/\/agenda$/);
  await expect(page.locator(".sect", { hasText: "Hoy" })).toBeVisible();
  await expect(page.locator(".tkr")).toContainText("Ejercicios del tema 4");
  expect(await axe(page, "tareas")).toEqual([]);
  // Inicio: in «Por hacer», ticked from there
  await page.locator('[data-tab=""]').click();
  const row = page.locator(".plan .tkr");
  await expect(row).toContainText("Ejercicios del tema 4");
  await row.locator(".tkck").click();
  await expect.poll(async () => ((await getLocal(page, user, "clarea-tasks")).list[0].done || 0) > 0).toBeTruthy();
  // the calendar marks the day of a pending one
  await putLocal(page, user, "clarea-tasks", {t: Date.now(), list: [{id: "x", name: "Resumen", subj: "SM7", date: ymdIn(0), notes: "", done: null, created: 1}]});
  await go(page, "calendario");
  await expect(page.locator(".calday.today .tkdot")).toBeVisible();
  await expect(page.locator(".calside .tkr")).toContainText("Resumen");
  await expect(page.locator(".seg .on")).toHaveText("Calendario");
});

test("grupo: chat con una foto marcada con su asignatura, y galería por asignatura y tipo", async ({ browser }) => {
  test.skip(!(await workerUp()), "sin el servidor local (wrangler dev en el puerto 8797)");
  const mk = async () => { const ctx = await browser.newContext(test.info().project.use); const p = await ctx.newPage(); await useWorker(p); return p; };
  const A = await mk(), B = await mk();
  const ua = await signUp(A), ub = await signUp(B);
  const soc = (p, op, d) => p.evaluate(([o, x]) => socCall(o, x), [op, d || {}]);
  await soc(B, "me"); await soc(A, "request", {to: ub}); await soc(B, "accept", {uid: "uid-" + ua});
  await soc(A, "group-create", {name: "Los de PJ", members: ["uid-" + ub]});
  const gid = (await soc(A, "me")).groups[0].id;
  await soc(B, "me");
  await go(B, "grupos");
  await B.locator(".grow", { hasText: "Los de PJ" }).click();
  await expect(B.locator(".chfirst")).toBeVisible();                                   // an empty chat: «¡Saluda al grupo!»
  await expect(B.locator("[data-tabs]")).toBeHidden();                                 // the message box takes the bottom
  await B.locator('#chf [name="m"]').fill("¿Tenéis los apuntes de SM6?");
  await B.locator("#chf .chsend").click();
  await expect(B.locator(".chm.me .chtx")).toContainText("¿Tenéis los apuntes de SM6?");
  // A hasn't seen it: a number on «Grupos» and on the group
  await go(A, "grupos"); await A.evaluate(() => chatUnread());
  await expect(A.locator('[data-tab="grupos"] .tbdot')).toHaveText("1");
  await expect(A.locator(".grow .mbad")).toHaveText("1");
  // A sends a photo: Clarea asks the subject and the kind
  const img = await A.evaluate(() => { const k = document.createElement("canvas"); k.width = 40; k.height = 30; k.getContext("2d").fillRect(0, 0, 40, 30); const d = k.toDataURL("image/jpeg", .8).split(",")[1]; return {data: d, thumb: d, w: 40, h: 30}; });
  await soc(A, "chat-send", {gid, img: Object.assign(img, {subj: "SM6", album: "notes"})});
  await expect(B.locator(".chimg .chtag")).toHaveText("SM6 · Apuntes", { timeout: 9000 });       // arrives on its own
  await expect(B.locator(".chimg img")).toHaveAttribute("src", /^blob:/);
  // hold a message (here, right click): answer it
  await B.locator(".chm:not(.me)").last().click({button: "right"});
  await B.locator('.pkw [data-pv="rep"]').click();
  await expect(B.locator(".chrep")).toContainText("Respondes a " + ua);
  await B.locator('#chf [name="m"]').fill("¡Gracias!");
  await B.locator("#chf .chsend").click();
  await expect(B.locator(".chm.me").last().locator(".chq")).toContainText("📷 Foto de SM6");
  await expect(B.locator(".chrep")).toBeHidden();
  expect(await axe(B, "chat")).toEqual([]);
  // …or make it a task of the group, with the subject of the photo
  await B.locator(".chm:not(.me)").last().click({button: "right"});
  await B.locator('.pkw [data-pv="task"]').click();
  await expect(B).toHaveURL(/\/agenda\/nueva$/);
  await expect(B.locator('#tkf [name="tsubj"]')).toHaveValue("SM6");
  await expect(B.locator('#tkf [data-tkw].on')).toHaveText("Los de PJ");
  await B.locator('[name="tname"]').fill("Pasar los apuntes a limpio");
  await B.locator('#tkf button[type="submit"]').click();
  await expect(B.locator(".tkr", { hasText: "Pasar los apuntes a limpio" })).toContainText("Los de PJ");
  await go(A, "grupos/" + gid);
  await expect(A.locator('[data-tab="grupos"] .tbdot')).toHaveCount(0);                 // opened: seen
  await A.evaluate(() => { askPhotoKind(CH.albums); });
  await expect(A.locator(".pkw .pkh b")).toHaveText("¿De qué asignatura es?");
  await expect(A.locator(".pkw [data-pok]")).toBeDisabled();
  await A.locator('.pkw [data-ps="SM7"]').click();
  await expect(A.locator(".pkw [data-pok]")).toBeEnabled();
  await A.keyboard.press("Escape");
  // the gallery: subject → kinds (with a new one) → photos
  await go(B, "grupos/" + gid + "/fotos");
  await expect(B.locator('.galsubs [data-go$="/fotos/SM6"]')).toContainText("1 foto");
  await B.locator('.galsubs [data-go$="/fotos/SM6"]').click();
  await expect(B.locator(".alb", { hasText: "Apuntes" })).toContainText("1 foto");
  await B.locator("[data-albnew]").click();
  await B.locator("#albn").fill("Pizarra");
  await B.locator(".pkw [data-pok]").click();
  await expect(B.locator(".alb", { hasText: "Pizarra" })).toBeVisible();
  expect(await axe(B, "fotos de un grupo")).toEqual([]);
  await soc(A, "gal-add", {gid, img: Object.assign({}, img, {subj: "SM6", album: "notes"})});
  await go(B, "grupos/" + gid); await go(B, "grupos/" + gid + "/fotos/SM6/notes");
  await expect(B.locator(".galgrid button")).toHaveCount(2);
  await B.locator(".galgrid button").first().click();
  await expect(B.locator(".phv .phtag")).toHaveText("SM6 · Apuntes");
  // the next photo of the same kind, without closing
  await expect(B.locator(".phv .phn")).toHaveText("1 de 2");
  await B.locator('.phv [data-phgo="1"]').click();
  await expect(B.locator(".phv .phn")).toHaveText("2 de 2");
  await B.keyboard.press("ArrowLeft");
  await expect(B.locator(".phv .phn")).toHaveText("1 de 2");
  await expect(B.locator(".phv .phdel")).toHaveCount(0);                               // not B's photo, and B didn't make the group
  await B.locator(".phv .phx").click();
  // a group's photo, to your own gallery (in «Yo»)
  await B.locator(".galgrid button").first().click();
  await B.locator(".phv .phmine").click();
  await expect(B.locator(".phv .phmine")).toHaveText("En tu galería ✓");
  await B.locator(".phv .phx").click();
  await go(B, "yo/galeria");
  await expect(B.locator('.galsubs [data-go="#/yo/galeria/SM6"]')).toContainText("1 foto");
  await expect(B.locator('.galsubs [data-go="#/yo/galeria/PJ5"]')).toContainText("Sin fotos");
});
