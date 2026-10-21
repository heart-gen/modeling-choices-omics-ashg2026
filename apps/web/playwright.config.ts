import { defineConfig, devices } from "@playwright/test";

const projects = [
  { name: "chromium", use: { ...devices["Desktop Chrome"] } },
  ...(process.env.E2E_ALL_BROWSERS === "1"
    ? [{ name: "webkit", use: { ...devices["Desktop Safari"] } }]
    : [])
];

export default defineConfig({
  testDir: "./e2e",
  webServer: {
    command: "npm run dev",
    url: "http://127.0.0.1:5173",
    reuseExistingServer: true,
    env: {
      ...process.env,
      VITE_FACILITATOR_USERNAME: "facilitator",
      VITE_FACILITATOR_PASSWORD: "ashg2026"
    }
  },
  use: {
    baseURL: "http://127.0.0.1:5173",
    trace: "on-first-retry"
  },
  projects
});
