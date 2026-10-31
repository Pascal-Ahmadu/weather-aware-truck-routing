import { expect, test } from "@playwright/test";

import { mockApi } from "./fixtures";

test.beforeEach(async ({ page }) => {
  await mockApi(page);
});

test("plans a trip, explains the recommendation and shows it on the map", async ({ page }) => {
  await page.goto("/");

  await page.getByRole("button", { name: "Denver → Salt Lake City" }).click();
  await expect(page.locator(".planning")).toBeVisible();

  const dialog = page.getByRole("dialog");
  await expect(dialog).toBeVisible();
  await expect(dialog.getByText("2 routes found")).toBeVisible();
  await expect(dialog.getByText(/truck routing at 75,000 lb gross/)).toBeVisible();

  const cards = dialog.locator(".route-card");
  await expect(cards).toHaveCount(2);
  await expect(cards.nth(0)).toContainText("Recommended");
  await expect(cards.nth(0).locator(".route-why")).toContainText("No Severe or High weather at your ETAs");
  // The faster route is ranked second because of its Severe miles (2 segments × 96 mi).
  await expect(cards.nth(1)).toContainText("9h");
  await expect(cards.nth(1).locator("dd").nth(1)).toHaveText("192");

  await cards.nth(1).click();
  await expect(dialog).toBeHidden();
  await expect(page.locator(".summary")).toContainText("Recommended");
  await expect(page.locator(".pin-icon")).toHaveCount(2);

  // Slider scrubs without any further API requests.
  const apiCalls: string[] = [];
  page.on("request", (request) => {
    if (request.url().includes("/api/")) apiCalls.push(request.url());
  });
  const slider = page.getByRole("slider", { name: /forecast hour/i });
  await slider.fill("24");
  await expect(page.locator(".slider-value")).toContainText("+24h");
  await expect(page.locator(".spark")).toHaveCount(49);
  expect(apiCalls).toHaveLength(0);

  // Reopen the list from the summary.
  await page.getByRole("button", { name: /all 2 routes/i }).click();
  await expect(dialog).toBeVisible();
  await expect(dialog.locator(".route-card[aria-pressed='true']")).toContainText("#2");
});

test("location fields offer suggestions and submit picked coordinates", async ({ page }) => {
  let planBody: Record<string, unknown> | null = null;
  await page.route("**/api/trips/plan/", async (routeHandler) => {
    planBody = routeHandler.request().postDataJSON();
    await routeHandler.fulfill({ json: (await import("./fixtures")).PLAN_FIXTURE });
  });
  await page.goto("/");

  const origin = page.getByLabel("Origin");
  await origin.fill("");
  await origin.pressSequentially("Chey", { delay: 30 });
  await page.getByRole("option", { name: /Cheyenne, Wyoming/ }).click();
  await expect(origin).toHaveValue("Cheyenne, Wyoming, United States");

  await page.getByRole("button", { name: /find safest route/i }).click();
  await expect(page.getByRole("dialog")).toBeVisible();
  expect(planBody).toMatchObject({
    origin: "Cheyenne, Wyoming, United States",
    origin_coords: [41.14, -104.82],
    destination_coords: null,
    checkpoint_interval_miles: 25,
  });
});

test("validation blocks a bad submission before any request", async ({ page }) => {
  let requests = 0;
  await page.route("**/api/trips/plan/", (routeHandler) => {
    requests += 1;
    return routeHandler.abort();
  });
  await page.goto("/");

  await page.getByLabel("Load weight (lb)").fill("");
  await page.getByRole("button", { name: /find safest route/i }).click();
  await expect(page.getByText("Enter the load weight.")).toBeVisible();
  expect(requests).toBe(0);
});

test.describe("phone layout", () => {
  test.use({ viewport: { width: 390, height: 844 } });

  test("map first, form in a sheet, legend in the slider panel", async ({ page }) => {
    await page.goto("/");
    await expect(page.locator(".sidebar")).toHaveCount(0);
    await expect(page.locator(".map")).toBeVisible();

    await page.getByRole("button", { name: /plan a trip/i }).click();
    const sheet = page.locator(".dialog-panel.sheet");
    await expect(sheet).toBeVisible();
    await sheet.getByRole("button", { name: /find safest route/i }).click();
    await expect(sheet).toBeHidden();

    const results = page.locator(".dialog-panel-wide");
    await expect(results).toBeVisible();
    await results.locator(".route-card").first().click();
    await expect(results).toBeHidden();

    await expect(page.locator(".risk-legend.compact")).toBeVisible();
    await expect(page.locator(".mobile-bar .summary")).toBeVisible();
    const overflow = await page.evaluate(() => document.documentElement.scrollHeight - window.innerHeight);
    expect(overflow).toBe(0);
  });
});
