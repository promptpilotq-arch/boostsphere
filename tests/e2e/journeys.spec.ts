import { expect, test, type Page } from "@playwright/test";

// Requires: seeded DB (npm run db:seed), PAYMENT_SANDBOX_ENABLED=true, sandbox in PAYMENT_PROVIDERS.
const PASSWORD = process.env.SEED_PASSWORD ?? "DevOnly-Passw0rd";

// Dev-mode pages hydrate slowly; wait until client components are interactive before clicking them.
const ready = (page: Page) => page.waitForLoadState("networkidle");

async function login(page: Page, email: string, next = "/dashboard") {
  await page.goto(`/login?next=${encodeURIComponent(next)}`);
  await ready(page);
  await page.getByLabel("Email").fill(email);
  await page.getByLabel("Password", { exact: true }).fill(PASSWORD);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL((u) => u.pathname === next.split("?")[0]);
  await ready(page);
}

async function payWithSandbox(page: Page, outcome: "successful" | "declined") {
  await page.waitForURL(/\/checkout\//);
  await ready(page);
  await page.getByLabel(/Sandbox/).check();
  await page.getByRole("button", { name: /^Pay / }).click();
  await page.waitForURL(/\/pay\/sandbox\//);
  await ready(page);
  await page.getByRole("button", { name: `Simulate ${outcome} payment` }).click();
  await page.waitForURL(/\/checkout\/return/);
}

test("guest can browse platforms, services and the marketplace", async ({ page }) => {
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("Grow Your Social Presence");
  await page.goto("/platforms/youtube");
  await expect(page.getByRole("heading", { name: "YouTube services" })).toBeVisible();
  await page.goto("/services?q=consultation");
  await expect(page.locator("p[aria-live=polite]")).toContainText("service");
  await page.goto("/marketplace");
  await expect(page.getByText("not a licensed escrow service", { exact: false })).toBeVisible();
});

test("customer orders a service and pays with the sandbox provider", async ({ page }) => {
  await login(page, "customer@boostsphere.test", "/services/tiktok-content-promotion");
  await page.getByLabel(/Link to the public TikTok post/).fill("https://www.tiktok.com/@demo/video/123");
  await page.getByLabel(/Primary audience location/).selectOption("Nigeria");
  await page.getByRole("checkbox").last().check();
  await expect(page.getByRole("button", { name: "Continue to payment" })).toBeEnabled();
  await page.getByRole("button", { name: "Continue to payment" }).click();
  await payWithSandbox(page, "successful");
  await expect(page.getByRole("heading", { name: "Payment confirmed" })).toBeVisible();
  await page.getByRole("link", { name: "View details" }).click();
  await expect(page.getByText("Payment confirmed").first()).toBeVisible();
});

test("declined sandbox payment leaves the order unpaid", async ({ page }) => {
  await login(page, "customer@boostsphere.test", "/services/x-profile-optimization");
  await page.getByLabel(/Public X profile URL/).fill("https://x.com/demo");
  await page.getByRole("checkbox").last().check();
  await expect(page.getByRole("button", { name: "Continue to payment" })).toBeEnabled();
  await page.getByRole("button", { name: "Continue to payment" }).click();
  await payWithSandbox(page, "declined");
  await expect(page.getByRole("heading", { name: "Payment not completed" })).toBeVisible();
});

test("customers are kept out of the admin area", async ({ page }) => {
  await login(page, "customer@boostsphere.test");
  await page.goto("/admin");
  await expect(page).toHaveURL(/\/dashboard\?denied=1/);
});

test("admin can pause and republish a service", async ({ page }) => {
  await login(page, "admin@boostsphere.test", "/admin/services");
  const row = page.getByRole("row", { name: /Pinterest Profile Optimization/ });
  await row.getByRole("button", { name: "Pause" }).click();
  await expect(row.getByText("Paused")).toBeVisible();
  await row.getByRole("button", { name: "Publish" }).click();
  await expect(row.getByText("Published")).toBeVisible();
});
