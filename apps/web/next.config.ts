import { resolve } from "node:path";
import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  output: process.env.QUOLI_STANDALONE === "1" ? "standalone" : undefined,
  outputFileTracingRoot: resolve(import.meta.dirname, "../.."),
  distDir:
    process.env.TRACEFRAME_NEXT_DIR ||
    (process.env.NODE_ENV === "production" ? ".next-build" : ".next"),
};
export default config;
