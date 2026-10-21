import js from "@eslint/js";
import reactHooks from "eslint-plugin-react-hooks";
import globals from "globals";
import tseslint from "typescript-eslint";

export default tseslint.config(
  {
    ignores: [
      "**/dist/**",
      "**/node_modules/**",
      "apps/web/public/**",
      "**/playwright-report/**",
      "**/test-results/**"
    ]
  },

  // Node-side tooling: generators, validators, the polling service, and deploy helpers.
  {
    files: ["scripts/**/*.mjs", "tests/**/*.mjs", "backend/**/*.mjs", "apps/web/scripts/**/*.mjs"],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.node }
    }
  },

  // The React application.
  {
    files: ["apps/web/src/**/*.{ts,tsx}", "apps/web/e2e/**/*.ts"],
    extends: [js.configs.recommended, ...tseslint.configs.recommended],
    plugins: { "react-hooks": reactHooks },
    languageOptions: {
      ecmaVersion: "latest",
      sourceType: "module",
      globals: { ...globals.browser }
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      // Chart bundles arrive as Record<string, unknown> and are narrowed at each builder,
      // which is the existing convention in ScenarioCharts.tsx.
      "@typescript-eslint/no-explicit-any": "error",
      "@typescript-eslint/no-unused-vars": ["error", { argsIgnorePattern: "^_" }]
    }
  },

  // The CommonJS-flavoured CloudFront Function runtime is not ES modules and has no
  // Node globals; it is linted for syntax only.
  {
    files: ["deploy/infra/*.js"],
    extends: [js.configs.recommended],
    languageOptions: {
      ecmaVersion: 2020,
      sourceType: "script"
    },
    rules: {
      // `handler` is the entry point CloudFront invokes; nothing in the file calls it.
      "no-unused-vars": ["error", { varsIgnorePattern: "^handler$" }]
    }
  }
);
