import { defineConfig, devices } from "@playwright/test";

export default defineConfig({
  testDir: "./e2e",
  fullyParallel: false,
  forbidOnly: !!process.env.CI,
  retries: 1,
  workers: 1,
  reporter: "html",

  use: {
    baseURL: "http://localhost:3500",
    headless: true,
    screenshot: "only-on-failure",
    trace: "on-first-retry",
  },

  projects: [
    {
      name: "setup",
      testMatch: /.*\.setup\.ts/,
    },
    {
      name: "chromium",
      use: {
        ...devices["Desktop Chrome"],
        storageState: "e2e/.auth/admin.json",
      },
      dependencies: ["setup"],
    },
  ],

  ...(process.env.CI
    ? {
        webServer: [
          {
            command: "pnpm --filter api dev",
            url: "http://localhost:4000/api/v1/system/codes",
            reuseExistingServer: false,
            cwd: "../..",
            timeout: 60000,
          },
          {
            command: "pnpm --filter web dev",
            url: "http://localhost:3500",
            reuseExistingServer: false,
            cwd: "../..",
            timeout: 60000,
          },
        ],
      }
    : {}),
});
