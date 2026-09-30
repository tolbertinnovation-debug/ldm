import { expect, test, type Page } from "@playwright/test";

test.describe.configure({ mode: "serial" });
test.beforeEach(({}, info) => test.skip(info.project.name !== "desktop", "Admin flows run once, on desktop"));

async function login(page: Page, email: string, password: string, landing = "**/admin") {
  await page.goto("/login");
  await page.getByRole("button", { name: "Password" }).click();
  await page.fill('input[name="identifier"]', email);
  await page.fill('input[name="password"]', password);
  await page.getByRole("button", { name: "Sign in" }).click();
  await page.waitForURL(landing);
}

test("POS delivery order → invoice → driver delivers and collects cash", async ({ page, browser }) => {
  await login(page, "owner@reap.farm", process.env.SEED_ADMIN_PASSWORD ?? "ReapFarm#2026");
  await page.goto("/admin/pos");
  await page.getByRole("button", { name: /Farm Fresh Eggs/ }).click();
  await page.getByRole("button", { name: /Farm Fresh Eggs/ }).click();
  await page.fill('input[name="name"]', "POS Customer");
  await page.fill('input[name="phone"]', `0886${String(Date.now()).slice(-6)}`);
  await page.getByRole("button", { name: "Delivery", exact: true }).click();
  await page.selectOption('select[name="deliveryZoneId"]', { index: 1 });
  await page.fill('input[name="line1"]', "5 Tubman Boulevard");
  await page.getByRole("button", { name: "Create order" }).click();
  await page.waitForURL(/\/admin\/orders\/[0-9a-f-]{36}$/);
  const number = (await page.locator("h1").textContent())!.match(/REAP-\d+/)![0];

  // Invoice (server action that redirects)
  await page.getByRole("button", { name: "Create invoice" }).click();
  await page.waitForURL(/\/admin\/invoices\/[0-9a-f-]{36}$/);
  await expect(page.locator("h1")).toContainText("INV-");
  await page.goBack();

  // Assign the driver
  await page.selectOption('select[name="driverId"]', { label: "Varney Toe" });
  await page.getByRole("button", { name: "Assign" }).click();
  await expect(page.getByText("Assigned to Varney Toe").first()).toBeVisible();

  // Driver app
  const driver = await browser.newPage();
  await login(driver, "driver1@reap.farm", "ReapStaff#2026", "**/driver");
  const card = driver.locator("div.card", { hasText: number });
  await card.getByRole("button", { name: /Picked up/ }).click();
  await expect(driver.getByText(/On the way/)).toBeVisible();
  await driver.locator("div.card", { hasText: number }).getByRole("button", { name: "Delivered" }).click();
  await driver.fill('input[name="recipientName"]', "Front desk");
  await driver.getByRole("button", { name: "Confirm delivered" }).click();
  await expect(driver.getByText(/Delivered! Great work/)).toBeVisible();

  await page.reload();
  await expect(page.getByText("Completed").first()).toBeVisible();
  await expect(page.getByText("Paid", { exact: true }).first()).toBeVisible();
});

test("create a product, a promotion, a broadcast and a social post", async ({ page }) => {
  await login(page, "owner@reap.farm", process.env.SEED_ADMIN_PASSWORD ?? "ReapFarm#2026");
  const name = `Test Smoked Fish ${Date.now()}`;
  await page.goto("/admin/products/new");
  await page.fill('input[name="name"]', name);
  await page.fill('input[name="price"]', "6.50");
  await page.fill('input[name="openingStock"]', "12");
  await page.getByRole("button", { name: "Create product" }).click();
  await page.waitForURL(/\/admin\/products\/[0-9a-f-]{36}$/);
  await expect(page.getByText("In stock: 12 items")).toBeVisible();

  const code = `E2E${String(Date.now()).slice(-5)}`;
  await page.goto("/admin/promotions");
  await page.fill('input[name="name"]', "E2E promo");
  await page.fill('input[name="code"]', code);
  await page.fill('input[name="value"]', "5");
  await page.getByRole("button", { name: "Create promotion" }).click();
  await expect(page.getByText(`Promo ${code} saved`)).toBeVisible();

  await page.goto("/admin/broadcasts");
  await page.fill('input[name="name"]', "E2E draft");
  await page.getByRole("button", { name: "Save draft" }).click();
  await expect(page.getByText("Draft saved")).toBeVisible();

  await page.goto("/admin/social");
  await page.fill('textarea[name="content"]', "E2E post: fresh tilapia today!");
  await page.getByRole("button", { name: "Publish" }).first().click();
  await expect(page.getByText("Publishing…")).toBeVisible();
});

test("a driver cannot open the admin dashboard", async ({ page }) => {
  await login(page, "driver1@reap.farm", "ReapStaff#2026", "**/driver");
  await page.goto("/admin/finance");
  await expect(page).toHaveURL(/\/driver/);
});
