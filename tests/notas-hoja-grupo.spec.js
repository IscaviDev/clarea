// Notas: send the assessment sheet to a group of Amigos. It goes to the group's chat as a card to save it.
const { test, expect } = require("@playwright/test");
const { signUp, go, putLocal, getLocal, axe } = require("./helpers");

const sheet = () => ({pass: 5, t: Date.now(), items: [
  {id: "a1", code: "A1", name: "Examen de teoría", pct: 40, kind: "examen", grade: 7},
  {id: "a2", code: "A2", name: "Memoria del proyecto", pct: 60, kind: "proyecto", grade: null}]});

test("compartir: enviar la hoja al chat de un grupo (crea el enlace si hace falta, sin tus notas)", async ({ page }) => {
  let posted = null;
  await page.route("**/share", r => { posted = JSON.parse(r.request().postData()); r.fulfill({status: 200, contentType: "application/json", headers: {"access-control-allow-origin": "*"}, body: JSON.stringify({ok: true, id: "abcdefghijkl", del: "d".repeat(24)})}); });
  const user = await signUp(page);
  await putLocal(page, user, "clarea-notas-PJ6", sheet());
  await putLocal(page, user, "clarea-social", {me: {u: user}, groups: [{id: "g1", name: "Los de PJ6", color: "#5b8def", members: []}]});
  await page.evaluate(() => { window.__sent = []; window.socCall = async (op, b) => { window.__sent.push([op, b]); return {msg: {}}; }; });
  await go(page, "asig/PJ6/notas");
  await page.locator("[data-grshare]").click();
  const p = page.locator(".pkp");
  await expect(p).toContainText("Enviar a tu grupo");
  expect(await axe(page, "compartir con tu grupo")).toEqual([]);
  await p.locator('[data-gsh="grp"][data-gid="g1"]').click();
  await expect(p).toContainText("Enviada al chat de «Los de PJ6»");
  const sent = (await page.evaluate(() => window.__sent)).filter(x => x[0] === "chat-send");
  expect(sent[0][0]).toBe("chat-send");
  expect(sent[0][1].gid).toBe("g1");
  expect(sent[0][1].text).toContain("Cómo se evalúa PJ6");
  expect(sent[0][1].text).toContain("notas?share=abcdefghijkl");
  expect(posted.snap.ai.items.every(i => i.grade === null)).toBe(true);     // never your marks
  expect((await getLocal(page, user, "clarea-notas-PJ6")).share.id).toBe("abcdefghijkl");
});

test("chat: la hoja compartida sale como tarjeta para guardarla", async ({ page }) => {
  const user = await signUp(page);
  const html = await page.evaluate(() => { CH.loaded = true; CH.msgs = [{id: 1, at: Date.now(), u: "ana", text: "📋 Cómo se evalúa PJ6 (actividades y porcentajes). Guárdala en tus Notas: https://clarea.dev/notas?share=abcdefghijkl"}]; return chatHtml(); });
  expect(html).toContain("chsheet");
  expect(html).toContain("Cómo se evalúa PJ6");
  expect(html).toContain('href="notas?share=abcdefghijkl"');
  expect(html).toContain("Guardar en mis Notas");
  expect(html).not.toContain("https://clarea.dev/notas");
});
