import { describe, it, expect } from "vitest";
import { atLocal, localDate, localHHMM, addMinutes, datesInRange, dayOrderMinutes } from "@/lib/time";

describe("city time", () => {
  it("converts city wall time to UTC", () => {
    expect(atLocal("2026-10-18", "10:00").toISOString()).toBe("2026-10-18T04:30:00.000Z");
  });
  it("rolls times before 05:00 to the next day", () => {
    expect(atLocal("2026-10-18", "00:30").toISOString()).toBe("2026-10-18T19:00:00.000Z");
  });
  it("formats back to city-local date and time", () => {
    const d = new Date("2026-10-18T19:00:00.000Z");
    expect(localDate(d)).toBe("2026-10-19");
    expect(localHHMM(d)).toBe("00:30");
  });
  it("adds minutes", () => {
    expect(addMinutes(new Date("2026-10-18T00:00:00Z"), 90).toISOString()).toBe("2026-10-18T01:30:00.000Z");
  });
  it("lists dates inclusively", () => {
    expect(datesInRange("2026-10-30", "2026-11-02")).toEqual(["2026-10-30", "2026-10-31", "2026-11-01", "2026-11-02"]);
  });
  it("orders after-midnight times later than evening times", () => {
    expect(dayOrderMinutes("00:30")).toBeGreaterThan(dayOrderMinutes("23:00"));
    expect(dayOrderMinutes("05:00")).toBe(0);
  });
});
