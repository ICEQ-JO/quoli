import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { contrast } from "../web/src/theme.ts";

const css = readFileSync(new URL("../web/src/styles.css", import.meta.url), "utf8");

function tokens(selector: string, base: Record<string, string> = {}) {
  const start = css.indexOf(`${selector} {`);
  assert.ok(start >= 0, `${selector} block`);
  const body = css.slice(start, css.indexOf("}", start));
  const out = { ...base };
  for (const m of body.matchAll(/(--[\w-]+):\s*(#[0-9a-f]{3,6})\s*;/gi))
    out[m[1] as string] = m[2] as string;
  return out;
}

const dark = tokens(":root");
const themes = { dark, light: tokens(':root[data-theme="light"]', dark) };
const surfaces = ["--bg", "--panel", "--raised", "--hover"];
const accents = ["--read", "--edit", "--run", "--search", "--agent", "--web", "--ok", "--fail"];

for (const [name, t] of Object.entries(themes)) {
  const ratio = (fg: string, bg: string) => contrast(t[fg] as string, t[bg] as string);

  test(`${name}: primary and secondary text meet AA on every surface`, () => {
    for (const bg of surfaces)
      for (const fg of ["--text", "--text-2", "--muted"])
        assert.ok(ratio(fg, bg) >= 4.5, `${fg} on ${bg} = ${ratio(fg, bg).toFixed(2)}`);
  });

  test(`${name}: faint labels reach 4.5:1 (they are small text) and semantic colors read as text`, () => {
    for (const bg of surfaces) {
      assert.ok(
        ratio("--faint", bg) >= 4.5,
        `--faint on ${bg} = ${ratio("--faint", bg).toFixed(2)}`,
      );
      for (const fg of accents)
        assert.ok(ratio(fg, bg) >= 3, `${fg} on ${bg} = ${ratio(fg, bg).toFixed(2)}`);
    }
    for (const [fg, bg] of [
      ["--ok-text", "--bg"],
      ["--fail-text", "--bg"],
      ["--accent", "--bg"],
    ] as const)
      assert.ok(ratio(fg, bg) >= 4.5, `${fg} on ${bg} = ${ratio(fg, bg).toFixed(2)}`);
  });

  test(`${name}: filled badges and buttons keep AA text`, () => {
    for (const bg of [
      "--accent",
      "--edit",
      "--read",
      "--run",
      "--search",
      "--agent",
      "--web",
      "--ok",
    ])
      assert.ok(ratio("--on-accent", bg) >= 4.5, `--on-accent on ${bg}`);
    assert.ok(ratio("--on-text", "--text") >= 4.5);
    assert.ok(ratio("--on-accent", "--accent") >= 4.5);
  });
}
