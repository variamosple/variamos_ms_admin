import { readdirSync, readFileSync } from "node:fs";
import { join } from "node:path";
import type { Sequelize } from "sequelize";
import { describe, expect, it, vi } from "vitest";
import { Permission } from "#src/Domain/Permission/Entity/Permission.js";
import { PERMISSION_NAME_PATTERN } from "./0014-permission-name-format.js";
import { versionedFunctions } from "./0015-versioned-functions.js";
import { usageMetrics } from "./0018-usage-metrics.js";
import type { MigrationContext } from "./MigrationContext.js";

const DIR = import.meta.dirname;

const migrationFiles = readdirSync(DIR).filter(
  (name) => /^\d{4}-.*\.ts$/.test(name) && !/\.(test|spec)\.ts$/.test(name),
);

const withoutComments = (code: string): string =>
  code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("migration rules", () => {
  // EV-116: an instant is stored with its time zone. The baseline describes
  // the columns production had; 0016 converts them.
  it("creates no column without a time zone after the baseline", () => {
    const found = migrationFiles
      .filter((name) => !name.startsWith("0001-"))
      .filter((name) =>
        /\btimestamp\b(?!tz|\s+with time zone)/i.test(
          withoutComments(readFileSync(join(DIR, name), "utf8")),
        ),
      );
    expect(migrationFiles.length).toBeGreaterThanOrEqual(16);
    expect(found).toEqual([]);
  });

  // The database and the domain accept the same permission names
  it.each([
    "bugs::query",
    "admin::notifications::dispatch",
    "micro-services::update",
    "a::b::c::d",
    "bugs:update",
    "Bugs::update",
    "bugs::update ",
    "::update",
    "bugs::",
  ])("judges %j as the domain does", (name) => {
    let domain = true;
    try {
      new Permission(null, name);
    } catch {
      domain = false;
    }
    expect(new RegExp(PERMISSION_NAME_PATTERN).test(name)).toBe(domain);
  });

  it.each([
    ["0015", versionedFunctions],
    ["0018", usageMetrics],
  ])(
    "writes the functions of %s only into a plain schema name",
    async (_name, migration) => {
      const sequelize = { transaction: vi.fn(), query: vi.fn() };
      const context = {
        sequelize: sequelize as unknown as Sequelize,
        schema: 'variamos"; DROP',
      } satisfies MigrationContext;

      await expect(migration.up({ context, name: "x" })).rejects.toThrow(
        "not a plain name",
      );
      expect(sequelize.transaction).not.toHaveBeenCalled();
    },
  );

  it.each(["0015-versioned-functions.ts", "0018-usage-metrics.ts"])(
    "names no schema of its own in the functions of %s",
    (file) => {
      const code = readFileSync(join(DIR, file), "utf8");
      expect(code).not.toContain("variamos.");
    },
  );
});
