import { expect, test } from "@playwright/test";

test.describe("Quoli product introduction", () => {
  test("explains the offer and opens a real local sample review", async ({ page }) => {
    const errors: string[] = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto("/landing");
    const heading = page.getByRole("heading", { level: 1 });
    await expect(heading).toContainText("Every agent change");
    await expect(heading).toContainText("accounted for");
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

  test("answers the honest questions and links to the workspace", async ({ page }) => {
    await page.goto("/landing");
    const question = page.getByText("Does Quoli upload my code?", { exact: true });
    await question.click();
    await expect(
      page.getByText("Not by default. Capture and upload", { exact: false }),
    ).toBeVisible();
    await page.getByRole("link", { name: "Open workspace" }).first().click();
    await expect(page).not.toHaveURL(/\/landing$/);
  });

  test("loads no remote assets or fonts", async ({ page }) => {
    const external: string[] = [];
    page.on("request", (request) => {
      const url = new URL(request.url());
      if (
        !["127.0.0.1", "localhost"].includes(url.hostname) &&
        !["data:", "blob:"].includes(url.protocol)
      ) {
        external.push(request.url());
      }
    });
    await page.goto("/landing");
    await page.waitForLoadState("networkidle");
    expect(external).toEqual([]);
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
          .locator(".q-headline-text")
          .first()
          .evaluate((element) => getComputedStyle(element).animationName),
      ).toBe("none");
      for (const name of ["File changes", "Recorded checks", "Missing evidence"]) {
        await page.getByRole("tab", { name, exact: true }).click();
        await expect(page.getByRole("tabpanel")).toBeVisible();
        expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
          true,
        );
      }
      await page.getByRole("link", { name: "See the evidence" }).click();
      await expect(page.getByRole("heading", { name: "A review you can trace." })).toBeInViewport();
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
    });
  }
});
