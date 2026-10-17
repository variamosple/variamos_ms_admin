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
      thresholds: {
        global: {
          branches: 80,
          functions: 80,
          lines: 80,
          statements: 80,
        },
      },
    },
  },
});
