// Refuses the comments that silence a check instead of fixing the code: a
// rule switched off on one line, a type error hidden, a file left out of the
// coverage. A rule that does not fit is changed in biome.json, in the open.
// The same script is in the three repositories of the administration module.
// Built-in Node modules only, no command run. Reads the files, changes nothing.

import { readdirSync, readFileSync } from "node:fs";
import { dirname, join, relative } from "node:path";
import { fileURLToPath } from "node:url";

const ROOT = join(dirname(fileURLToPath(import.meta.url)), "..");
const CODE_FILE = /\.(?:[cm]?[jt]s|tsx|jsx)$/;
// Dependencies, build and test outputs, copies made by Stryker
const SKIPPED_DIRECTORIES = new Set([
  ".git",
  ".stryker-tmp",
  "build",
  "coverage",
  "dist",
  "node_modules",
  "playwright-report",
  "reports",
  "strykerTmp",
  "test-results",
]);
// Built from parts so that this file does not match itself
const FORBIDDEN = [
  ["biome", "-ignore"],
  ["@ts", "-ignore"],
  ["@ts", "-nocheck"],
  ["eslint", "-disable"],
  ["istanbul", " ignore"],
  ["v8", " ignore"],
  ["c8", " ignore"],
].map((parts) => parts.join(""));

function codeFiles(directory) {
  const files = [];
  const entries = readdirSync(directory, { withFileTypes: true });
  for (const entry of entries) {
    const path = join(directory, entry.name);
    if (entry.isDirectory()) {
      if (!SKIPPED_DIRECTORIES.has(entry.name)) files.push(...codeFiles(path));
    } else if (CODE_FILE.test(entry.name)) {
      files.push(path);
    }
  }
  return files;
}

const files = codeFiles(ROOT);
const findings = [];
for (const file of files) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, index) => {
    const found = FORBIDDEN.find((comment) => line.includes(comment));
    if (found) {
      findings.push(`${relative(ROOT, file)}:${index + 1}  ${found}`);
    }
  });
}

if (findings.length > 0) {
  console.error("Suppression comments are not allowed:");
  for (const finding of findings) console.error(`  ${finding}`);
  console.error(
    "Fix the code, or change the rule in biome.json with the reason.",
  );
  process.exit(1);
}
console.log(`No suppression comment in ${files.length} files.`);
