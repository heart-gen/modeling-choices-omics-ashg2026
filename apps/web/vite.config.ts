import react from "@vitejs/plugin-react";
import { defineConfig } from "vitest/config";
import { normalizeBase } from "./src/basePath";

export default defineConfig({
  // Unset for CloudFront and local development, which serve from the domain root; the
  // GitHub Pages builds under the repository sub-path. Read from the shell rather
  // than through `loadEnv` on purpose: honouring it from `.env.local` would move the dev
  // server too, and every Playwright spec resolves against a root `baseURL`.
  base: normalizeBase(process.env.VITE_BASE_PATH),
  plugins: [react()],
  build: {
    sourcemap: true
  },
  server: {
    port: 5173
  },
  test: {
    // jsdom rather than node: component behaviour is testable here, and the pure-logic
    // suites (router, scenarioUtils) run unchanged under it.
    environment: "jsdom",
    setupFiles: ["./src/testSetup.ts"],
    include: ["src/**/*.test.ts", "src/**/*.test.tsx"]
  }
});
