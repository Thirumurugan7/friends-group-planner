import { test, expect, type Page } from "@playwright/test";
import { newUser } from "./helpers";
import { db, isoDay } from "./db";

async function groupWithFriend(browser: import("@playwright/test").Browser) {
  const use = test.info().project.use;
  const a = await (await browser.newContext({ ...use })).newPage();
  await newUser(a, "Meera", "Female");
  await a.getByRole("button", { name: "New group" }).click();
  await a.getByLabel("Group name").fill("Beach Crew");
  await a.getByRole("button", { name: "Create group" }).click();
  const invite = await a.getByTestId("invite-link").getAttribute("data-path");
  const b = await (await browser.newContext({ ...use })).newPage();
  await b.goto(invite!);
  await expect(b).toHaveURL(/\/signin/);
  await newUser(b, "Kiran", "Male", /\/join\//);
  await b.getByRole("button", { name: "Join Beach Crew" }).click();
  await expect(b.getByRole("heading", { name: "Beach Crew" })).toBeVisible();
  await a.reload();
  return { a, b };
}

async function markFree(page: Page, url: string, day: string) {
  await page.goto(url);
  await page.getByRole("button", { name: `Free on ${day}` }).click();
  await page.getByRole("button", { name: "Save my dates" }).click();
  await expect(page.getByRole("status")).toHaveText(/saved/i);
}

test("full outing: dates → options → vote → lock → dropout → showtime → check-in → expenses", async ({ browser }) => {
  const { a, b } = await groupWithFriend(browser);
  const day = isoDay(2);

  // Create
  await a.getByRole("link", { name: "Plan an outing" }).click();
  await a.getByLabel("Outing name").fill("Beach day");
  await a.getByLabel("From", { exact: true }).fill(isoDay(1));
  await a.getByLabel("To", { exact: true }).fill(isoDay(5));
  await a.getByRole("button", { name: "Create outing" }).click();
  await expect(a).toHaveURL(/\/outings\/[a-z0-9]+$/);
  const url = new URL(a.url()).pathname;
  const outingId = url.split("/").pop()!;

  // Availability + pick date
  await markFree(a, url, day);
  await markFree(b, url, day);
  await a.reload();
  await a.getByRole("button", { name: `Pick ${day}` }).click();
  await a.getByRole("button", { name: "Generate plans" }).click();

  // Vote + RSVP
  await expect(a.getByRole("button", { name: "Vote for Easy-going day" })).toBeVisible({ timeout: 30_000 });
  for (const p of [a, b]) {
    await p.goto(url);
    await p.getByRole("button", { name: "Vote for Easy-going day" }).click();
    await p.getByRole("button", { name: "Going", exact: true }).click();
    await expect(p.getByRole("button", { name: "Going", exact: true })).toHaveAttribute("aria-pressed", "true");
    await expect(p.getByRole("button", { name: "Vote for Easy-going day" })).toHaveAttribute("aria-pressed", "true");
  }
  await a.reload();
  await a.getByRole("button", { name: "Lock plan" }).click();
  await expect(a.getByRole("heading", { name: "Locked in" })).toBeVisible();

  // Showtime override on the cinema stop
  await a.getByRole("button", { name: "Set show time" }).click();
  await a.getByLabel("Show time").fill("18:15");
  await a.getByRole("button", { name: "Save show time" }).click();
  await expect(a.getByText("18:15")).toBeVisible();

  // Friend drops out
  await b.reload();
  await b.getByRole("button", { name: "I can't make it" }).click();
  await b.getByLabel("Reason (optional)").fill("Work came up");
  await b.getByRole("button", { name: "Cancel my spot" }).click();
  await a.reload();
  await expect(a.getByText(/Kiran dropped out/)).toBeVisible();

  // Move the day into the past, then check in
  await db.outing.update({ where: { id: outingId }, data: { date: isoDay(-2) } });
  await a.reload();
  await a.getByRole("button", { name: "Yes, I went" }).click();
  await expect(a.getByText("✅ Happened").first()).toBeVisible();

  // Expenses + settle-up
  await a.getByRole("button", { name: "Add expense" }).click();
  await a.getByLabel("Amount (₹)").fill("600");
  await a.getByLabel("What for").fill("Lunch");
  await a.getByRole("checkbox", { name: "Split with Kiran" }).check();
  await a.getByRole("button", { name: "Save expense" }).click();
  await expect(a.getByText("Kiran pays Meera ₹300")).toBeVisible();
});

test("organiser can cancel an outing", async ({ browser }) => {
  const { a } = await groupWithFriend(browser);
  await a.getByRole("link", { name: "Plan an outing" }).click();
  await a.getByLabel("Outing name").fill("Movie night");
  await a.getByLabel("From", { exact: true }).fill(isoDay(1));
  await a.getByLabel("To", { exact: true }).fill(isoDay(2));
  await a.getByRole("button", { name: "Create outing" }).click();
  await a.getByRole("button", { name: "Cancel outing" }).click();
  await a.getByRole("button", { name: "Cancel this outing" }).click();
  await expect(a.getByText("🚫 Cancelled").first()).toBeVisible();
});
