import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "../helpers/db";
import { asUser, call } from "../helpers/http";
import { POST as requestOtp } from "@/app/api/auth/request-otp/route";
import { POST as verifyOtp } from "@/app/api/auth/verify-otp/route";
import { prisma } from "@/lib/db";

describe("phone OTP", () => {
  beforeEach(async () => { await resetDb(); await asUser(null); });

  it("rejects invalid numbers", async () => {
    expect((await call(requestOtp, { method: "POST", body: { phone: "123" } })).status).toBe(400);
  });

  it("signs in with the code and reports profile needed", async () => {
    expect((await call(requestOtp, { method: "POST", body: { phone: "9876543210" } })).status).toBe(200);
    const res = await call(verifyOtp, { method: "POST", body: { phone: "9876543210", code: "1234" } });
    expect(res.status).toBe(200);
    expect(res.json.needsProfile).toBe(true);
    expect(await prisma.user.count({ where: { phone: "919876543210" } })).toBe(1);
  });

  it("rate limits to 3 codes per 15 minutes", async () => {
    for (let i = 0; i < 3; i++) {
      expect((await call(requestOtp, { method: "POST", body: { phone: "9876500000" } })).status).toBe(200);
    }
    const res = await call(requestOtp, { method: "POST", body: { phone: "9876500000" } });
    expect(res.status).toBe(429);
  });

  it("locks after 5 wrong attempts", async () => {
    await call(requestOtp, { method: "POST", body: { phone: "9876511111" } });
    for (let i = 0; i < 5; i++) {
      expect((await call(verifyOtp, { method: "POST", body: { phone: "9876511111", code: "0000" } })).status).toBe(401);
    }
    const res = await call(verifyOtp, { method: "POST", body: { phone: "9876511111", code: "1234" } });
    expect(res.status).toBe(429);
  });

  it("rejects expired codes", async () => {
    await call(requestOtp, { method: "POST", body: { phone: "9876522222" } });
    await prisma.otpChallenge.updateMany({ data: { expiresAt: new Date(Date.now() - 1000) } });
    const res = await call(verifyOtp, { method: "POST", body: { phone: "9876522222", code: "1234" } });
    expect(res.status).toBe(400);
  });
});
