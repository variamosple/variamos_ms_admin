// Refuses the comments that silence a check instead of fixing the code: a
// rule switched off on one line, a type error hidden, a file left out of the
// coverage. A rule that does not fit is changed in biome.json, in the open.
// The same script is in the three repositories of the administration module.
// Built-in Node modules only. Reads the tracked files, changes nothing.

import { execFileSync } from "node:child_process";
import { readFileSync } from "node:fs";

const CODE_FILE = /\.(?:[cm]?[jt]s|tsx|jsx)$/;
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

const tracked = execFileSync("git", ["ls-files", "-z"], { encoding: "utf8" })
  .split("\0")
  .filter((file) => CODE_FILE.test(file));

const findings = [];
for (const file of tracked) {
  const lines = readFileSync(file, "utf8").split("\n");
  lines.forEach((line, index) => {
    const found = FORBIDDEN.find((comment) => line.includes(comment));
    if (found) findings.push(`${file}:${index + 1}  ${found}`);
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
console.log(`No suppression comment in ${tracked.length} files.`);
