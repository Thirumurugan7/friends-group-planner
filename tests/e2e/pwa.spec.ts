import { test, expect, type Page } from "@playwright/test";
import { newUser } from "./helpers";
import { isoDay } from "./db";

test("manifest and icons are valid", async ({ request }) => {
  const res = await request.get("/manifest.webmanifest");
  expect(res.ok()).toBe(true);
  const m = await res.json();
  expect(m).toMatchObject({ name: "Waypoint", display: "standalone", start_url: "/groups" });
  for (const icon of m.icons) {
    const r = await request.get(icon.src);
    expect(r.headers()["content-type"]).toContain("image/png");
  }
});

async function lockedOuting(a: Page, b: Page) {
  const g = await (await a.request.post("/api/groups", { data: { name: "PWA Crew" } })).json();
  const detail = await (await a.request.get(`/api/groups/${g.group.id}`)).json();
  await b.request.post(`/api/join/${detail.group.inviteCode}`);
  const day = isoDay(2);
  const o = await (await a.request.post(`/api/groups/${g.group.id}/outings`, {
    data: { title: "Offline day", rangeStart: isoDay(1), rangeEnd: isoDay(3), groupHomeBy: null },
  })).json();
  const id = o.outing.id as string;
  for (const p of [a, b]) await p.request.put(`/api/outings/${id}/availability`, { data: { free: [day] } });
  await a.request.post(`/api/outings/${id}/confirm-date`, { data: { date: day } });
  const gen = await (await a.request.post(`/api/outings/${id}/generate`)).json();
  for (const p of [a, b]) {
    await p.request.put(`/api/outings/${id}/vote`, { data: { optionId: gen.optionIds[0] } });
    await p.request.put(`/api/outings/${id}/rsvp`, { data: { status: "going" } });
  }
  await a.request.post(`/api/outings/${id}/lock`, { data: {} });
  return id;
}

test("a locked outing opens offline", async ({ browser }) => {
  const use = test.info().project.use;
  const ctxA = await browser.newContext({ ...use });
  const a = await ctxA.newPage();
  const b = await (await browser.newContext({ ...use })).newPage();
  await newUser(a, "Offa");
  await newUser(b, "Lina", "Female");
  const id = await lockedOuting(a, b);

  await a.goto(`/outings/${id}`);
  await a.evaluate(() => navigator.serviceWorker.ready);
  await a.reload(); // now controlled by the SW: page, chunks and API response get cached
  await expect(a.getByRole("heading", { name: "Locked in" })).toBeVisible();

  await ctxA.setOffline(true);
  await a.reload();
  await expect(a.getByRole("heading", { name: "Locked in" })).toBeVisible();
  await expect(a.getByText(/Offline — showing the last saved plan/)).toBeVisible();
  await ctxA.setOffline(false);
});

test("install prompt appears after the first outing and can be dismissed", async ({ browser }) => {
  const use = test.info().project.use;
  const a = await (await browser.newContext({ ...use })).newPage();
  const b = await (await browser.newContext({ ...use })).newPage();
  await newUser(a, "Inst");
  await newUser(b, "Allie");
  await expect(a.getByText(/Install Waypoint|Add to Home Screen/)).toHaveCount(0);
  await lockedOuting(a, b);
  await a.goto("/groups");
  await expect(a.getByRole("button", { name: "Not now" })).toBeVisible();
  await a.getByRole("button", { name: "Not now" }).click();
  await a.reload();
  await expect(a.getByRole("button", { name: "Not now" })).toHaveCount(0);
});
