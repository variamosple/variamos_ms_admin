import { defineConfig, configDefaults } from "vitest/config";
import tsconfigPaths from "vite-tsconfig-paths";
import * as dotenv from "dotenv";
import * as path from "path";

// Load test env variables
dotenv.config({ path: path.join(process.cwd(), "env/test.env") });

export default defineConfig({
  plugins: [tsconfigPaths()],
  test: {
    globals: true,
    environment: "node",
    setupFiles: ["./vitest.setup.ts"],
    exclude: [...configDefaults.exclude, "**/dist/**", "**/.stryker-tmp/**"],
    coverage: {
      provider: "v8",
      include: ["src/Domain/**/*.ts", "src/EntryPoints/**/*.ts"],
      exclude: [
        "src/EntryPoints/index.ts",
        "src/Domain/Validations/ValidationMessages.ts",
        "src/**/*.d.ts",
      ],
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
