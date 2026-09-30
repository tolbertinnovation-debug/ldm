import { expect, test } from "@playwright/test";

// Requires a seeded database (npm run db:seed).
test("customer orders for pickup, then staff confirm and complete it", async ({ page, browser }, info) => {
  const phone = `0775${String(Date.now()).slice(-6)}`;

  // --- Customer -----------------------------------------------------------
  await page.goto("/");
  await expect(page.getByRole("heading", { level: 1 })).toContainText("straight from our farm");
  await page.goto("/product/farm-fresh-eggs-tray-of-30");
  await page.getByRole("button", { name: /add to cart/i }).click();
  await expect(page.getByText("Added to cart")).toBeVisible();

  await page.goto("/cart");
  await expect(page.getByText("Farm Fresh Eggs")).toBeVisible();
  await page.getByRole("link", { name: /checkout/i }).click();

  await page.fill('input[name="name"]', "E2E Tester");
  await page.fill('input[name="phone"]', phone);
  await page.getByRole("button", { name: /pickup/i }).first().click();
  await page.getByRole("button", { name: /place order/i }).click();

  await expect(page).toHaveURL(/\/track\/.+placed=1/);
  await expect(page.getByText(/your order is in/i)).toBeVisible();
  const number = (await page.locator("h1").first().textContent())!.trim();
  expect(number).toMatch(/^REAP-\d+$/);

  // --- Staff (fresh session) ------------------------------------------------
  const staff = await browser.newPage({ viewport: info.project.name === "mobile" ? { width: 412, height: 915 } : undefined });
  await staff.goto("/login");
  await staff.getByRole("button", { name: "Password" }).click();
  await staff.fill('input[name="identifier"]', "owner@reap.farm");
  await staff.fill('input[name="password"]', process.env.SEED_ADMIN_PASSWORD ?? "ReapFarm#2026");
  await staff.getByRole("button", { name: "Sign in" }).click();
  await staff.waitForURL("**/admin");

  await staff.goto(`/admin/orders?q=${number}`);
  await staff.getByRole("link", { name: number }).click();
  await staff.getByRole("button", { name: "Confirm order" }).click();
  await expect(staff.getByText(/updated/i).first()).toBeVisible();
  await staff.getByRole("button", { name: "Ready for pickup" }).click();
  await expect(staff.getByRole("button", { name: "Mark picked up" })).toBeVisible();
  await staff.getByRole("button", { name: "Record payment" }).click();
  await expect(staff.getByText("Payment recorded")).toBeVisible();
  await staff.getByRole("button", { name: "Mark picked up" }).click();
  await expect(staff.getByText("Completed").first()).toBeVisible();

  // --- Customer sees the result ------------------------------------------------
  await page.reload();
  await expect(page.getByText("Picked up").first()).toBeVisible();
  await expect(page.getByText("Paid").first()).toBeVisible();
});

test("security headers and access control", async ({ page, request }) => {
  const res = await request.get("/");
  const csp = res.headers()["content-security-policy"] ?? "";
  expect(csp).toContain("frame-ancestors 'none'");
  expect(csp).toMatch(/script-src 'self' 'nonce-/);
  expect(res.headers()["x-content-type-options"]).toBe("nosniff");

  await page.goto("/admin");
  await expect(page).toHaveURL(/\/login\?next=%2Fadmin/);
  const exp = await request.get("/api/admin/export/orders");
  expect(exp.status()).toBe(401);
  const cron = await request.get("/api/cron/jobs");
  expect(cron.status()).toBe(401);
});
