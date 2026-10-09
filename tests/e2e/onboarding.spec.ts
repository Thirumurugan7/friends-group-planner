import { test, expect } from "@playwright/test";
import { fillProfile, randomPhone, signIn, newUser } from "./helpers";

test("new user signs in with OTP and completes onboarding", async ({ page }) => {
  await newUser(page, "Asha", "Female");
});

test("profile needs gender and email before saving", async ({ page }) => {
  await signIn(page, randomPhone());
  await expect(page).toHaveURL(/\/onboarding/);
  await page.getByLabel("Name", { exact: true }).fill("No Gender");
  await page.getByRole("button", { name: "Save profile" }).click();
  // Scoped to <main>: Next's route announcer is also role=alert.
  await expect(page.locator("main").getByRole("alert")).toBeVisible();
  await expect(page).toHaveURL(/\/onboarding/);
});

test("female users see the 23:00 default hint", async ({ page }) => {
  await signIn(page, randomPhone());
  await page.getByRole("radio", { name: "Female", exact: true }).check({ force: true });
  await expect(page.getByText(/home by 23:00/i)).toBeVisible();
});

test("returning users skip onboarding", async ({ page, context }) => {
  const phone = randomPhone();
  await signIn(page, phone);
  await fillProfile(page, { name: "Ravi", gender: "Male", email: `ravi${Date.now()}@example.com` });
  await expect(page).toHaveURL(/\/groups/);
  await context.clearCookies();
  await signIn(page, phone);
  await expect(page).toHaveURL(/\/groups/);
});

test("sign-in screen offers Google", async ({ page }) => {
  await page.goto("/signin");
  await expect(page.getByRole("link", { name: "Continue with Google" })).toHaveAttribute("href", "/api/auth/google");
});

test("sign-in explains a Google email that already has an account", async ({ page }) => {
  await page.goto("/signin?error=google-email");
  await expect(page.locator("main").getByRole("alert")).toContainText(
    "That email is already used by an account. Sign in with your phone, then link Google from your profile."
  );
});
