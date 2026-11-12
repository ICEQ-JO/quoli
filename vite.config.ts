import { readFileSync } from "node:fs";
import react from "@vitejs/plugin-react";
import { defineConfig, type Plugin } from "vite";

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
  plugins: [react(), siteUrl()],
  define: { "import.meta.env.VITE_QUOLI_VERSION": JSON.stringify(version) },
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    // QUOLI_BUILD=landing builds only the public pages (Vercel): the landing page and the hosted
    // account page (web/app at /app/, Supabase); the local app is never
    // published there because it needs its private evidence server.
    rollupOptions: {
      input:
        process.env.QUOLI_BUILD === "landing"
          ? { landing: "web/landing/index.html", account: "web/app/index.html" }
          : {
              app: "web/index.html",
              landing: "web/landing/index.html",
              account: "web/app/index.html",
            },
    },
  },
});
