// Clarea's automated checks: run them before each release with `npx playwright test` (in this folder).
// They build nothing: they test the site already built in C:\Users\32icv\clarea-web (python build_clarea.py first).
const { defineConfig, devices } = require("@playwright/test");
module.exports = defineConfig({
  testDir: ".",
  timeout: 60000,
  retries: 0,
  workers: 2,
  reporter: [["list"]],
  use: { baseURL: "http://127.0.0.1:8150", ...devices["iPhone 13"], browserName: "chromium", reducedMotion: "reduce", locale: "es-ES", timezoneId: "Europe/Madrid" },
  webServer: [
    { command: "python serve.py 8150", url: "http://127.0.0.1:8150/index.html", reuseExistingServer: true },
    { command: "python fbmock.py 9299", port: 9299, reuseExistingServer: true }   // local stand-in for Firebase: no real accounts are created
  ]
});
