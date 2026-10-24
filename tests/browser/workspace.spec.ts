import { expect, test } from "@playwright/test";

test("workspace destinations select exactly once and overview links open gaps", async ({
  page,
}) => {
  await page.goto("/");
  const nav = page.getByRole("navigation", { name: "Workspace", exact: true });
  await nav.getByRole("button", { name: "Settings", exact: true }).click();
  await expect(nav.locator('[aria-current="page"]')).toHaveCount(1);
  await expect(nav.locator('[aria-current="page"]')).toHaveText("Settings");
  await nav.getByRole("button", { name: "Project overview", exact: true }).click();
  await page.locator(".queue-item").first().click();
  await expect(page.getByRole("button", { name: /^Gaps/ })).toHaveAttribute("aria-pressed", "true");
  await expect(page.locator(".event-row").first()).toBeVisible();
  await page.goBack();
  await expect(
    page.getByRole("heading", { name: "Workspace overview", exact: true }),
  ).toBeVisible();
});

test("connection guidance is inert, defaults to metadata, and explains explicit code consent", async ({
  page,
  context,
}) => {
  await context.grantPermissions(["clipboard-read", "clipboard-write"]);
  await page.goto("/");
  await expect(page.locator(".work-session").first()).toBeVisible();
  const retainedCount = await page.locator(".work-session").count();
  await page.locator(".connection-guide > summary").click();
  await expect(page.locator(".connection-code")).toContainText("pnpm connect /path/to/repository");
  await expect(page.locator(".connection-code")).not.toContainText("--capture-code");
  await page.getByRole("checkbox", { name: /Include file contents/ }).check();
  await page.getByRole("combobox", { name: "Quoli installation" }).selectOption("installed");
  await page.getByRole("button", { name: "Copy connection command" }).click();
  expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
    "quoli connect /path/to/repository --capture-code",
  );
  await expect(page.locator(".connection-command").getByRole("status")).toContainText(
    "Run it in your terminal",
  );
  await page.getByRole("textbox", { name: "Search sessions" }).fill("cache");
  await page.getByRole("button", { name: "Clear session search" }).click();
  await expect(page.locator(".work-session")).toHaveCount(retainedCount);
  await page.setViewportSize({ width: 320, height: 844 });
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
});

test("overview uses bounded body-free counts and recovers from unavailable counts", async ({
  page,
}) => {
  let fail = true;
  await page.route("**/api/data?resource=session-counts*", async (route) => {
    if (fail)
      await route.fulfill({
        status: 503,
        contentType: "application/json",
        body: '{"error":"Unavailable"}',
      });
    else await route.continue();
  });
  await page.goto("/?view=overview");
  await expect(page.getByRole("button", { name: "Retry summaries" })).toBeVisible();
  await expect(page.locator(".ledger-gap strong")).toHaveText("—");
  fail = false;
  await page.getByRole("button", { name: "Retry summaries" }).click();
  await expect(page.locator(".ledger-gap strong")).toHaveText("4");
});

test("session pages declare partial totals, recover errors and open older evidence", async ({
  page,
}) => {
  let failOlder = true;
  let missingCounts = true;
  const recent = Array.from({ length: 50 }, (_, i) => ({
    id: `recent-${i}`,
    title: `Synthetic session ${i}`,
    count: 1,
    ended: false,
    startedAt: null,
  }));
  const older = {
    id: "session-cache",
    title: "Older retained session",
    count: 20,
    ended: true,
    startedAt: null,
  };
  await page.route("**/api/data?resource=sessions&**", async (route) => {
    const cursor = new URL(route.request().url()).searchParams.get("cursor");
    if (cursor !== "0" && failOlder)
      return route.fulfill({
        status: 503,
        json: { error: "Session page unavailable. Retry to reconnect." },
      });
    await route.fulfill({
      json: {
        sessions: cursor === "0" ? recent : [older],
        total: 51,
        nextCursor: cursor === "0" ? 100 : null,
      },
    });
  });
  await page.route("**/api/data?resource=session-counts*", (route) =>
    route.fulfill({
      json: missingCounts
        ? {}
        : Object.fromEntries(
            [...recent, older].map((s) => [s.id, { kindCounts: { prompt: s.count } }]),
          ),
    }),
  );
  await page.goto("/");
  const pages = page.getByRole("navigation", { name: "Session pages" });
  await expect(pages).toContainText("50 of 51 retained sessions");
  await expect(pages).toContainText("cover this page only");
  await expect(pages.getByRole("button", { name: "Newer sessions" })).toBeDisabled();
  await expect(page.getByRole("button", { name: "Needs review —" })).toBeVisible();
  missingCounts = false;
  await page.getByRole("button", { name: "Retry counts" }).click();
  await expect(page.getByRole("button", { name: "Needs review 0", exact: true })).toBeVisible();
  await page.screenshot({ path: "/tmp/quoli62-pages-desktop.png" });
  await pages.getByRole("button", { name: "Older sessions" }).click();
  await expect(page.locator(".error-notice")).toContainText("Session page unavailable");
  failOlder = false;
  await page.getByRole("button", { name: "Retry", exact: true }).click();
  await expect(pages).toContainText("1 of 51 retained sessions");
  await expect(pages.getByRole("button", { name: "Older sessions" })).toBeDisabled();
  await page.setViewportSize({ width: 375, height: 844 });
  await expect(page.getByRole("button", { name: "Older retained session" })).toBeVisible();
  expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(true);
  await page.screenshot({ path: "/tmp/quoli62-pages-mobile.png" });
  await page.getByRole("button", { name: "Older retained session" }).click();
  await expect(page.locator(".brief-layout")).toBeVisible();
  await page.getByRole("button", { name: "All sessions", exact: true }).click();
  await pages.getByRole("button", { name: "Newer sessions" }).click();
  await expect(pages).toContainText("50 of 51 retained sessions");
});
