import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  projects: [
    {
      name: "android-chromium",
      use: {
        ...devices["Pixel 7"]
      }
    }
  ],
  use: {
    baseURL: "http://127.0.0.1:4182",
    trace: "retain-on-failure"
  },
  webServer: {
    command: "node ./scripts/servePublic.js --root .pages",
    url: "http://127.0.0.1:4182",
    reuseExistingServer: false
  }
});
