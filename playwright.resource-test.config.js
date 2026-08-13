import { defineConfig, devices } from "@playwright/test";

const port = 4191;

export default defineConfig({
  testDir: "./tests/resource-course",
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  projects: [{ name: "mobile-chromium", use: { ...devices["Pixel 7"] } }],
  use: {
    baseURL: `http://127.0.0.1:${port}`,
    trace: "retain-on-failure"
  },
  webServer: {
    command: "node ./scripts/servePublic.js",
    url: `http://127.0.0.1:${port}/tests/gallery/resource-test-course.html`,
    env: {
      PORT: String(port),
      ARALEARN_SUPABASE_URL: "https://project.supabase.test",
      ARALEARN_SUPABASE_PUBLISHABLE_KEY: "sb_publishable_resource_test"
    },
    reuseExistingServer: false
  }
});
