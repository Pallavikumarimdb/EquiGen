import { defineConfig, devices } from "@playwright/test";

const BASE_URL = process.env.PLAYWRIGHT_BASE_URL || "http://localhost:3000";

// The internal service credential comes from the environment. There is no default:
// a committed literal would mean anyone with the repo could authenticate as a
// platform operator and read across tenants.
const INTERNAL_SECRET = process.env.INTERNAL_API_SECRET;

if (!INTERNAL_SECRET) {
  throw new Error(
    "INTERNAL_API_SECRET is not set. Add it to .env (see .env.example) before running e2e tests.",
  );
}

export default defineConfig({
  testDir: "./tests/e2e",
  fullyParallel: false,
  retries: 0,
  workers: 1,
  reporter: "list",
  timeout: 30000,
  use: {
    baseURL: BASE_URL,
    extraHTTPHeaders: {
      "x-api-secret": INTERNAL_SECRET,
    },
    trace: "on-first-retry",
    headless: true,
  },
  projects: [
    {
      name: "chromium",
      use: { ...devices["Desktop Chrome"] },
    },
  ],
});
