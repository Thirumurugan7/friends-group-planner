import { describe, it, expect } from "vitest";
import { makeInviteCode } from "@/lib/auth";

describe("makeInviteCode", () => {
  it("is 10 unambiguous characters grouped 4-4-2", () => {
    for (let i = 0; i < 50; i++) {
      expect(makeInviteCode()).toMatch(/^[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{4}-[A-HJ-NP-Z2-9]{2}$/);
    }
  });
  it("varies between calls", () => {
    expect(new Set(Array.from({ length: 20 }, makeInviteCode)).size).toBe(20);
  });
});
