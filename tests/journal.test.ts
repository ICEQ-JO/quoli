import assert from "node:assert/strict";
import { readFileSync } from "node:fs";
import { test } from "node:test";
import { renderJournalPage } from "../scripts/journal.ts";
import { articleAt, articles, journalPaths } from "../web/src/landing/articles.tsx";

const site = "https://quoli.example";
const template = readFileSync(
  new URL("../web/landing/index.html", import.meta.url),
  "utf8",
).replaceAll("%SITE%", site);

test("journal pages contain readable article text, matching metadata and complete source anchors without JavaScript", () => {
  const slugs = new Set(articles.map((a) => a.slug));
  assert.equal(slugs.size, articles.length);
  for (const article of articles) {
    const path = `/journal/${article.slug}/`;
    assert.equal(articleAt(path), article);
    const html = renderJournalPage(template, path, site);
    assert.ok(html.includes(`<link rel="canonical" href="${site}${path}"`));
    assert.ok(html.includes('property="og:type" content="article"'));
    assert.ok(html.includes('property="article:published_time" content="2026-11-13"'));
    assert.ok(html.includes(`${article.title} — Quoli Journal</title>`));
    assert.ok(html.includes('<main id="main"'));
    for (const section of article.sections) assert.ok(html.includes(`id="${section.id}"`));
    for (let n = 1; n <= article.sources.length; n++) {
      assert.ok(html.includes(`href="#source-${n}"`), `source ${n} is actually cited`);
      assert.ok(html.includes(`id="source-${n}"`), `source ${n} can be reached`);
    }
    assert.ok(html.includes("not customer case studies"));
    for (const source of article.sources) {
      assert.equal(new URL(source.url).protocol, "https:");
      assert.ok(source.date.length > 20 && source.method.length > 20 && source.limit.length > 20);
    }
    assert.doesNotMatch(html, /(?:NaN|Infinity)/);
  }
});

test("journal index links every article; unknown article paths do not silently show an unrelated story", () => {
  assert.equal(journalPaths.length, articles.length + 1);
  const html = renderJournalPage(template, "/journal/", site);
  for (const article of articles) assert.ok(html.includes(`href="/journal/${article.slug}/"`));
  assert.equal(articleAt("/journal/missing/"), undefined);
  assert.equal(articleAt("/journal/beyond-the-diff/extra/"), undefined);
  assert.ok(
    renderJournalPage(template, "/journal/missing/", site).includes("This field note isn’t here."),
  );
});
