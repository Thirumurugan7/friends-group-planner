import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "../helpers/db";
import { asUser, call } from "../helpers/http";
import { makeCompleteUser, makeGroup } from "../helpers/factories";
import { dayFromNow, outingFixture } from "../helpers/outings";
import { POST as createOuting } from "@/app/api/groups/[id]/outings/route";
import { GET as listOutings } from "@/app/api/outings/route";
import { GET as getOuting } from "@/app/api/outings/[id]/route";
import { PUT as putAvailability } from "@/app/api/outings/[id]/availability/route";
import { POST as confirmDate } from "@/app/api/outings/[id]/confirm-date/route";
import { prisma } from "@/lib/db";

describe("outing collection phase", () => {
  beforeEach(resetDb);

  it("creates an outing with validated range", async () => {
    const a = await makeCompleteUser();
    const g = await makeGroup(a.id);
    await asUser(a.id);
    const ok = await call(createOuting, {
      method: "POST", params: { id: g.id },
      body: { title: "Beach day", rangeStart: dayFromNow(1), rangeEnd: dayFromNow(5), groupHomeBy: "22:30" },
    });
    expect(ok.status).toBe(201);
    const bad = (body: object) => call(createOuting, { method: "POST", params: { id: g.id }, body: { title: "x", groupHomeBy: null, ...body } });
    expect((await bad({ rangeStart: dayFromNow(5), rangeEnd: dayFromNow(1) })).status).toBe(400);
    expect((await bad({ rangeStart: dayFromNow(1), rangeEnd: dayFromNow(16) })).status).toBe(400);
    expect((await bad({ rangeStart: dayFromNow(-2), rangeEnd: dayFromNow(1) })).status).toBe(400);
  });

  it("outsiders cannot create, read, or mark availability", async () => {
    const { outing, group } = await outingFixture();
    const stranger = await makeCompleteUser();
    await asUser(stranger.id);
    expect((await call(createOuting, { method: "POST", params: { id: group.id }, body: { title: "x", rangeStart: dayFromNow(1), rangeEnd: dayFromNow(2), groupHomeBy: null } })).status).toBe(404);
    expect((await call(getOuting, { params: { id: outing.id } })).status).toBe(404);
    expect((await call(putAvailability, { method: "PUT", params: { id: outing.id }, body: { free: [] } })).status).toBe(404);
    expect((await call(listOutings)).json.outings).toEqual([]);
  });

  it("replaces my availability and ranks dates", async () => {
    const { outing, b, date } = await outingFixture();
    await asUser(b.id);
    const other = dayFromNow(2);
    expect((await call(putAvailability, { method: "PUT", params: { id: outing.id }, body: { free: [other] } })).status).toBe(200);
    const view = (await call(getOuting, { params: { id: outing.id } })).json;
    expect(view.me.freeDates).toEqual([other]);
    expect(view.dates[0].date).toBe(date); // admin + c still free on `date`
    expect(view.dates[0].freeCount).toBe(2);
  });

  it("rejects dates outside the range", async () => {
    const { outing, b } = await outingFixture();
    await asUser(b.id);
    expect((await call(putAvailability, { method: "PUT", params: { id: outing.id }, body: { free: [dayFromNow(30)] } })).status).toBe(400);
  });

  it("only organiser/admin confirms a date inside the range", async () => {
    const { outing, admin, b, date } = await outingFixture();
    await asUser(b.id);
    expect((await call(confirmDate, { method: "POST", params: { id: outing.id }, body: { date } })).status).toBe(403);
    await asUser(admin.id);
    expect((await call(confirmDate, { method: "POST", params: { id: outing.id }, body: { date: dayFromNow(30) } })).status).toBe(400);
    expect((await call(confirmDate, { method: "POST", params: { id: outing.id }, body: { date } })).status).toBe(200);
    expect((await prisma.outing.findUniqueOrThrow({ where: { id: outing.id } })).date).toBe(date);
  });

  it("lists outings across my groups", async () => {
    const { admin } = await outingFixture();
    await asUser(admin.id);
    const res = await call(listOutings);
    expect(res.json.outings).toHaveLength(1);
    expect(res.json.outings[0].groupName).toBe("Test Group");
  });
});
