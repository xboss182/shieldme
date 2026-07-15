import { defineConfig } from "@playwright/test";

export default defineConfig({
  testDir: "./tests",
  testMatch: "mobile-landing.spec.ts",
  use: {
    baseURL: "http://127.0.0.1:4173",
    viewport: { width: 375, height: 812 },
  },
  webServer: {
    command: "npm run preview -- --host 127.0.0.1 --port 4173",
    url: "http://127.0.0.1:4173",
    reuseExistingServer: false,
  },
});
