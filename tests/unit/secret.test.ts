import { describe, it, expect, afterEach, vi } from "vitest";

describe("production secret guard", () => {
  afterEach(() => vi.unstubAllEnvs());

  it("hashOtp throws in production without SESSION_SECRET", async () => {
    const { hashOtp } = await import("@/lib/otp");
    vi.stubEnv("SESSION_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");
    expect(() => hashOtp("919876543210", "1234")).toThrow(/SESSION_SECRET/);
  });

  it("createSession throws in production without SESSION_SECRET", async () => {
    const { createSession } = await import("@/lib/session");
    vi.stubEnv("SESSION_SECRET", "");
    vi.stubEnv("NODE_ENV", "production");
    await expect(createSession("u1")).rejects.toThrow(/SESSION_SECRET/);
  });

  it("keeps the dev default outside production", async () => {
    const { hashOtp } = await import("@/lib/otp");
    const { createSession, getUserId } = await import("@/lib/session");
    vi.stubEnv("SESSION_SECRET", "");
    expect(hashOtp("919876543210", "1234")).toMatch(/^[0-9a-f]{64}$/);
    await createSession("u1");
    expect(await getUserId()).toBe("u1");
  });
});
