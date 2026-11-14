import { readFileSync } from "node:fs";
import { resolve } from "node:path";
import { createElement } from "react";
import { renderToStaticMarkup } from "react-dom/server";
import type { Plugin } from "vite";
import { articleAt, journalPaths } from "../web/src/landing/articles.tsx";
import { Journal } from "../web/src/landing/Journal.tsx";

const escapeHtml = (text: string) =>
  text
    .replaceAll("&", "&amp;")
    .replaceAll('"', "&quot;")
    .replaceAll("<", "&lt;")
    .replaceAll(">", "&gt;");
export function renderJournalPage(template: string, pathname: string, site: string) {
  const article = articleAt(pathname);
  const title = article ? `${article.title} — Quoli Research` : "Research & insights — Quoli";
  const description =
    article?.description ??
    "Studies and perspectives on coding agents, review, trust and the work after generation.";
  const url = `${site}${pathname}`;
  let html = template
    .replace(/<title>.*?<\/title>/, `<title>${escapeHtml(title)}</title>`)
    .replace(
      /(<meta name="description" content=")[^"]*("\s*\/?>)/,
      (_, a, b) => `${a}${escapeHtml(description)}${b}`,
    );
  for (const [key, value] of Object.entries({
    "og:title": title,
    "og:description": description,
    "og:url": url,
    "og:type": article ? "article" : "website",
    "og:image:alt": "Original Quoli baby-blue pixel scenery and connected-work identity.",
  })) {
    html = html.replace(
      new RegExp(`(<meta property="${key}" content=")[^"]*("\\s*\\/?>)`),
      (_, a, b) => `${a}${escapeHtml(value)}${b}`,
    );
  }
  return html
    .replace(
      "</head>",
      `<link rel="canonical" href="${escapeHtml(url)}" />${article ? '<meta property="article:published_time" content="2026-11-13" />' : ""}</head>`,
    )
    .replace(
      '<div id="root"></div>',
      `<div id="root">${renderToStaticMarkup(createElement(Journal, { pathname }))}</div>`,
    );
}

/** Emit readable, shareable pages using the same client entry as the landing. */
export function journalPages(site: string): Plugin {
  let root = "";
  return {
    name: "quoli-journal-pages",
    enforce: "post",
    configResolved(config) {
      root = config.root;
    },
    configureServer(server) {
      server.middlewares.use(async (req, res, next) => {
        const url = new URL(req.url ?? "/", "http://localhost");
        if (!url.pathname.startsWith("/journal/")) return next();
        try {
          const html = renderJournalPage(
            readFileSync(resolve(root, "landing/index.html"), "utf8"),
            url.pathname,
            site,
          );
          res.statusCode = journalPaths.includes(url.pathname) ? 200 : 404;
          res.setHeader("Content-Type", "text/html; charset=utf-8");
          res.end(await server.transformIndexHtml(url.pathname, html));
        } catch (error) {
          next(error);
        }
      });
    },
    generateBundle(_, bundle) {
      const template = bundle["landing/index.html"];
      if (template?.type !== "asset") throw Error("Landing HTML is required for journal pages");
      for (const pathname of journalPaths)
        this.emitFile({
          type: "asset",
          fileName: `${pathname.slice(1)}index.html`,
          source: renderJournalPage(String(template.source), pathname, site),
        });
    },
  };
}
