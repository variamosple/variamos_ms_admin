import { vi, afterAll } from "vitest";
import VARIAMOS_ORM from "./src/Infrastructure/VariamosORM.js";
declare global {
  namespace vi {
    type Mock<T extends (...args: any[]) => any = (...args: any[]) => any> = import("vitest").Mock<T>;
    type Mocked<T> = import("vitest").Mocked<T>;
    type SpyInstance<T extends (...args: any[]) => any = (...args: any[]) => any> = import("vitest").MockInstance<T>;
  }
}

// Silence console logs and errors during test executions to keep output clean
vi.spyOn(console, "log").mockImplementation(() => {});
vi.spyOn(console, "error").mockImplementation(() => {});
vi.spyOn(console, "warn").mockImplementation(() => {});

// Mock jet-logger globally to prevent process.stdout writes during tests
vi.mock("jet-logger", () => ({
  info: vi.fn(),
  warn: vi.fn(),
  err: vi.fn(),
  imp: vi.fn(),
  default: {
    info: vi.fn(),
    warn: vi.fn(),
    err: vi.fn(),
    imp: vi.fn(),
  },
}));

// Gracefully close ORM database connections after tests run to avoid open handle leaks
afterAll(async () => {
  if (VARIAMOS_ORM) {
    await VARIAMOS_ORM.close();
  }
});
