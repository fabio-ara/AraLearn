import { defineConfig, devices } from "@playwright/test";

const port = 4182;
const baseURL = `http://127.0.0.1:${port}`;
const supabaseUrl = process.env.ARALEARN_SUPABASE_URL || "http://127.0.0.1:54321";
const publishableKey = process.env.ARALEARN_SUPABASE_PUBLISHABLE_KEY || "";

export default defineConfig({
  testDir: "./tests/e2e",
  outputDir: "./test-results/course-authoring-supabase-local",
  fullyParallel: false,
  workers: 1,
  reporter: "line",
  projects: [{
    name: "authoring-supabase-local-chromium",
    use: { ...devices["Desktop Chrome"] }
  }],
  use: {
    baseURL,
    trace: "off"
  },
  webServer: {
    command: "node ./scripts/servePublic.js",
    url: baseURL,
    env: {
      PORT: String(port),
      ARALEARN_SUPABASE_URL: supabaseUrl,
      ARALEARN_SUPABASE_PUBLISHABLE_KEY: publishableKey
    },
    reuseExistingServer: false
  }
});
