import { defineConfig, devices } from "@playwright/test";
import { loadEnvConfig } from "@next/env";

loadEnvConfig(process.cwd());
const testDb = process.env.DATABASE_URL_TEST;
if (!testDb) throw new Error("Set DATABASE_URL_TEST in .env.local before running E2E tests.");

export default defineConfig({
  testDir: "tests/e2e",
  fullyParallel: false,
  workers: 1,
  timeout: 60_000,
  globalSetup: "./tests/e2e/global-setup.ts",
  use: { baseURL: "http://localhost:3200", trace: "retain-on-failure" },
  projects: [{ name: "mobile", use: { ...devices["Pixel 7"] } }],
  webServer: {
    command: "npm run dev:e2e",
    url: "http://localhost:3200",
    reuseExistingServer: !process.env.CI,
    timeout: 180_000,
    env: {
      DATABASE_URL: testDb,
      WAYPOINT_FAKES: "1",
      WAYPOINT_SYNC_BACKGROUND: "1",
      SESSION_SECRET: "e2e-secret",
      APP_URL: "http://localhost:3200",
      NEXT_PUBLIC_VAPID_PUBLIC_KEY: "",
      NEXT_PUBLIC_SW_DEV: "1",
    },
  },
});
