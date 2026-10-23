import { expect, test } from "@playwright/test";

test("unavailable summary stays unknown in coverage and usage and retries", async ({ page }) => {
  let fail = true;
  await page.route("**/api/data?resource=summary*", async (route) => {
    if (fail)
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: '{"error":"Summary unavailable"}',
      });
    else await route.continue();
  });
  await page.goto("/?project=demo-quoli&session=session-cache&view=coverage");
  await expect(page.getByRole("heading", { name: "Capture coverage", exact: true })).toBeVisible();
  await expect(page.getByText("Capture count unavailable", { exact: true })).toBeVisible();
  await expect(page.getByText("No snapshots captured", { exact: true })).toHaveCount(0);
  await expect(page.getByText(/Live Claude Code capture remains upcoming/)).toHaveCount(0);
  await page.getByRole("tab", { name: "Usage", exact: true }).click();
  await expect(
    page.getByRole("status").filter({ hasText: "Reported usage unavailable" }),
  ).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Retry summary", exact: true }).click();
  await expect(page.locator(".usage-table")).toBeVisible();
  await page.getByRole("tab", { name: "Coverage", exact: true }).click();
  await expect(page.getByText("2 snapshots captured", { exact: true })).toBeVisible();
});

test("review does not claim no checks while summary is unavailable; reconciliation is optional", async ({
  page,
}) => {
  await page.route("**/api/data?resource=summary*", (route) =>
    route.fulfill({
      status: 503,
      contentType: "application/json",
      body: '{"error":"Summary unavailable"}',
    }),
  );
  await page.goto("/?project=demo-quoli&session=session-cache&view=session");
  await expect(page.locator(".session-document")).toBeVisible();
  await expect(page.getByText("— recorded checks", { exact: true })).toBeVisible();
  await expect(page.getByText(/No command result is recorded for this session/)).toHaveCount(0);
  await expect(page.locator(".reconciliation-disclosure")).not.toHaveAttribute("open", "");
});

test("settings retries failed loads, reports write failures and confirms retention", async ({
  page,
}) => {
  let failLoad = true;
  let failSave = false;
  await page.route("**/api/settings?*", async (route) => {
    const fail = route.request().method() === "GET" ? failLoad : failSave;
    if (fail)
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: '{"error":"Storage unavailable"}',
      });
    else await route.continue();
  });
  await page.goto("/?view=settings");
  await expect(page.getByRole("button", { name: "Retry settings" })).toBeVisible();
  failLoad = false;
  await page.getByRole("button", { name: "Retry settings" }).click();
  await expect(page.getByRole("heading", { name: "Project settings", exact: true })).toBeVisible();
  failSave = true;
  await page.getByRole("button", { name: "Pause capture" }).click();
  await expect(
    page.getByRole("alert").filter({ hasText: "Change could not be saved" }),
  ).toBeVisible();
  await expect(page.getByRole("button", { name: "Pause capture" })).toBeEnabled();
  failSave = false;
  await page.getByRole("button", { name: "Pause capture" }).click();
  await expect(page.locator(".settings-save-state")).toHaveText("Changes saved on this machine.");
  await page.getByRole("button", { name: "Resume capture" }).click();
  const previousRetention = await page
    .getByRole("combobox", { name: "Keep evidence for" })
    .inputValue();
  await page.getByRole("combobox", { name: "Keep evidence for" }).selectOption("7");
  await expect(page.locator(".retention-confirmation")).toContainText("cannot be recovered");
  await expect(page.locator(".settings-section-heading").filter({ hasText: "7 days" })).toHaveCount(
    0,
  );
  await page.getByRole("button", { name: "Cancel retention change" }).click();
  await expect(page.getByRole("combobox", { name: "Keep evidence for" })).toHaveValue(
    previousRetention,
  );
});

test("map failure offers an in-place retry", async ({ page }) => {
  let fail = true;
  await page.route("**/api/map", async (route) => {
    if (fail)
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: '{"error":"Unavailable"}',
      });
    else await route.continue();
  });
  await page.goto("/?project=demo-quoli&session=session-cache&view=map");
  await expect(page.getByRole("button", { name: "Retry map" })).toBeVisible();
  fail = false;
  await page.getByRole("button", { name: "Retry map" }).click();
  await expect(page.getByRole("region", { name: "Change map", exact: true })).toBeVisible();
});
