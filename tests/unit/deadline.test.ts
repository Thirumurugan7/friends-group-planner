import { describe, it, expect } from "vitest";
import { effectiveDeadline } from "@/lib/deadline";

describe("effectiveDeadline", () => {
  it("is null when nothing applies", () => {
    expect(effectiveDeadline({ homeBy: null, gender: "male" }, null)).toBeNull();
  });
  it("uses personal homeBy", () => {
    expect(effectiveDeadline({ homeBy: "22:00", gender: "male" }, null)).toBe("22:00");
  });
  it("defaults women to 23:00 when no personal time is set", () => {
    expect(effectiveDeadline({ homeBy: null, gender: "female" }, null)).toBe("23:00");
  });
  it("lets a personal time replace the female default", () => {
    expect(effectiveDeadline({ homeBy: "23:45", gender: "female" }, null)).toBe("23:45");
  });
  it("takes the earliest of personal and group", () => {
    expect(effectiveDeadline({ homeBy: "22:00", gender: "male" }, "21:30")).toBe("21:30");
    expect(effectiveDeadline({ homeBy: null, gender: "female" }, "23:30")).toBe("23:00");
  });
  it("treats after-midnight times as later than evening times", () => {
    expect(effectiveDeadline({ homeBy: "00:30", gender: "male" }, "23:00")).toBe("23:00");
    expect(effectiveDeadline({ homeBy: "00:30", gender: "male" }, null)).toBe("00:30");
  });
});
