import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "../helpers/db";
import { asUser, call } from "../helpers/http";
import { makeCompleteUser, makeGroup, makeUser } from "../helpers/factories";
import { route, ok, requireUser, requireMember, requireAdmin, requireCompleteUser } from "@/lib/http";

const memberOnly = route<{ id: string }>(async (_req, { params }) => {
  const user = await requireUser();
  const { id } = await params;
  await requireMember(id, user.id);
  return ok({ ok: true });
});
const adminOnly = route<{ id: string }>(async (_req, { params }) => {
  const user = await requireUser();
  await requireAdmin((await params).id, user.id);
  return ok({ ok: true });
});
const completeOnly = route(async () => {
  await requireCompleteUser();
  return ok({ ok: true });
});

describe("guards", () => {
  beforeEach(resetDb);

  it("401 when signed out", async () => {
    await asUser(null);
    expect((await call(memberOnly, { params: { id: "x" } })).status).toBe(401);
  });

  it("404 for non-members and unknown groups, 200 for members", async () => {
    const admin = await makeCompleteUser();
    const outsider = await makeCompleteUser();
    const g = await makeGroup(admin.id);
    await asUser(outsider.id);
    expect((await call(memberOnly, { params: { id: g.id } })).status).toBe(404);
    expect((await call(memberOnly, { params: { id: "nope" } })).status).toBe(404);
    await asUser(admin.id);
    expect((await call(memberOnly, { params: { id: g.id } })).status).toBe(200);
  });

  it("403 for non-admin members on admin actions", async () => {
    const admin = await makeCompleteUser();
    const member = await makeCompleteUser();
    const g = await makeGroup(admin.id, [member.id]);
    await asUser(member.id);
    expect((await call(adminOnly, { params: { id: g.id } })).status).toBe(403);
  });

  it("403 for incomplete profiles on complete-only routes", async () => {
    const u = await makeUser();
    await asUser(u.id);
    const res = await call(completeOnly);
    expect(res.status).toBe(403);
    expect(res.json.error).toBe("Finish your profile first.");
  });
});
