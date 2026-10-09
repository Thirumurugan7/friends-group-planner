import { describe, it, expect, beforeEach } from "vitest";
import { resetDb } from "../helpers/db";
import { asUser, call } from "../helpers/http";
import { makeCompleteUser } from "../helpers/factories";
import { outingFixture } from "../helpers/outings";
import { POST as addExpense } from "@/app/api/outings/[id]/expenses/route";
import { DELETE as delExpense } from "@/app/api/outings/[id]/expenses/[expenseId]/route";
import { GET as getOuting } from "@/app/api/outings/[id]/route";
import { prisma } from "@/lib/db";

async function locked() {
  const f = await outingFixture({ confirm: true });
  await prisma.outing.update({ where: { id: f.outing.id }, data: { status: "locked" } });
  return f;
}

describe("expenses", () => {
  beforeEach(resetDb);

  it("logs expenses and computes who owes whom", async () => {
    const f = await locked();
    await asUser(f.admin.id);
    const res = await call(addExpense, {
      method: "POST", params: { id: f.outing.id },
      body: { amount: 90000, note: "Lunch", stopIndex: 1, splitAmong: [f.admin.id, f.b.id, f.c.id] },
    });
    expect(res.status).toBe(201);
    const view = (await call(getOuting, { params: { id: f.outing.id } })).json;
    expect(view.transfers).toEqual(
      expect.arrayContaining([
        { from: f.b.id, to: f.admin.id, amount: 30000 },
        { from: f.c.id, to: f.admin.id, amount: 30000 },
      ])
    );
  });

  it("is closed before lock", async () => {
    const f = await outingFixture({ confirm: true });
    await asUser(f.admin.id);
    const res = await call(addExpense, { method: "POST", params: { id: f.outing.id }, body: { amount: 100, note: "x", stopIndex: null, splitAmong: [f.admin.id] } });
    expect(res.status).toBe(409);
  });

  it("rejects splitting with non-members and bad amounts", async () => {
    const f = await locked();
    const stranger = await makeCompleteUser();
    await asUser(f.admin.id);
    const post = (body: object) => call(addExpense, { method: "POST", params: { id: f.outing.id }, body: { note: "x", stopIndex: null, ...body } });
    expect((await post({ amount: 100, splitAmong: [stranger.id] })).status).toBe(400);
    expect((await post({ amount: 0, splitAmong: [f.admin.id] })).status).toBe(400);
    expect((await post({ amount: 10.5, splitAmong: [f.admin.id] })).status).toBe(400);
    expect((await post({ amount: 100, splitAmong: [] })).status).toBe(400);
  });

  it("only payer or admin can delete", async () => {
    const f = await locked();
    await asUser(f.b.id);
    const { json } = await call(addExpense, { method: "POST", params: { id: f.outing.id }, body: { amount: 100, note: "x", stopIndex: null, splitAmong: [f.b.id, f.c.id] } });
    await asUser(f.c.id);
    expect((await call(delExpense, { method: "DELETE", params: { id: f.outing.id, expenseId: json.expense.id } })).status).toBe(403);
    await asUser(f.admin.id);
    expect((await call(delExpense, { method: "DELETE", params: { id: f.outing.id, expenseId: json.expense.id } })).status).toBe(200);
    expect(await prisma.expense.count()).toBe(0);
  });
});
