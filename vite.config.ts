import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";
import { journalPages } from "./scripts/journal.ts";

/**
 * Link previews need an absolute image URL. On Vercel the production domain (including a custom
 * one) is known at build time; VITE_PUBLIC_SITE_URL overrides it. Without either, the tags keep a
 * root-relative path, which most previewers still resolve.
 */
const site = (
  process.env.VITE_PUBLIC_SITE_URL ??
  (process.env.VERCEL_PROJECT_PRODUCTION_URL
    ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}`
    : "")
).replace(/\/+$/, "");
const siteUrl = (): Plugin => ({
  name: "quoli-site-url",
  transformIndexHtml: (html) => html.replaceAll("%SITE%", site),
});

/** The account page shows the install command for this version of the package. */
const version: string = JSON.parse(
  readFileSync(new URL("./package.json", import.meta.url), "utf8"),
).version;

export default defineConfig({
  root: "web",
  plugins: [react(), siteUrl(), journalPages(site)],
  define: { "import.meta.env.VITE_QUOLI_VERSION": JSON.stringify(version) },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    // QUOLI_BUILD=landing builds the public pages (Vercel): the landing page, the hosted account
    // page (web/app at /app/, Supabase) and the full app at /studio/ (web/studio), which reads
    // Quoli on the visitor's own computer from the browser (web/src/host.ts); no data is published.
    rollupOptions: {
      input:
        process.env.QUOLI_BUILD === "landing"
          ? {
              landing: "web/landing/index.html",
              account: "web/app/index.html",
              studio: "web/studio/index.html",
            }
          : {
              app: "web/index.html",
              landing: "web/landing/index.html",
              account: "web/app/index.html",
            },
    },
  },
});
