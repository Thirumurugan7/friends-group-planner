import { describe, it, expect, beforeEach, vi } from "vitest";
import { Prisma } from "@prisma/client";
import type { Leg } from "@/lib/engine/types";
import * as attendees from "@/lib/outings/attendees";
import { runGeneration } from "@/lib/outings/run";
import { resetDb } from "../helpers/db";
import { asUser, call } from "../helpers/http";
import { makeCompleteUser } from "../helpers/factories";
import { outingFixture } from "../helpers/outings";
import { POST as generate } from "@/app/api/outings/[id]/generate/route";
import { GET as getOuting } from "@/app/api/outings/[id]/route";
import { prisma } from "@/lib/db";

describe("generate options", () => {
  beforeEach(resetDb);

  it("maps a serialization conflict to 409 and creates nothing", async () => {
    const { outing, admin } = await outingFixture({ confirm: true });
    await asUser(admin.id);
    const original = prisma.$transaction.bind(prisma);
    const spy = vi.spyOn(prisma, "$transaction").mockRejectedValueOnce(
      new Prisma.PrismaClientKnownRequestError("conflict", { code: "P2034", clientVersion: "x" })
    );
    const res = await call(generate, { method: "POST", params: { id: outing.id } });
    spy.mockImplementation(original as never); // restore real behaviour for later tests
    expect(res.status).toBe(409);
    expect(await prisma.itineraryOption.count({ where: { outingId: outing.id } })).toBe(0);
  });

  it("marks stuck generating options failed when the run throws", async () => {
    const { outing } = await outingFixture({ confirm: true });
    await prisma.itineraryOption.create({ data: { outingId: outing.id, theme: "relaxed", status: "generating" } });
    const spy = vi.spyOn(attendees, "loadAttendees").mockRejectedValueOnce(new Error("boom"));
    await expect(runGeneration(outing.id)).rejects.toThrow("boom");
    spy.mockRestore();
    const opts = await prisma.itineraryOption.findMany({ where: { outingId: outing.id } });
    expect(opts.map((o) => o.status)).toEqual(["failed"]);
  });

  it("needs a confirmed date", async () => {
    const { outing, admin } = await outingFixture();
    await asUser(admin.id);
    expect((await call(generate, { method: "POST", params: { id: outing.id } })).status).toBe(400);
  });

  it("needs at least 2 complete free attendees", async () => {
    const { outing, admin, b, c } = await outingFixture({ confirm: true });
    await prisma.availability.updateMany({ where: { userId: { in: [b.id, c.id] } }, data: { free: false } });
    await asUser(admin.id);
    const res = await call(generate, { method: "POST", params: { id: outing.id } });
    expect(res.status).toBe(400);
    expect(res.json.error).toMatch(/at least 2/i);
  });

  it("only organiser/admin can generate", async () => {
    const { outing, b } = await outingFixture({ confirm: true });
    await asUser(b.id);
    expect((await call(generate, { method: "POST", params: { id: outing.id } })).status).toBe(403);
  });

  it("generates 3 ready options and moves to voting", async () => {
    const { outing, admin } = await outingFixture({ confirm: true });
    await asUser(admin.id);
    const res = await call(generate, { method: "POST", params: { id: outing.id } });
    expect(res.status).toBe(202);
    expect(res.json.optionIds).toHaveLength(3);
    const opts = await prisma.itineraryOption.findMany({ where: { outingId: outing.id } });
    expect(opts.map((o) => o.status)).toEqual(["ready", "ready", "ready"]);
    expect((await prisma.outing.findUniqueOrThrow({ where: { id: outing.id } })).status).toBe("voting");
  });

  it("returns 409 while options are still generating (double tap)", async () => {
    const { outing, admin } = await outingFixture({ confirm: true });
    await prisma.itineraryOption.create({ data: { outingId: outing.id, theme: "relaxed", status: "generating" } });
    await asUser(admin.id);
    expect((await call(generate, { method: "POST", params: { id: outing.id } })).status).toBe(409);
    expect(await prisma.itineraryOption.count({ where: { outingId: outing.id } })).toBe(1);
  });

  it("sweeps options stuck generating for over 10 minutes and regenerates", async () => {
    const { outing, admin } = await outingFixture({ confirm: true });
    const stuck = await prisma.itineraryOption.create({ data: { outingId: outing.id, theme: "relaxed", status: "generating" } });
    await prisma.itineraryOption.update({ where: { id: stuck.id }, data: { updatedAt: new Date(Date.now() - 11 * 60_000) } });
    await asUser(admin.id);
    expect((await call(generate, { method: "POST", params: { id: outing.id } })).status).toBe(202);
    expect(await prisma.itineraryOption.count({ where: { outingId: outing.id, id: stuck.id } })).toBe(0);
  });

  it("regenerating replaces previous options and votes", async () => {
    const { outing, admin } = await outingFixture({ confirm: true });
    await asUser(admin.id);
    await call(generate, { method: "POST", params: { id: outing.id } });
    const first = await prisma.itineraryOption.findFirstOrThrow({ where: { outingId: outing.id } });
    await prisma.vote.create({ data: { outingId: outing.id, userId: admin.id, optionId: first.id } });
    await call(generate, { method: "POST", params: { id: outing.id } });
    expect(await prisma.itineraryOption.count({ where: { outingId: outing.id } })).toBe(3);
    expect(await prisma.vote.count({ where: { outingId: outing.id } })).toBe(0);
  });

  it("other members never see someone else's home route geometry or exact home", async () => {
    const { outing, admin, b } = await outingFixture({ confirm: true });
    await asUser(admin.id);
    await call(generate, { method: "POST", params: { id: outing.id } });
    await asUser(b.id);
    const view = (await call(getOuting, { params: { id: outing.id } })).json as { options: { routes: Leg[] }[] };
    const s = JSON.stringify(view);
    expect(s).not.toContain("12.90123");
    expect(s).not.toContain("77.60123");
    const adminHomeLegs = view.options[0].routes.filter(
      (l) => l.attendeeId === admin.id && (l.from === "home" || l.to === "home")
    );
    expect(adminHomeLegs.length).toBe(2);
    expect(adminHomeLegs.every((l) => l.route.geometry === null)).toBe(true);
    const myHomeLeg = view.options[0].routes.find((l) => l.attendeeId === b.id && l.from === "home");
    expect(myHomeLeg?.route.geometry).not.toBeNull();
  });

  it("outsiders get 404", async () => {
    const { outing } = await outingFixture({ confirm: true });
    const x = await makeCompleteUser();
    await asUser(x.id);
    expect((await call(generate, { method: "POST", params: { id: outing.id } })).status).toBe(404);
  });
});
