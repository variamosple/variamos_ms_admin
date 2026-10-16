import * as fs from "node:fs";
import * as path from "node:path";
import { fileURLToPath } from "node:url";

/**
 * Guards against logging sensitive data again (EV-73). It scans the source
 * files, not the tests, for logging patterns that wrote request objects,
 * whole error objects, sessions or tokens.
 */
const srcDir = path.resolve(path.dirname(fileURLToPath(import.meta.url)), "..");

interface ForbiddenPattern {
  pattern: RegExp;
  reason: string;
}

const FORBIDDEN_PATTERNS: readonly ForbiddenPattern[] = [
  {
    pattern: /logger\.\w+\(\s*(request|req|credentials)\s*[,)]/,
    reason: "logs a request object (it may hold a password)",
  },
  {
    pattern: /logger\.\w+\([^;]*,\s*true\s*\)/,
    reason: "dumps a whole object (printFull); use describeError()",
  },
  {
    pattern: /JSON\.stringify\(\s*session/,
    reason: "logs a decoded session",
  },
  {
    pattern: /token\.substring\(/,
    reason: "writes part of a token",
  },
];

function sourceFiles(dir: string): string[] {
  return fs.readdirSync(dir, { withFileTypes: true }).flatMap((entry) => {
    const fullPath = path.join(dir, entry.name);
    if (entry.isDirectory()) return sourceFiles(fullPath);
    const isSource =
      entry.name.endsWith(".ts") && !/\.(spec|test)\.ts$/.test(entry.name);
    return isSource ? [fullPath] : [];
  });
}

describe("sensitive data in logs", () => {
  it("finds source files to scan", () => {
    expect(sourceFiles(srcDir).length).toBeGreaterThan(50);
  });

  it.each(FORBIDDEN_PATTERNS)("no source file $reason", ({ pattern }) => {
    const offenders = sourceFiles(srcDir).flatMap((file) =>
      fs
        .readFileSync(file, "utf8")
        .split("\n")
        .flatMap((line, index) =>
          pattern.test(line)
            ? [`${path.relative(srcDir, file)}:${index + 1}: ${line.trim()}`]
            : [],
        ),
    );

    expect(offenders).toEqual([]);
  });
});
