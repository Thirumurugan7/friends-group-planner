import { describe, it, expect } from "vitest";
import { formatRupees, parseRupees } from "@/lib/money";

describe("money", () => {
  it("formats paise as rupees with Indian grouping", () => {
    expect(formatRupees(12345600)).toBe("₹1,23,456");
  });
  it("parses rupee input to paise", () => {
    expect(parseRupees("450.50")).toBe(45050);
    expect(parseRupees("₹1,200")).toBe(120000);
    expect(parseRupees("0")).toBeNull();
    expect(parseRupees("abc")).toBeNull();
  });
});
