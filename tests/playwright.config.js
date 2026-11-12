// Clarea's automated checks: run them before each release with `npx playwright test` (in this folder).
// They build nothing: they test the site already built in C:\Users\32icv\clarea-web (python build_clarea.py first).
const { defineConfig, devices } = require("@playwright/test");
// CLAREA_PORT (and CLAREA_ROOT for serve.py): test another build on another port, for sessions working in parallel
const PORT = process.env.CLAREA_PORT || 8150;
module.exports = defineConfig({
  testDir: ".",
  timeout: 60000,
  retries: 0,
  workers: 2,
  reporter: [["list"]],
  use: { baseURL: "http://127.0.0.1:" + PORT, ...devices["iPhone 13"], browserName: "chromium", reducedMotion: "reduce", locale: "es-ES", timezoneId: "Europe/Madrid" },
  webServer: [
    { command: "python serve.py " + PORT, url: "http://127.0.0.1:" + PORT + "/index.html", reuseExistingServer: true },
    { command: "python fbmock.py 9299", port: 9299, reuseExistingServer: true }   // local stand-in for Firebase: no real accounts are created
  ]
});
