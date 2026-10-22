import type { NextConfig } from "next";

const config: NextConfig = {
  poweredByHeader: false,
  devIndicators: false,
  distDir:
    process.env.TRACEFRAME_NEXT_DIR ||
    (process.env.NODE_ENV === "production" ? ".next-build" : ".next"),
};
export default config;
