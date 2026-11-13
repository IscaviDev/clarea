// Clarea's automated checks: run them before each release with `npx playwright test` (in this folder).
// They build nothing: they test the site already built in C:\Users\32icv\clarea-web (python build_clarea.py first).
const fs = require("fs"), path = require("path");
const { defineConfig, devices } = require("@playwright/test");
// CLAREA_PORT (and CLAREA_ROOT for serve.py): test another build on another port, for sessions working in parallel.
// 8156 by default: 8150 was often taken by other servers, and Playwright reuses whatever answers there.
const PORT = process.env.CLAREA_PORT || 8156;
// the Clarea server (push-worker), on this computer only: on GitHub it isn't there, and the tests that need it are skipped.
// Its own port and storage (CLAREA_WORKER to use another one): never the 8787 you use with wrangler dev.
const WORKER = process.env.CLAREA_WORKER || "http://127.0.0.1:8797", WPORT = new URL(WORKER).port;
const WORKER_DIR = path.join(__dirname, "..", "push-worker");
const worker = fs.existsSync(path.join(WORKER_DIR, "wrangler.toml"))
  ? [{ command: "npx wrangler dev --local --port " + WPORT + " --persist-to " + JSON.stringify(path.join(__dirname, ".wrangler-pruebas")), cwd: WORKER_DIR, url: WORKER + "/", reuseExistingServer: true, timeout: 120000 }]
  : [];
module.exports = defineConfig({
  testDir: ".",
  timeout: 60000,
  retries: 0,
  workers: 2,
  reporter: [["list"]],
  use: { baseURL: "http://127.0.0.1:" + PORT, ...devices["iPhone 13"], browserName: "chromium", reducedMotion: "reduce", locale: "es-ES", timezoneId: "Europe/Madrid" },
  webServer: [
    { command: "python serve.py " + PORT, url: "http://127.0.0.1:" + PORT + "/index.html", reuseExistingServer: true },
    { command: "python fbmock.py 9299", port: 9299, reuseExistingServer: true },   // local stand-in for Firebase: no real accounts are created
    ...worker
  ]
});
