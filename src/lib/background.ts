import { after } from "next/server";

/** Run slow work after the response. Tests and E2E run it inline so results are deterministic. */
export function runInBackground(task: () => Promise<void>): Promise<void> {
  if (process.env.VITEST || process.env.WAYPOINT_SYNC_BACKGROUND === "1") return task();
  after(() =>
    task().catch((err) => console.error("[background] task failed", err))
  );
  return Promise.resolve();
}
