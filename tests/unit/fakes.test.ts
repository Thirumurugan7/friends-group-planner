import { describe, it, expect, afterEach, vi } from "vitest";
import { fakesEnabled } from "@/lib/fakes";

describe("fakesEnabled", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("is true in test with WAYPOINT_FAKES=1", () => {
    expect(fakesEnabled()).toBe(true);
  });
  it("is false without the flag", () => {
    vi.stubEnv("WAYPOINT_FAKES", "");
    expect(fakesEnabled()).toBe(false);
  });
  it("throws in production with the flag set", () => {
    vi.stubEnv("NODE_ENV", "production");
    expect(() => fakesEnabled()).toThrow(/cannot be enabled in production/);
  });
});
