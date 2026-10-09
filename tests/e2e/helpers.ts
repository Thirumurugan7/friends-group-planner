import { expect, type Page } from "@playwright/test";

export const randomPhone = () => `9${Math.floor(100000000 + Math.random() * 899999999)}`;

export async function signIn(page: Page, phone: string) {
  // Keep any ?next= the app already redirected us with.
  if (!new URL(page.url()).pathname.startsWith("/signin")) await page.goto("/signin");
  await page.getByLabel("Mobile number").fill(phone);
  await page.getByRole("button", { name: "Send code" }).click();
  await page.getByLabel("Code").fill("1234");
  await page.getByRole("button", { name: "Verify" }).click();
}

async function pickPlace(page: Page, which: "Home" | "Work", query: string) {
  await page.getByLabel(`${which} search`).fill(query);
  await page.getByRole("button", { name: new RegExp(`^${query}`) }).first().click();
  await expect(page.getByText(new RegExp(`${which}: ${query}`))).toBeVisible();
}

export async function fillProfile(
  page: Page,
  p: { name: string; email: string; gender: "Male" | "Female" | "Non-binary" | "Prefer not to say"; home?: string; work?: string }
) {
  await page.getByLabel("Name", { exact: true }).fill(p.name);
  await page.getByLabel("Email", { exact: true }).fill(p.email);
  await page.getByLabel("Age", { exact: true }).fill("27");
  await page.getByRole("radio", { name: p.gender, exact: true }).check({ force: true });
  await pickPlace(page, "Home", p.home ?? "Indiranagar");
  await pickPlace(page, "Work", p.work ?? "Koramangala");
  await page.getByRole("button", { name: "Save profile" }).click();
}

/** Signs in a brand-new user and completes onboarding. */
export async function newUser(page: Page, name: string, gender: "Male" | "Female" = "Male", next?: string | RegExp) {
  await signIn(page, randomPhone());
  await expect(page).toHaveURL(/\/onboarding/);
  await fillProfile(page, { name, gender, email: `${name.toLowerCase()}${Date.now()}@example.com` });
  await expect(page).toHaveURL(next ?? /\/groups/);
}
