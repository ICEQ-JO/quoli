import { expect, test } from "@playwright/test";

test.describe("Quoli product introduction", () => {
  test("explains the offer and opens a real local sample review", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/landing");
    await expect(page.getByRole("heading", { level: 1 })).toHaveText(
      "Your agent moved fast.See what changed.",
    );
    await expect(page.getByText("Synthetic example", { exact: true })).toBeVisible();
    await page.getByRole("link", { name: "Open the local sample" }).click();
    await expect(
      page.getByRole("heading", { name: "Developer request", exact: true }),
    ).toBeVisible();
    await expect(page.locator(".session-document")).toContainText("cache");
    expect(errors).toEqual([]);
  });

  test("example preserves the distinction between changes, process results, and unknowns", async ({
    page,
  }) => {
    await page.goto("/landing");
    await expect(page.getByRole("region", { name: "Illustrative captured diff" })).toContainText(
      "cache.entries ?? []",
    );
    const changes = page.getByRole("tab", { name: "File changes", exact: true });
    await changes.focus();
    await page.keyboard.press("ArrowRight");
    await expect(page.getByRole("tab", { name: "Recorded checks", exact: true })).toBeFocused();
    await expect(page.getByRole("tabpanel")).toContainText(
      "does not prove the whole application works",
    );
    await page.keyboard.press("End");
    await expect(page.getByRole("tab", { name: "Missing evidence", exact: true })).toHaveAttribute(
      "aria-selected",
      "true",
    );
    await expect(page.getByRole("tabpanel")).toContainText("Was the full suite run?");
    await page.keyboard.press("Tab");
    await expect(page.getByRole("tabpanel")).toBeFocused();
    await page.getByRole("tab", { name: "File changes", exact: true }).click();
    await expect(changes).toHaveAttribute("aria-selected", "true");
  });

  test("theme persists between marketing and workspace", async ({ page }) => {
    await page.goto("/landing");
    await page.getByRole("button", { name: "Switch to light mode" }).click();
    await expect(page.locator("html")).toHaveAttribute("data-theme", "light");
    await page.reload();
    await expect(page.locator(".landing-root")).toHaveAttribute("data-theme", "light");
    await page.getByRole("link", { name: "Open workspace" }).first().click();
    await expect(page.getByRole("button", { name: "Switch to dark theme" })).toBeVisible();
  });

  test("setup copy confirms success only after writing and offers recovery on denial", async ({
    page,
    context,
  }) => {
    await context.grantPermissions(["clipboard-read", "clipboard-write"]);
    await page.goto("/landing#start");
    const copy = page.getByRole("button", { name: "Copy demo commands" });
    await copy.click();
    await expect(copy).toContainText("Copied");
    expect(await page.evaluate(() => navigator.clipboard.readText())).toBe(
      "pnpm install --frozen-lockfile\npnpm demo",
    );
    await page.evaluate(() => {
      Object.defineProperty(navigator.clipboard, "writeText", {
        value: () => Promise.reject(new Error("Denied")),
      });
    });
    await copy.click();
    await expect(page.getByRole("status")).toContainText(
      "Couldn’t copy. Select the commands above",
    );
    await expect(copy).toContainText("Copy");
  });

  for (const width of [320, 390, 768, 1440]) {
    test(`complete landing and example fit at ${width}px with reduced motion`, async ({ page }) => {
      await page.setViewportSize({ width, height: 900 });
      await page.emulateMedia({ reducedMotion: "reduce" });
      await page.goto("/landing");
      await page.keyboard.press("Tab");
      await expect(page.getByRole("link", { name: "Skip to content" })).toBeFocused();
      expect(
        await page
          .locator(".q-example")
          .evaluate((element) => getComputedStyle(element).animationName),
      ).toBe("none");
      for (const name of ["File changes", "Recorded checks", "Missing evidence"]) {
        await page.getByRole("tab", { name, exact: true }).click();
        await expect(page.getByRole("tabpanel")).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
      }
      await page.getByRole("link", { name: "Get started locally" }).click();
      await expect(page.getByRole("button", { name: "Copy demo commands" })).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    });
  }
});
