import { configDefaults, defineConfig } from "vitest/config";

export default defineConfig({
  // "variamos-dev" selects the src/ targets of the package.json "imports" field (#src/*).
  // Vitest runs test code through the SSR pipeline, which uses ssr.resolve.conditions;
  // without it, #src/* falls back to the default target dist/ (absent on a clean checkout).
  resolve: {
    conditions: ["variamos-dev"],
  },
  ssr: {
    resolve: {
      conditions: ["variamos-dev"],
    },
  },
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    exclude: [...configDefaults.exclude, "**/dist/**", "**/.stryker-tmp/**"],
    coverage: {
      provider: "v8",
      include: ["src/Domain/**/*.ts", "src/EntryPoints/**/*.ts"],
      exclude: ["src/EntryPoints/index.ts", "src/**/*.d.ts"],
      // Just under the measure without PostgreSQL, as in CI (2026-10-23:
      // 98.26 / 92.39 / 99.09 / 98.45). Raise them, never lower them (T-17).
      thresholds: {
        statements: 97,
        branches: 91,
        functions: 98,
        lines: 97,
      },
    },
  },
});
