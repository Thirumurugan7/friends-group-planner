import { describe, it, expect } from "vitest";
import { evaluateOutcome } from "@/lib/engine/outcome";

const date = "2026-10-18";
const nextDay = new Date("2026-10-19T00:00:00.000Z"); // 05:30 IST on the 19th
const goingIds = ["a", "b", "c", "d"];

describe("evaluateOutcome", () => {
  it("is undecided before the day is over", () => {
    expect(evaluateOutcome({ date, goingIds, checkIns: [], now: new Date("2026-10-18T15:00:00Z") })).toBeNull();
  });
  it("completes when at least half attended", () => {
    const checkIns = [{ userId: "a", attended: true }, { userId: "b", attended: true }];
    expect(evaluateOutcome({ date, goingIds, checkIns, now: nextDay })).toBe("completed");
  });
  it("waits while fewer than half have confirmed and others haven't answered", () => {
    expect(evaluateOutcome({ date, goingIds, checkIns: [{ userId: "a", attended: true }], now: nextDay })).toBeNull();
  });
  it("fails once everyone answered and fewer than half went", () => {
    const checkIns = [
      { userId: "a", attended: true }, { userId: "b", attended: false },
      { userId: "c", attended: false }, { userId: "d", attended: false },
    ];
    expect(evaluateOutcome({ date, goingIds, checkIns, now: nextDay })).toBe("failed");
  });
  it("fails after 3 days without a decision", () => {
    expect(evaluateOutcome({ date, goingIds, checkIns: [], now: new Date("2026-10-22T00:00:00Z") })).toBe("failed");
  });
  it("fails when nobody was going", () => {
    expect(evaluateOutcome({ date, goingIds: [], checkIns: [], now: nextDay })).toBe("failed");
  });
  it("ignores check-ins from people who were not going", () => {
    const checkIns = [{ userId: "x", attended: true }, { userId: "y", attended: true }];
    expect(evaluateOutcome({ date, goingIds, checkIns, now: nextDay })).toBeNull();
  });
});
