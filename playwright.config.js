import { defineConfig, devices } from "@playwright/test";

const e2ePort = Number.parseInt(process.env.ARALEARN_E2E_PORT || "4182", 10);
const e2eBaseUrl = `http://127.0.0.1:${e2ePort}`;
const e2eSupabaseUrl =
  process.env.ARALEARN_SUPABASE_URL || "https://project.supabase.test";
const e2eSupabasePublishableKey =
  process.env.ARALEARN_SUPABASE_PUBLISHABLE_KEY || "sb_publishable_e2e";

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
    baseURL: e2eBaseUrl,
    trace: "retain-on-failure"
  },
  webServer: {
    command: "node ./scripts/servePublic.js --root .pages",
    url: e2eBaseUrl,
    env: {
      PORT: String(e2ePort),
      ARALEARN_SUPABASE_URL: e2eSupabaseUrl,
      ARALEARN_SUPABASE_PUBLISHABLE_KEY: e2eSupabasePublishableKey
    },
    reuseExistingServer: process.env.ARALEARN_E2E_REUSE_SERVER === "1"
  }
});
