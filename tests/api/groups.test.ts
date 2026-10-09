import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "../helpers/db";
import { asUser, call } from "../helpers/http";
import { makeCompleteUser, makeGroup, makeUser } from "../helpers/factories";
import { GET as listGroups, POST as createGroup } from "@/app/api/groups/route";
import { GET as getGroup } from "@/app/api/groups/[id]/route";
import { POST as rotate } from "@/app/api/groups/[id]/invite/route";
import { DELETE as removeMember } from "@/app/api/groups/[id]/members/[userId]/route";
import { GET as previewJoin, POST as join } from "@/app/api/join/[code]/route";
import { prisma } from "@/lib/db";

describe("groups API", () => {
  beforeEach(resetDb);

  it("creator becomes admin; incomplete users cannot create", async () => {
    const u = await makeCompleteUser();
    await asUser(u.id);
    const res = await call(createGroup, { method: "POST", body: { name: "Weekenders" } });
    expect(res.status).toBe(200);
    const m = await prisma.membership.findFirstOrThrow({ where: { groupId: res.json.group.id } });
    expect(m.role).toBe("admin");

    const inc = await makeUser();
    await asUser(inc.id);
    expect((await call(createGroup, { method: "POST", body: { name: "X" } })).status).toBe(403);
  });

  it("lists only my groups with role", async () => {
    const a = await makeCompleteUser();
    const b = await makeCompleteUser();
    await makeGroup(a.id);
    await makeGroup(b.id);
    await asUser(a.id);
    const res = await call(listGroups);
    expect(res.json.groups).toHaveLength(1);
    expect(res.json.groups[0].role).toBe("admin");
  });

  it("join preview hides member names; join works and is idempotent", async () => {
    const a = await makeCompleteUser({ name: "Secret Name" });
    const g = await makeGroup(a.id);
    const b = await makeCompleteUser();
    await asUser(b.id);
    const preview = await call(previewJoin, { params: { code: g.inviteCode.toLowerCase() } });
    expect(preview.status).toBe(200);
    expect(JSON.stringify(preview.json)).not.toContain("Secret Name");
    expect((await call(join, { method: "POST", params: { code: g.inviteCode } })).status).toBe(200);
    expect((await call(join, { method: "POST", params: { code: g.inviteCode } })).status).toBe(200);
    expect(await prisma.membership.count({ where: { groupId: g.id } })).toBe(2);
  });

  it("rotating the invite kills the old code", async () => {
    const a = await makeCompleteUser();
    const g = await makeGroup(a.id);
    await asUser(a.id);
    const res = await call(rotate, { method: "POST", params: { id: g.id } });
    expect(res.json.inviteCode).not.toBe(g.inviteCode);
    const b = await makeCompleteUser();
    await asUser(b.id);
    expect((await call(join, { method: "POST", params: { code: g.inviteCode } })).status).toBe(404);
  });

  it("admin removes a member who then gets 404 (Review Focus #4)", async () => {
    const a = await makeCompleteUser();
    const b = await makeCompleteUser();
    const g = await makeGroup(a.id, [b.id]);
    await asUser(b.id);
    expect((await call(removeMember, { method: "DELETE", params: { id: g.id, userId: a.id } })).status).toBe(403);
    await asUser(a.id);
    expect((await call(removeMember, { method: "DELETE", params: { id: g.id, userId: a.id } })).status).toBe(400);
    expect((await call(removeMember, { method: "DELETE", params: { id: g.id, userId: b.id } })).status).toBe(200);
    await asUser(b.id);
    expect((await call(getGroup, { params: { id: g.id } })).status).toBe(404);
  });

  it("group detail never includes exact coordinates", async () => {
    const a = await makeCompleteUser({ homeLat: 12.97123, homeLng: 77.64123, workLat: 12.93456, workLng: 77.62456 });
    const g = await makeGroup(a.id);
    await asUser(a.id);
    const res = await call(getGroup, { params: { id: g.id } });
    const s = JSON.stringify(res.json);
    for (const v of ["12.97123", "77.64123", "12.93456", "77.62456"]) expect(s).not.toContain(v);
    expect(res.json.group.members[0].homeArea).toEqual({ lat: 12.97, lng: 77.64 });
  });
});
