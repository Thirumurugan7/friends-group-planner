import { test, expect } from "@playwright/test";
import { newUser } from "./helpers";

test("create a group, invite a friend, friend joins, admin removes them", async ({ browser }) => {
  const adminCtx = await browser.newContext({ ...test.info().project.use });
  const admin = await adminCtx.newPage();
  await newUser(admin, "Meera", "Female");

  await admin.getByRole("button", { name: "New group" }).click();
  await admin.getByLabel("Group name").fill("Weekenders");
  await admin.getByRole("button", { name: "Create group" }).click();
  await expect(admin.getByRole("heading", { name: "Weekenders" })).toBeVisible();
  const invitePath = await admin.getByTestId("invite-link").getAttribute("data-path");
  expect(invitePath).toMatch(/^\/join\//);

  const friendCtx = await browser.newContext({ ...test.info().project.use });
  const friend = await friendCtx.newPage();
  await friend.goto(invitePath!);
  await expect(friend).toHaveURL(/\/signin/);
  await newUser(friend, "Kiran", "Male", new RegExp(invitePath!.replace(/\//g, "\\/")));
  await friend.getByRole("button", { name: "Join Weekenders" }).click();
  await expect(friend.getByRole("heading", { name: "Weekenders" })).toBeVisible();
  await expect(friend.getByText("Meera")).toBeVisible();
  await expect(friend.getByRole("button", { name: /Remove/ })).toHaveCount(0);

  await admin.reload();
  await admin.getByRole("button", { name: "Remove Kiran" }).click();
  await admin.getByRole("dialog").getByRole("button", { name: "Remove" }).click();
  await expect(admin.getByText("Kiran")).toHaveCount(0);

  await friend.reload();
  await expect(friend.getByText(/not found/i)).toBeVisible();
});

test("bottom tabs navigate between sections", async ({ page }) => {
  await newUser(page, "Tabby");
  await page.getByRole("link", { name: "Outings" }).click();
  await expect(page).toHaveURL(/\/outings/);
  await page.getByRole("link", { name: "Profile" }).click();
  await expect(page).toHaveURL(/\/profile/);
  await expect(page.getByLabel("Name", { exact: true })).toHaveValue("Tabby");
  await page.getByRole("button", { name: "Sign out" }).click();
  await expect(page).toHaveURL(/\/signin/);
});

test("no horizontal scroll on the groups screen", async ({ page }) => {
  await newUser(page, "Narrow");
  const overflow = await page.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  expect(overflow).toBeLessThanOrEqual(0);
});
