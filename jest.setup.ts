import VARIAMOS_ORM from "./src/Infrastructure/VariamosORM";

// Silence console logs and errors during test executions to keep output clean
jest.spyOn(console, "log").mockImplementation(() => {});
jest.spyOn(console, "error").mockImplementation(() => {});
jest.spyOn(console, "warn").mockImplementation(() => {});

// Mock jet-logger globally to prevent process.stdout writes during tests
jest.mock("jet-logger", () => ({
  info: jest.fn(),
  warn: jest.fn(),
  err: jest.fn(),
  imp: jest.fn(),
  default: {
    info: jest.fn(),
    warn: jest.fn(),
    err: jest.fn(),
    imp: jest.fn(),
  },
}));

// Gracefully close ORM database connections after tests run to avoid open handle leaks
afterAll(async () => {
  if (VARIAMOS_ORM) {
    await VARIAMOS_ORM.close();
  }
});
