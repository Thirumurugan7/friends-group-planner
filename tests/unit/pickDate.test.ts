import { describe, it, expect } from "vitest";
import { pickDate } from "@/lib/engine/pickDate";

const dates = ["2026-10-17", "2026-10-18", "2026-10-19"];

describe("pickDate", () => {
  it("ranks by number of free members", () => {
    const r = pickDate({
      dates, memberIds: ["a", "b", "c"], incompleteIds: [],
      availability: [
        { userId: "a", date: "2026-10-18", free: true },
        { userId: "b", date: "2026-10-18", free: true },
        { userId: "a", date: "2026-10-17", free: true },
        { userId: "c", date: "2026-10-19", free: false },
      ],
    });
    expect(r.map((d) => d.date)).toEqual(["2026-10-18", "2026-10-17", "2026-10-19"]);
    expect(r[0].freeUserIds.sort()).toEqual(["a", "b"]);
  });

  it("breaks ties by fewer incomplete profiles, then earlier date", () => {
    const r = pickDate({
      dates, memberIds: ["a", "b"], incompleteIds: ["b"],
      availability: [
        { userId: "b", date: "2026-10-17", free: true },
        { userId: "a", date: "2026-10-18", free: true },
        { userId: "a", date: "2026-10-19", free: true },
      ],
    });
    expect(r.map((d) => d.date)).toEqual(["2026-10-18", "2026-10-19", "2026-10-17"]);
  });

  it("ignores non-members and out-of-range dates", () => {
    const r = pickDate({
      dates: ["2026-10-17"], memberIds: ["a"], incompleteIds: [],
      availability: [
        { userId: "zz", date: "2026-10-17", free: true },
        { userId: "a", date: "2026-11-01", free: true },
      ],
    });
    expect(r).toEqual([{ date: "2026-10-17", freeUserIds: [], freeCount: 0, incompleteFreeCount: 0 }]);
  });
});
