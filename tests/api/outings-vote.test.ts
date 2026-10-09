import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "../helpers/db";
import { asUser, call } from "../helpers/http";
import { votingFixture } from "../helpers/voting";
import { PUT as vote } from "@/app/api/outings/[id]/vote/route";
import { PUT as rsvp } from "@/app/api/outings/[id]/rsvp/route";
import { POST as lock } from "@/app/api/outings/[id]/lock/route";
import { POST as cancel } from "@/app/api/outings/[id]/cancel/route";
import { POST as showtime } from "@/app/api/outings/[id]/showtime/route";
import { prisma } from "@/lib/db";
import { runRecalc } from "@/lib/outings/run";
import type { Leg, Stop } from "@/lib/engine/types";

async function goingAll(f: Awaited<ReturnType<typeof votingFixture>>) {
  for (const u of [f.admin, f.b, f.c]) {
    await asUser(u.id);
    await call(rsvp, { method: "PUT", params: { id: f.outing.id }, body: { status: "going" } });
  }
}

describe("voting and locking", () => {
  beforeEach(resetDb);

  it("one vote per member, changeable", async () => {
    const f = await votingFixture();
    await asUser(f.b.id);
    await call(vote, { method: "PUT", params: { id: f.outing.id }, body: { optionId: f.options[0].id } });
    await call(vote, { method: "PUT", params: { id: f.outing.id }, body: { optionId: f.options[1].id } });
    const votes = await prisma.vote.findMany({ where: { outingId: f.outing.id } });
    expect(votes.map((v) => v.optionId)).toEqual([f.options[1].id]);
  });

  it("rejects votes for another outing's option", async () => {
    const f = await votingFixture();
    const other = await votingFixture();
    await asUser(f.b.id);
    expect((await call(vote, { method: "PUT", params: { id: f.outing.id }, body: { optionId: other.options[0].id } })).status).toBe(400);
  });

  it("locks the top-voted option; ties need a pick", async () => {
    const f = await votingFixture();
    await goingAll(f);
    await asUser(f.b.id);
    await call(vote, { method: "PUT", params: { id: f.outing.id }, body: { optionId: f.options[0].id } });
    await asUser(f.c.id);
    await call(vote, { method: "PUT", params: { id: f.outing.id }, body: { optionId: f.options[1].id } });

    await asUser(f.admin.id);
    const tie = await call(lock, { method: "POST", params: { id: f.outing.id }, body: {} });
    expect(tie.status).toBe(409);
    expect(tie.json.tiedOptionIds.sort()).toEqual([f.options[0].id, f.options[1].id].sort());

    const res = await call(lock, { method: "POST", params: { id: f.outing.id }, body: { optionId: f.options[1].id } });
    expect(res.status).toBe(200);
    const o = await prisma.outing.findUniqueOrThrow({ where: { id: f.outing.id } });
    expect(o.status).toBe("locked");
    expect(o.lockedOptionId).toBe(f.options[1].id);
  });

  it("needs 2 people going to lock", async () => {
    const f = await votingFixture();
    await asUser(f.admin.id);
    await call(rsvp, { method: "PUT", params: { id: f.outing.id }, body: { status: "going" } });
    const res = await call(lock, { method: "POST", params: { id: f.outing.id }, body: { optionId: f.options[0].id } });
    expect(res.status).toBe(400);
  });

  it("cancelling after lock recalculates without that person", async () => {
    const f = await votingFixture();
    await goingAll(f);
    await asUser(f.admin.id);
    await call(lock, { method: "POST", params: { id: f.outing.id }, body: { optionId: f.options[0].id } });

    await asUser(f.c.id);
    expect((await call(rsvp, { method: "PUT", params: { id: f.outing.id }, body: { status: "cancelled", reason: "Sick" } })).status).toBe(200);
    const r = await prisma.rsvp.findFirstOrThrow({ where: { userId: f.c.id } });
    expect(r.cancelledAt).not.toBeNull();
    const opt = await prisma.itineraryOption.findUniqueOrThrow({ where: { id: f.options[0].id } });
    const ids = new Set((opt.routes as unknown as Leg[]).map((l) => l.attendeeId));
    expect(ids.has(f.c.id)).toBe(false);
    expect(ids.size).toBe(2);
  });

  it("cannot 'cancel' before saying going", async () => {
    const f = await votingFixture();
    await asUser(f.b.id);
    expect((await call(rsvp, { method: "PUT", params: { id: f.outing.id }, body: { status: "cancelled" } })).status).toBe(400);
  });

  it("a member removed from the group drops out on the next recalculation", async () => {
    const f = await votingFixture();
    await goingAll(f);
    await asUser(f.admin.id);
    await call(lock, { method: "POST", params: { id: f.outing.id }, body: { optionId: f.options[0].id } });
    await prisma.membership.deleteMany({ where: { groupId: f.group.id, userId: f.b.id } });
    await runRecalc(f.options[0].id);
    const opt = await prisma.itineraryOption.findUniqueOrThrow({ where: { id: f.options[0].id } });
    expect((opt.routes as unknown as Leg[]).some((l) => l.attendeeId === f.b.id)).toBe(false);
  });

  it("organiser can cancel the outing with a reason", async () => {
    const f = await votingFixture();
    await asUser(f.b.id);
    expect((await call(cancel, { method: "POST", params: { id: f.outing.id }, body: {} })).status).toBe(403);
    await asUser(f.admin.id);
    expect((await call(cancel, { method: "POST", params: { id: f.outing.id }, body: { reason: "Rain" } })).status).toBe(200);
    const o = await prisma.outing.findUniqueOrThrow({ where: { id: f.outing.id } });
    expect([o.status, o.cancelReason]).toEqual(["cancelled", "Rain"]);
    expect((await call(cancel, { method: "POST", params: { id: f.outing.id }, body: {} })).status).toBe(409);
  });

  it("showtime override moves a cinema stop and recalculates", async () => {
    const f = await votingFixture();
    await goingAll(f);
    await asUser(f.admin.id);
    const relaxed = f.options.find((o) => o.theme === "relaxed")!;
    await call(lock, { method: "POST", params: { id: f.outing.id }, body: { optionId: relaxed.id } });
    const stops = (await prisma.itineraryOption.findUniqueOrThrow({ where: { id: relaxed.id } })).stops as unknown as Stop[];
    const cinemaIdx = stops.findIndex((s) => s.slot.kind === "cinema");
    expect(cinemaIdx).toBeGreaterThanOrEqual(0);

    await asUser(f.b.id);
    expect((await call(showtime, { method: "POST", params: { id: f.outing.id }, body: { stopIndex: 0, time: "11:00" } })).status).toBe(400);
    expect((await call(showtime, { method: "POST", params: { id: f.outing.id }, body: { stopIndex: cinemaIdx, time: "18:15" } })).status).toBe(200);
    const after = (await prisma.itineraryOption.findUniqueOrThrow({ where: { id: relaxed.id } })).stops as unknown as Stop[];
    expect(after[cinemaIdx].slot.startTime).toBe("18:15");
  });
});
