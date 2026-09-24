import { defineConfig } from "@playwright/test";

// The standalone application in stand-in mode (`/?stand-in`), served by the package's own Vite dev
// server: the scripted stand-in answers every platform and Agent runtime request, so the chat runs
// in a real browser without a platform or a token. The port is not the development server's (5183).
const port = 5190;

export default defineConfig({
  testDir: "./tests/browser",
  testMatch: "**/*.pw.ts",
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    browserName: "chromium",
    headless: true,
  },
  webServer: {
    command: `vite --host 127.0.0.1 --port ${port} --strictPort`,
    url: `http://127.0.0.1:${port}/`,
    reuseExistingServer: false,
    timeout: 60_000,
  },
});
