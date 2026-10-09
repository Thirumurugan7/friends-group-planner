import { describe, it, expect } from "vitest";
import { settle, balances } from "@/lib/engine/settle";

describe("settle", () => {
  it("returns nothing when there are no expenses", () => {
    expect(settle([])).toEqual([]);
  });

  it("splits one bill evenly", () => {
    expect(settle([{ paidById: "a", amount: 90000, splitAmong: ["a", "b", "c"] }])).toEqual([
      { from: "b", to: "a", amount: 30000 },
      { from: "c", to: "a", amount: 30000 },
    ]);
  });

  it("nets multiple bills into minimal transfers", () => {
    const t = settle([
      { paidById: "a", amount: 60000, splitAmong: ["a", "b"] },
      { paidById: "b", amount: 60000, splitAmong: ["a", "b"] },
    ]);
    expect(t).toEqual([]);
  });

  it("assigns leftover paise deterministically and balances to zero", () => {
    const b = balances([{ paidById: "a", amount: 100, splitAmong: ["c", "b", "a"] }]);
    expect([...b.values()].reduce((s, v) => s + v, 0)).toBe(0);
    expect(b.get("a")).toBe(100 - 34);
    expect(b.get("b")).toBe(-33);
    expect(b.get("c")).toBe(-33);
  });
});
