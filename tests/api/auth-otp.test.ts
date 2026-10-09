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
  it("caps parallel wrong guesses at 5 and then locks", async () => {
    await call(requestOtp, { method: "POST", body: { phone: "9876533333" } });
    const results = await Promise.all(
      Array.from({ length: 20 }, () =>
        call(verifyOtp, { method: "POST", body: { phone: "9876533333", code: "0000" } })
      )
    );
    const wrong = results.filter((r) => r.status === 401).length;
    const locked = results.filter((r) => r.status === 429).length;
    expect(wrong).toBeLessThanOrEqual(5);
    expect(wrong + locked).toBe(20);
    const res = await call(verifyOtp, { method: "POST", body: { phone: "9876533333", code: "1234" } });
    expect(res.status).toBe(429);
  });

  it("a code can be used only once even in parallel", async () => {
    await prisma.user.create({ data: { phone: "919876544444" } });
    await call(requestOtp, { method: "POST", body: { phone: "9876544444" } });
    const results = await Promise.all(
      Array.from({ length: 10 }, () =>
        call(verifyOtp, { method: "POST", body: { phone: "9876544444", code: "1234" } })
      )
    );
    expect(results.filter((r) => r.status === 200).length).toBe(1);
    expect(results.filter((r) => r.status === 400 || r.status === 429).length).toBe(9);
  });

  it("rate limits parallel code requests to 3", async () => {
    const results = await Promise.all(
      Array.from({ length: 6 }, () => call(requestOtp, { method: "POST", body: { phone: "9876555555" } }))
    );
    expect(results.filter((r) => r.status === 200).length).toBeLessThanOrEqual(3);
    expect(await prisma.otpChallenge.count({ where: { phone: "919876555555" } })).toBeLessThanOrEqual(3);
  });

  it("caps codes at 10 per phone per day", async () => {
    const old = new Date(Date.now() - 2 * 3600_000);
    await prisma.otpChallenge.createMany({
      data: Array.from({ length: 10 }, () => ({
        phone: "919876566666", codeHash: "x", expiresAt: old, createdAt: old,
      })),
    });
    const res = await call(requestOtp, { method: "POST", body: { phone: "9876566666" } });
    expect(res.status).toBe(429);
    expect(res.json.error).toBe("Too many codes today. Try again tomorrow.");
  });
});
