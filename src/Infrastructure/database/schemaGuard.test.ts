import { readdirSync, readFileSync } from "node:fs";
import { join, relative } from "node:path";

// The schema changes only through the versioned migrations (EV-79 lot 1):
// sync() never adds a missing column, alter deletes those the model does not
// know, force and drop() delete the table. Outside the migrations, none of
// these may come back.
const ROOT = join(import.meta.dirname, "../..");
const MIGRATIONS = "Infrastructure/database/Migrations/";

const FORBIDDEN: [string, RegExp][] = [
  ["Sequelize sync()", /\.sync\s*\(/],
  ["alter: true", /\balter\s*:\s*true\b/],
  ["Sequelize drop()", /\b(sequelize|\w+Model)\.drop\s*\(/],
  ["truncate: true", /\btruncate\s*:\s*true\b/],
  [
    "queryInterface schema change",
    /\b(dropTable|dropAllTables|removeColumn|changeColumn|renameColumn|dropSchema)\s*\(/,
  ],
  // SQL is written in capitals here; "truncate" may be an English word
  ["destructive SQL", /\b(DROP\s+(TABLE|COLUMN|SCHEMA)|TRUNCATE)\b/],
];

const sourceFiles = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const path = join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(path);
    return /\.ts$/.test(entry.name) && !/\.(test|spec)\.ts$/.test(entry.name)
      ? [path]
      : [];
  });

// Comments may name what is forbidden, to explain why
const withoutComments = (code: string): string =>
  code.replace(/\/\*[\s\S]*?\*\//g, "").replace(/^\s*\/\/.*$/gm, "");

describe("schema guard (EV-79)", () => {
  const files = sourceFiles(ROOT)
    .map((path) => relative(ROOT, path))
    .filter((path) => !path.startsWith(MIGRATIONS));

  it("scans the source code", () => {
    expect(files.length).toBeGreaterThan(100);
    expect(files).toContain("Infrastructure/VariamosORM.ts");
  });

  it.each(FORBIDDEN)(
    "finds no %s outside the migrations",
    (_label, pattern) => {
      const found = files.filter((path) =>
        pattern.test(withoutComments(readFileSync(join(ROOT, path), "utf8"))),
      );
      expect(found).toEqual([]);
    },
  );

  it.each([
    ["await sequelize.sync();"],
    ["await BugModel.sync({ alter: true });"],
    ["await BugModel.drop();"],
    ["await BugModel.destroy({ where: {}, truncate: true });"],
    ["await queryInterface.removeColumn('bugs', 'title');"],
    ['await sequelize.query("TRUNCATE variamos.bugs");'],
  ])("would catch %s", (code) => {
    expect(FORBIDDEN.some(([, pattern]) => pattern.test(code))).toBe(true);
  });
});
