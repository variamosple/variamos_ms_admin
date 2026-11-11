import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";
import { Permission } from "#src/Domain/Permission/Entity/Permission.js";

// Every permission a route demands follows the format the database enforces
// (EV-70 lot 4, migration 0014): a misspelt name would refuse everyone,
// without any error at start-up.
const ROOT = join(import.meta.dirname, "..");

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.ts$/.test(entry.name) && !/\.(test|spec)\.ts$/.test(entry.name)
      ? [path]
      : [];
  });

const demanded = sourceFiles(ROOT).flatMap((path) => {
  const code = readFileSync(path, "utf8");
  const file = relative(ROOT, path);
  return [...code.matchAll(/hasPermissions\(\s*\[([^\]]*)\]/g)].flatMap(
    (call) =>
      [...(call[1] ?? "").matchAll(/"([^"]*)"/g)].map((name) => ({
        file,
        name: name[1] ?? "",
      })),
  );
});

const isWellFormed = (name: string): boolean => {
  try {
    new Permission(null, name);
    return true;
  } catch {
    return false;
  }
};

describe("permission names demanded by the routes (EV-70 lot 4)", () => {
  it("finds the permission checks of the routes", () => {
    expect(demanded.length).toBeGreaterThan(50);
    expect(demanded).toContainEqual({
      file: "EntryPoints/BugRouter.ts",
      name: "bugs::update",
    });
  });

  it("demands only well-formed names", () => {
    expect(demanded.filter(({ name }) => !isWellFormed(name))).toEqual([]);
  });

  it.each(["bugs:update", "Bugs::update", "bugs::", "bugs::update "])(
    "would report %j",
    (name) => {
      expect(isWellFormed(name)).toBe(false);
    },
  );
});
