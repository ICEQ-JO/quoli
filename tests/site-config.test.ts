import assert from "node:assert/strict";
import { createHash } from "node:crypto";
import { readFileSync } from "node:fs";
import { test } from "node:test";

test("app.iceq.best's content security policy allows exactly the app page's inline scripts", () => {
  const html = readFileSync("web/studio/index.html", "utf8");
  const inline = [...html.matchAll(/<script(?![^>]*\bsrc=)[^>]*>([\s\S]*?)<\/script>/g)].map(
    (m) => `'sha256-${createHash("sha256").update(m[1]).digest("base64")}'`,
  );
  const vercel = JSON.parse(readFileSync("vercel.json", "utf8"));
  const csp: string = vercel.headers
    .find((h: { has?: { value: string }[] }) => h.has?.[0]?.value === "app.iceq.best")
    .headers.find((h: { key: string }) => h.key === "Content-Security-Policy").value;
  const scriptSrc = csp.split(";").find((d) => d.trim().startsWith("script-src")) ?? "";
  for (const hash of inline) assert.ok(scriptSrc.includes(hash), `script-src lacks ${hash}`);
  assert.equal(scriptSrc.match(/'sha256-/g)?.length ?? 0, inline.length);
  // The page reads Quoli on this computer, and nothing else.
  assert.match(csp, /connect-src 'self' http:\/\/127\.0\.0\.1:\* http:\/\/localhost:\*/);
  assert.match(csp, /frame-ancestors 'none'/);
});
