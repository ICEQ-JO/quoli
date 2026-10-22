import { tmpdir } from "node:os";
import { join } from "node:path";
import { defineConfig } from "@playwright/test";

const testDataDir =
  process.env.TRACEFRAME_E2E_DATA_DIR || join(tmpdir(), `traceframe-browser-${process.pid}`);
process.env.TRACEFRAME_E2E_DATA_DIR = testDataDir;
export default defineConfig({
  testDir: "./tests/browser",
  workers: 1,
  timeout: 30000,
  use: {
    baseURL: "http://127.0.0.1:33140",
    headless: true,
    viewport: { width: 1440, height: 1100 },
    screenshot: "only-on-failure",
  },
  webServer: {
    command: "pnpm demo",
    url: "http://127.0.0.1:33140/api/health",
    timeout: 60000,
    gracefulShutdown: { signal: "SIGTERM", timeout: 5000 },
    reuseExistingServer: false,
    env: {
      TRACEFRAME_DATA_DIR: testDataDir,
      TRACEFRAME_NEXT_DIR: ".next-e2e",
      TRACEFRAME_WEB_PORT: "33140",
      TRACEFRAME_COLLECTOR_PORT: "34318",
      NEXT_TELEMETRY_DISABLED: "1",
    },
  },
});
