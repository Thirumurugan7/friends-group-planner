import { execSync } from "node:child_process";

export default function setup() {
  const url = process.env.DATABASE_URL ?? "";
  let parsed: URL;
  try {
    parsed = new URL(url);
  } catch {
    throw new Error("Test DATABASE_URL is not a valid URL; refusing to reset.");
  }
  const db = parsed.pathname.replace(/^\//, "");
  if (!["localhost", "127.0.0.1"].includes(parsed.hostname) || db !== "waypoint_test") {
    throw new Error(
      `Refusing to reset ${parsed.hostname}/${db}: tests only run against local waypoint_test.`
    );
  }
  const env = { ...process.env, DATABASE_URL: url };
  // Drop + recreate the schema, then apply migrations (avoids `migrate reset`).
  execSync(`npx prisma db execute --url "${url}" --stdin`, {
    input: "DROP SCHEMA public CASCADE; CREATE SCHEMA public;",
    stdio: ["pipe", "inherit", "inherit"],
    env,
  });
  execSync("npx prisma migrate deploy", { stdio: "inherit", env });
}
