import { expect, test } from "@playwright/test";

test.describe("Traceframe Landing Page", () => {
  test("landing page renders hero headline, flight recorder rig, and quickstart snippet", async ({
    page,
  }) => {
    await page.goto("/landing");

    // Headline and subtext
    await expect(
      page.getByRole("heading", {
        name: "Stop guessing what your coding agent touched. See the receipts.",
      }),
    ).toBeVisible();

    // Flight recorder hero plate
    await expect(page.locator(".flight-recorder-wrap")).toBeVisible();
    await expect(page.locator(".meta-tag")).toContainText("INSTRUMENT TF-01");
    await expect(page.locator(".iso-svg.flight-svg")).toBeVisible();

    // Quickstart snippet
    await expect(page.locator(".terminal-cmd")).toContainText(
      "curl -fsSL https://traceframe.dev/install.sh | sh",
    );
  });

  test("interactive flight recorder steps through agent audit stages and updates telemetry", async ({
    page,
  }) => {
    await page.goto("/landing");

    // Step 1 initial state
    await expect(page.locator(".meta-status-pill")).toContainText("CLAIMED ONLY");

    // Click Step 2: Tool Execution
    await page.getByRole("tab", { name: /02 \/\/ DISPATCH/i }).click();
    await expect(page.locator(".meta-status-pill")).toContainText("UNVERIFIED MUTATION");
    await expect(page.locator(".hud-val").first()).toContainText("0x3bc4..e71");

    // Click Step 3: Assertion Audit
    await page.getByRole("tab", { name: /03 \/\/ CHECK/i }).click();
    await expect(page.locator(".meta-status-pill")).toContainText("INDEPENDENT TEST PASS");

    // Click Step 4: Sealed Ledger
    await page.getByRole("tab", { name: /04 \/\/ COMMIT/i }).click();
    await expect(page.locator(".meta-status-pill")).toContainText("GROUND TRUTH RECORDED");
    await expect(page.locator(".meta-status-pill")).toHaveAttribute("data-level", "verified");
  });

  test("theme toggle toggles data-theme between dark and light", async ({ page }) => {
    await page.goto("/landing");

    const root = page.locator(".landing-root");
    await expect(root).toHaveAttribute("data-theme", "dark");

    // Click theme toggle
    await page.getByRole("button", { name: /switch to light mode/i }).click();
    await expect(root).toHaveAttribute("data-theme", "light");

    // Click back to dark mode
    await page.getByRole("button", { name: /switch to dark mode/i }).click();
    await expect(root).toHaveAttribute("data-theme", "dark");
  });

  test("workbench feature explorer switches tabs cleanly", async ({ page }) => {
    await page.goto("/landing");

    // Default tab is Session Review
    await expect(
      page.getByRole("heading", { name: "The Developer Request & Execution Receipt" }),
    ).toBeVisible();

    // Click Bounded Diffs tab
    await page.getByRole("tab", { name: /Bounded Diffs/i }).click();
    await expect(
      page.getByRole("heading", { name: "Explicit Before/After Code Snapshots" }),
    ).toBeVisible();
    await expect(page.locator(".diff-path")).toContainText(
      "packages/storage/src/migrations/004_indexes.sql",
    );

    // Click Needs Review tab
    await page.getByRole("tab", { name: /Needs Review/i }).click();
    await expect(
      page.getByRole("heading", { name: "Capture Gaps & Unverified Claims" }),
    ).toBeVisible();
    await expect(page.locator(".queue-badge.alert")).toBeVisible();
  });

  test("mobile viewport (390px) fits without horizontal overflow", async ({ page }) => {
    await page.setViewportSize({ width: 390, height: 844 });
    await page.goto("/landing");

    await expect(
      page.getByRole("heading", {
        name: "Stop guessing what your coding agent touched. See the receipts.",
      }),
    ).toBeVisible();

    const hasHorizontalOverflow = await page.evaluate(
      () => document.documentElement.scrollWidth > window.innerWidth,
    );
    expect(hasHorizontalOverflow).toBe(false);
  });
});
