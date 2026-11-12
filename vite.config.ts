import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

export default defineConfig({
  root: "web",
  plugins: [react()],
  build: {
    outDir: "../dist",
    emptyOutDir: true,
    // QUOLI_BUILD=landing builds only the public landing page (Vercel); the local app is never
    // published there because it needs its private evidence server.
    rollupOptions: {
      input:
        process.env.QUOLI_BUILD === "landing"
          ? { landing: "web/landing/index.html" }
          : { app: "web/index.html", landing: "web/landing/index.html" },
    },
  },
});
