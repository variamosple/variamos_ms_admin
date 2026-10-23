import { readdirSync, readFileSync } from "node:fs";
import path from "node:path";

// Guard of the error contract (T-16): no source sends the text of an
// exception to the client. sendError and the response guard cover the
// runtime; this test stops the pattern from coming back in the code.
const SOURCE_ROOT = path.resolve(import.meta.dirname, "..");

const sources = (dir: string): string[] =>
  readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const full = path.join(dir, entry.name);
    if (entry.isDirectory()) return sources(full);
    return /\.ts$/.test(entry.name) && !/\.(test|spec)\.ts$/.test(entry.name)
      ? [full]
      : [];
  });

const FORBIDDEN_PATTERNS: [string, RegExp][] = [
  [
    "a SYSTEM_ERROR built from an exception message",
    /SYSTEM_ERROR,\s*(?:\(\s*\w+\s+as\s+Error\s*\)|\w+)\.message/,
  ],
  [
    "a SYSTEM_ERROR message that inserts an exception message",
    /SYSTEM_ERROR,\s*`[^`]*\$\{[^}]*\.message[^}]*\}/,
  ],
  ["a raw { error: ... } body", /\.json\(\s*\{\s*error:/],
];

describe("error contract", () => {
  const files = sources(SOURCE_ROOT);

  it("finds the sources", () => {
    expect(files.length).toBeGreaterThan(100);
  });

  it.each(FORBIDDEN_PATTERNS)("no source sends %s", (_label, pattern) => {
    const offenders = files.filter((file) =>
      pattern.test(readFileSync(file, "utf8")),
    );

    expect(offenders.map((file) => path.relative(SOURCE_ROOT, file))).toEqual(
      [],
    );
  });
});
