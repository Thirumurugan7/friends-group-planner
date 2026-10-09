import { defineConfig, loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const env = loadEnv("test", process.cwd(), "");
const testDb = env.DATABASE_URL_TEST ?? "postgresql://localhost:5432/waypoint_test";
if (/neon\.tech|amazonaws|supabase/.test(testDb)) {
  throw new Error("DATABASE_URL_TEST points at a hosted DB; refuse to run tests against it.");
}
// globalSetup runs `prisma migrate reset` in this process: make sure it targets the test DB.
process.env.DATABASE_URL = testDb;

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["tests/**/*.test.ts"],
    exclude: ["tests/e2e/**", "tests/live/**", "node_modules/**"],
    setupFiles: ["tests/setup.ts"],
    globalSetup: ["tests/global-setup.ts"],
    fileParallelism: false,
    env: {
      DATABASE_URL: testDb,
      SESSION_SECRET: "test-secret",
      WAYPOINT_FAKES: "1",
      GROQ_API_KEY: "test",
      TMDB_API_KEY: "test",
      GOOGLE_CLIENT_ID: "test-client",
      GOOGLE_CLIENT_SECRET: "test-secret",
      APP_URL: "http://localhost:3200",
      VAPID_PUBLIC_KEY: "",
      VAPID_PRIVATE_KEY: "",
    },
  },
});
