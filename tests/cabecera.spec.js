// Regla de diseño: la cabecera de Clarea y las cinco pestañas de abajo se ven SIEMPRE,
// en cada página y con cualquier capa abierta (buscador, selectores, ventanas, chat…).
const { test, expect } = require("@playwright/test");
const { signUp, go, putLocal, useWorker, workerUp } = require("./helpers");

test.use({ viewport: { width: 375, height: 812 } });

// both are on screen and nothing is on top of them
async function headerAndTabs(page, where){
  const header = page.locator("header .clogo").first(), tabs = page.locator(".tabbar");
  await expect(header, where + ": la cabecera").toBeVisible();
  await expect(tabs, where + ": las pestañas").toBeVisible();
  await expect(tabs.locator("a, button")).toHaveCount(5);
  const free = await page.evaluate(() => {
    const on = (sel, el) => { const r = el.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2); return !!hit && !!hit.closest(sel); };
    const h = document.querySelector("header .clogo"), t = document.querySelector(".tabbar");
    const r = t.getBoundingClientRect(), hit = document.elementFromPoint(r.left + r.width / 2, r.top + r.height / 2);
    return {dbg: on(".tabbar", t) ? "" : (hit ? hit.outerHTML.slice(0, 200) : "nada") + JSON.stringify([r.left, r.width, r.top, r.bottom, innerWidth, innerHeight]), header: on("header", h), tabs: on(".tabbar", t), tabsInView: t.getBoundingClientRect().bottom <= innerHeight + 1 && t.getBoundingClientRect().top >= 0, headerInView: h.getBoundingClientRect().top >= 0 && h.getBoundingClientRect().bottom <= innerHeight};
  });
  const { dbg, ...rest } = free;
  expect(rest, where + (dbg ? " · encima: " + dbg : "")).toEqual({header: true, tabs: true, tabsInView: true, headerInView: true});
}

test("cabecera y pestañas: en todas las páginas y con las capas abiertas", async ({ page }) => {
  const user = await signUp(page);
  for (const r of ["", "estudiar", "agenda", "agenda/nueva", "calendario", "calendario/nuevo", "horario", "notas", "grupos", "grupos/amigos",
                   "yo", "yo/galeria", "yo/sincronizar", "yo/segundo-plano", "yo/contrasena", "yo/eliminar", "configuracion", "novedades"]){
    await go(page, r); await page.waitForTimeout(150);
    await headerAndTabs(page, "#/" + r);
  }
  // long pages, scrolled to the bottom
  await go(page, "estudiar"); await page.evaluate(() => scrollTo(0, document.body.scrollHeight)); await page.waitForTimeout(150);
  await headerAndTabs(page, "Estudiar, abajo del todo");

  // the search
  await go(page, "");
  await page.locator("[data-search]").first().click();
  await expect(page.locator(".srch")).toBeVisible();
  await headerAndTabs(page, "con el buscador abierto");
  // tapping a tab closes it and goes there
  await page.locator('.tabbar [data-tab="agenda"]').click();
  await expect(page).toHaveURL(/\/agenda$/);
  await expect(page.locator(".srch")).toHaveCount(0);

  // a picker (a window to choose something)
  await go(page, "calendario/nuevo");
  await page.locator('[data-pick="type"]').click();
  await expect(page.locator(".pkw")).toBeVisible();
  await headerAndTabs(page, "con un selector abierto");
  await page.keyboard.press("Escape");

  // Proyectos, Preguntas, Privacidad: their own pages, the same header and tabs
  await putLocal(page, user, "clarea-qsets", {t: Date.now(), list: [{id: "qcab", subj: "SM7", subjName: "", name: "Prueba", lang: "es", created: Date.now(), qs: [{n: 1, q: "¿Qué es REST?"}]}]});
  await page.evaluate(u => { const P = "u/" + u + "/", now = Date.now();
    localStorage.setItem(P + "clarea-projs", JSON.stringify({t: now, list: [{id: "tcab", subj: "PJ6", name: "Proyecto", desc: "", files: 1, lines: 2, created: now}]}));
    localStorage.setItem(P + "clarea-pcode-tcab", JSON.stringify({t: now, files: {"index.php": "<?php\necho 1;\n"}})); }, user);
  for (const url of ["/proyecto.html?id=tcab", "/preguntas.html?id=qcab", "/privacidad.html"]){
    await page.goto(url); await page.waitForTimeout(400);
    await headerAndTabs(page, url);
  }
  await expect(page.locator('.tabbar [data-tab="yo"]')).toHaveAttribute("aria-current", "page");
});

test("cabecera y pestañas: también en el chat de un grupo", async ({ browser }) => {
  test.skip(!(await workerUp()), "sin el servidor local (wrangler dev en el puerto 8797)");
  const ctx = await browser.newContext(Object.assign({}, test.info().project.use, { viewport: { width: 375, height: 812 } }));
  const A = await ctx.newPage(); await useWorker(A);
  await signUp(A);
  await A.evaluate(() => socCall("group-create", {name: "Solo yo", members: []}));
  const gid = (await A.evaluate(() => socCall("me", {}))).groups[0].id;
  await go(A, "grupos/" + gid);
  await expect(A.locator(".chhead")).toBeVisible();
  await headerAndTabs(A, "chat del grupo");
  // its own bar goes under the header, and the box to write above the tabs
  const pos = await A.evaluate(() => ({hdr: document.querySelector(".cbar").getBoundingClientRect().bottom, chh: document.querySelector(".chhead").getBoundingClientRect().top,
    tabs: document.querySelector(".tabbar").getBoundingClientRect().top, comp: document.querySelector(".chcomp").getBoundingClientRect().bottom}));
  expect(Math.abs(pos.chh - pos.hdr)).toBeLessThan(2);
  expect(Math.abs(pos.tabs - pos.comp)).toBeLessThan(2);
  await ctx.close();
});
