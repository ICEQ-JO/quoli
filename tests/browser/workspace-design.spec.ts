import { expect, test } from "@playwright/test";

for (const theme of ["dark", "light"] as const) {
  test(`document review remains readable and navigable in ${theme} mode`, async ({
    page,
  }, testInfo) => {
    test.setTimeout(120_000);
    await page.emulateMedia({ reducedMotion: "reduce" });
    await page.goto("/?session=session-cache&view=session");
    await expect(page.locator(".session-document")).toBeVisible();
    if (theme === "light")
      await page.getByRole("button", { name: "Switch to light theme" }).click();
    await page.evaluate(() => document.fonts.ready);
    await expect(page.locator(".session-view .brief-layout")).toHaveCSS("animation-name", "none");
    // Check rendered text on actual surfaces, including primary hover in both color schemes.
    const contrast = async (selector: string, property: "color" | "outlineColor" = "color") =>
      page
        .locator(selector)
        .first()
        .evaluate((element, colorProperty) => {
          const style = getComputedStyle(element);
          const rgb = (value: string) => (value.match(/[\d.]+/g) ?? []).slice(0, 3).map(Number);
          const luminance = (value: string) =>
            rgb(value)
              .map((v) => {
                const n = v / 255;
                return n <= 0.04045 ? n / 12.92 : ((n + 0.055) / 1.055) ** 2.4;
              })
              .reduce((sum, n, i) => sum + n * [0.2126, 0.7152, 0.0722][i], 0);
          let ancestor: Element | null = element;
          while (ancestor && getComputedStyle(ancestor).backgroundColor === "rgba(0, 0, 0, 0)")
            ancestor = ancestor.parentElement;
          const a = luminance(style[colorProperty]);
          const b = luminance(getComputedStyle(ancestor ?? document.body).backgroundColor);
          return (Math.max(a, b) + 0.05) / (Math.min(a, b) + 0.05);
        }, property);
    for (const selector of [".request-entry p", ".document-muted", ".session-properties dt"]) {
      if (await page.locator(selector).count())
        expect(await contrast(selector)).toBeGreaterThanOrEqual(4.5);
    }
    const action = page.locator(".review-action");
    await action.hover();
    expect(await contrast(".review-action")).toBeGreaterThanOrEqual(4.5);
    await page.keyboard.press("Tab");
    await action.focus();
    await expect(action).toHaveCSS("outline-style", "solid");
    const sidebarTarget = page.locator(".primary-nav > button").first();
    await sidebarTarget.focus();
    await expect(sidebarTarget).toHaveCSS("outline-style", "solid");
    expect(await contrast(".primary-nav > button", "outlineColor")).toBeGreaterThanOrEqual(3);
    await page.screenshot({ path: testInfo.outputPath(`focus-${theme}-desktop.png`) });
    await action.focus();
    await page.screenshot({
      path: testInfo.outputPath(`review-${theme}-desktop.png`),
      fullPage: true,
    });
    await page.locator(".request-entry .source-action").first().click();
    await expect(page.locator(".session-evidence")).toBeVisible();
    await page.screenshot({
      path: testInfo.outputPath(`inspector-${theme}-desktop.png`),
      fullPage: true,
    });
    await page.getByRole("button", { name: "Close evidence inspector" }).click();
    for (const width of [720, 320]) {
      await page.setViewportSize({ width, height: 844 });
      expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBe(
        true,
      );
      await page.screenshot({
        path: testInfo.outputPath(`review-${theme}-${width}.png`),
        fullPage: true,
      });
    }
    await page.keyboard.press("Tab");
    await sidebarTarget.focus();
    await expect(sidebarTarget).toHaveCSS("outline-style", "solid");
    expect(await contrast(".primary-nav > button", "outlineColor")).toBeGreaterThanOrEqual(3);
    await page.screenshot({ path: testInfo.outputPath(`focus-${theme}-320.png`) });
    await page.locator(".request-entry .source-action").first().click();
    await expect(page.getByRole("dialog")).toBeVisible();
    await page.keyboard.press("Escape");
    await expect(page.getByRole("dialog")).not.toBeVisible();
    for (const view of [
      "sessions",
      "activity",
      "changes",
      "map",
      "usage",
      "coverage",
      "review",
      "overview",
      "settings",
    ]) {
      for (const width of [1440, 320]) {
        await page.setViewportSize({ width, height: 900 });
        await page.goto(`/?session=session-cache&view=${view}`);
        await expect(page.locator(".review-app")).toBeVisible();
        await expect(page.locator(".workspace-starting")).toHaveCount(0);
        await page.waitForLoadState("networkidle");
        await expect(page.locator('.activity-skeleton, [aria-busy="true"]')).toHaveCount(0);
        expect(
          await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth),
          `${view} at ${width}px`,
        ).toBe(true);
        await page.screenshot({
          path: testInfo.outputPath(`${view === "review" ? "queue" : view}-${theme}-${width}.png`),
          fullPage: true,
        });
      }
    }
  });
}
