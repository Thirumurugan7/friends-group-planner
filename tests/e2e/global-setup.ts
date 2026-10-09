import resetTestDb from "../global-setup";

// Same guarded reset as the Vitest suite (local waypoint_test only, no `migrate reset`).
export default function setup() {
  process.env.DATABASE_URL = process.env.DATABASE_URL_TEST;
  resetTestDb();
}
