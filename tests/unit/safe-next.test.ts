import { describe, it, expect } from "vitest";
import { safeNext } from "@/lib/safe-next";

describe("safeNext", () => {
  it("keeps same-origin paths", () => {
    expect(safeNext("/groups?x=1")).toBe("/groups?x=1");
    expect(safeNext("/join/ABCD-EFGH-JK")).toBe("/join/ABCD-EFGH-JK");
  });
  it("rejects anything that could leave the site", () => {
    for (const v of ["//evil.com", "https://evil.com", "/\\evil.com", "javascript:alert(1)", "evil.com", "", "/\t/evil.com"]) {
      expect(safeNext(v)).toBe("/groups");
    }
  });
  it("falls back when missing", () => {
    expect(safeNext(null)).toBe("/groups");
    expect(safeNext(undefined, "/profile")).toBe("/profile");
  });
});
