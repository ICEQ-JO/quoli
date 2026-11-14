import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import { ProductScreenshot } from "../web/src/landing/ProductScreenshot.tsx";

test("the six approved product captures have full-size fallbacks and preserve their aspect ratio", () => {
  for (const id of ["review", "agents", "git", "infra", "sessions", "dashboard"]) {
    for (const extension of ["jpg", "webp"]) {
      const asset = readFileSync(
        new URL(`../web/public/landing/product/${id}.${extension}`, import.meta.url),
      );
      assert.ok(asset.length > 1000);
    }
    const html = renderToStaticMarkup(
      createElement(ProductScreenshot, {
        screen: { id, name: id, caption: "Owner-provided product capture." },
      }),
    );
    assert.ok(html.includes(`href="/landing/product/${id}.jpg"`));
    assert.ok(html.includes(`srcSet="/landing/product/${id}.webp"`));
    assert.ok(html.includes('width="1600" height="900"'));
    assert.doesNotMatch(html, /synthetic|-(?:light|dark)\./);
  }
});
