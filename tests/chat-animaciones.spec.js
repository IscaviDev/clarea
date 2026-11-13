// The chat with animations ON, as on a real phone (the other tests run with reduced motion).
// 1.6.2 broke here: the page's entry animation (transform) held the fixed chat, so it floated with a gap and the box to write was off screen.
const { test, expect } = require("@playwright/test");
const AxeBuilder = require("@axe-core/playwright").default;

const PASS = "prueba123";
async function signUp(page){
  await page.addInitScript(() => { try { localStorage.setItem("clarea-dev-api", "http://127.0.0.1:9299"); } catch(e){} });
  await page.goto("/index.html");
  const user = "t" + Math.random().toString(36).slice(2, 10), f = page.locator(".authwrap form");
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
  await page.locator("[data-wskip]").click();
  await expect(page.locator(".hello h1")).toContainText(user);
  return user;
}
// the chat fills the screen between Clarea's header and the tabs, with no gaps: header · chat's top · messages · box to write · tabs
async function chatLayout(page){
  return page.evaluate(() => { const r = q => document.querySelector(q).getBoundingClientRect();
    return {hdr: r(".cbar"), top: r(".chhead"), log: r("#chatlog"), comp: r("#chf"), tabs: r(".tabbar"), vh: innerHeight, scrollY: scrollY}; });
}
function expectNoGaps(L, label){
  const near = (a, b, what) => expect(Math.abs(a - b), label + ": " + what + " (" + a + " / " + b + ")").toBeLessThan(2);
  near(L.hdr.top, 0, "la cabecera arriba del todo");
  near(L.top.top, L.hdr.bottom, "la barra del chat justo debajo de la cabecera");
  near(L.log.top, L.top.bottom, "los mensajes justo debajo");
  near(L.comp.top, L.log.bottom, "la caja de escribir justo debajo de los mensajes");
  near(L.comp.bottom, L.tabs.top, "la caja de escribir justo encima de las pestañas");
  near(L.tabs.bottom, L.vh, "las pestañas abajo del todo");
  expect(L.scrollY, label + ": la página no se desplaza").toBe(0);
}
async function axe(page, name){
  const out = [];
  for (const scheme of ["light", "dark"]){
    await page.emulateMedia({ colorScheme: scheme }); await page.waitForTimeout(150);
    const r = await new AxeBuilder({ page }).withTags(["wcag2a", "wcag2aa", "wcag21a", "wcag21aa"]).analyze();
    const bad = r.violations.filter(v => v.impact === "serious" || v.impact === "critical");
    if (bad.length) console.log("\n[a11y] " + name + " (" + scheme + "):\n" + bad.map(v => "  - " + v.id + ": " + v.help + "\n      " + v.nodes.slice(0, 3).map(n => n.target.join(" ")).join("\n      ")).join("\n"));
    out.push(...bad);
  }
  await page.emulateMedia({ colorScheme: "light" });
  return out;
}


test.use({ reducedMotion: "no-preference" });

for (const kind of ["amigo", "grupo"]) {
  test("chat de " + kind + " con animaciones: sin huecos, caja de escribir a la vista y aviso si está vacío", async ({ page }) => {
    await page.addInitScript(() => { Object.defineProperty(window, "clareaIdToken", {get: () => async () => "test-token", set(){}, configurable: true}); });
    const user = await signUp(page);
    const G = {id: "g1", name: "Los chavales", color: "#7b5ea7", owner: "u0", mine: true, muted: false, members: [{uid: "u0", u: user}, {uid: "u1", u: "gerard"}], events: [], tasks: []};
    await page.route("**/social", async route => {
      const b = JSON.parse(route.request().postData() || "{}");
      let out = {u: user, code: "TEST-4F2K", mute: false, friends: [{uid: "u1", u: "gerard"}], inReq: [], outReq: [], groups: [G]};
      if (b.op === "chat-unread") out = {unread: {}, last: {}};
      if (b.op === "chat-list") out = {msgs: []};
      await route.fulfill({ status: 200, contentType: "application/json", headers: {"Access-Control-Allow-Origin": "*"}, body: JSON.stringify(out) });
    });
    await page.evaluate(async () => { await socCall("me"); });
    await page.evaluate(k => window.clareaGo(k === "amigo" ? "chat/u1" : "grupos/g1"), kind);
    const skip = page.locator("[data-wskip]"); if (await skip.isVisible()) await skip.click();
    // right away (while the page would still be animating) and once it has settled
    await expect(page.locator("#chf")).toBeVisible();
    expectNoGaps(await chatLayout(page), kind + " al entrar");
    await page.waitForTimeout(600);
    expectNoGaps(await chatLayout(page), kind + " al acabar la animación");
    await expect(page.locator('#chf [name="m"]')).toHaveAttribute("placeholder", "Escribe un mensaje…");
    await expect(page.locator(".chfirst")).toContainText("Aún no hay mensajes");
    await expect(page.locator(".chfirst .chnote")).toContainText(kind === "amigo" ? "Solo lo veis gerard y tú." : "Solo lo veis los del grupo.");
    expect(await axe(page, "chat vacío de " + kind)).toEqual([]);
  });
}
