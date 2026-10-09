import { defineConfig, loadEnv } from "vite";
import tsconfigPaths from "vite-tsconfig-paths";

const env = loadEnv("development", process.cwd(), "");

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    environment: "node",
    include: ["tests/live/**/*.test.ts"],
    testTimeout: 30_000,
    env: {
      GOOGLE_MAPS_API_KEY: env.GOOGLE_MAPS_API_KEY ?? "",
      TMDB_API_KEY: env.TMDB_API_KEY ?? "",
      GROQ_API_KEY: env.GROQ_API_KEY ?? "",
    },
  },
});
