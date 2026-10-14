#!/usr/bin/env node
// Gate for `npm audit`: fails on any high or critical advisory that is not
// listed in audit-exceptions.json, and on any exception whose expiry date has
// passed. Built-in Node modules only. Reads the audit, changes nothing.

import { spawnSync } from 'node:child_process';
import { readFileSync } from 'node:fs';
import { dirname, join } from 'node:path';
import { fileURLToPath } from 'node:url';

const ROOT = join(dirname(fileURLToPath(import.meta.url)), '..');
const EXCEPTIONS_FILE = join(ROOT, 'audit-exceptions.json');
const GATED_SEVERITIES = new Set(['high', 'critical']);
const GHSA_PATTERN = /GHSA-[0-9a-z]{4}-[0-9a-z]{4}-[0-9a-z]{4}/i;

function fail(message) {
  console.error(`audit-gate: ${message}`);
  process.exit(1);
}

function localDate(now = new Date()) {
  const pad = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${pad(now.getMonth() + 1)}-${pad(now.getDate())}`;
}

function runAudit() {
  const result = spawnSync('npm', ['audit', '--json'], {
    cwd: ROOT,
    encoding: 'utf8',
    maxBuffer: 64 * 1024 * 1024,
  });
  if (result.error) {
    fail(`npm audit could not start: ${result.error.message}`);
  }
  // npm exits 1 when vulnerabilities are found: the JSON on stdout is the
  // source of truth, not the exit status.
  let report;
  try {
    report = JSON.parse(result.stdout);
  } catch {
    const detail = (result.stderr || '').trim().slice(0, 500);
    fail(`npm audit did not return JSON (exit ${result.status}). ${detail}`);
  }
  if (report.error) {
    const reason = report.error.summary ?? report.error.code ?? 'unknown error';
    fail(`npm audit returned an error: ${reason}`);
  }
  return report;
}

// Each advisory is an object in a `via` list. Its GHSA id is in `url`; its
// numeric id is in `source`. Keep both so an exception can use either form.
function collectAdvisories(report) {
  const advisories = new Map();
  for (const [key, vulnerability] of Object.entries(report.vulnerabilities ?? {})) {
    for (const via of vulnerability.via ?? []) {
      if (typeof via !== 'object' || via === null) continue; // string = dependency chain
      if (!GATED_SEVERITIES.has(via.severity)) continue;
      const ghsa = typeof via.url === 'string' ? via.url.match(GHSA_PATTERN)?.[0].toUpperCase() : undefined;
      const numeric = via.source !== undefined ? String(via.source) : undefined;
      const primary = ghsa ?? numeric;
      if (!primary) fail(`high/critical advisory without identifier in package "${key}"`);
      const pkg = via.name ?? key;
      const mapKey = `${pkg}|${primary}`;
      if (!advisories.has(mapKey)) {
        advisories.set(mapKey, {
          id: primary,
          ids: new Set([primary, numeric].filter(Boolean)),
          package: pkg,
          severity: via.severity,
          title: via.title ?? '',
        });
      }
    }
  }
  const declared = report.metadata?.vulnerabilities ?? {};
  const declaredGated = (declared.high ?? 0) + (declared.critical ?? 0);
  if (declaredGated > 0 && advisories.size === 0) {
    fail(`npm reports ${declaredGated} high/critical vulnerabilities but no advisory could be identified`);
  }
  return [...advisories.values()];
}

function loadExceptions() {
  let raw;
  try {
    raw = JSON.parse(readFileSync(EXCEPTIONS_FILE, 'utf8'));
  } catch (error) {
    fail(`cannot read ${EXCEPTIONS_FILE}: ${error.message}`);
  }
  if (!Array.isArray(raw)) fail('audit-exceptions.json must contain an array');
  raw.forEach((entry, index) => {
    const where = `audit-exceptions.json entry #${index + 1}`;
    if (typeof entry.id !== 'string' || entry.id === '') fail(`${where}: "id" is required`);
    if (typeof entry.package !== 'string' || entry.package === '') fail(`${where}: "package" is required`);
    if (typeof entry.reason !== 'string' || entry.reason === '') fail(`${where}: "reason" is required`);
    if (!/^\d{4}-\d{2}-\d{2}$/.test(entry.expires ?? '')) fail(`${where}: "expires" must be YYYY-MM-DD`);
    entry.id = entry.id.toUpperCase();
  });
  return raw;
}

function matches(exception, advisory) {
  return exception.package === advisory.package && advisory.ids.has(exception.id);
}

const today = localDate();
const report = runAudit();
const advisories = collectAdvisories(report);
const exceptions = loadExceptions();

const listed = [];
const unlisted = [];
for (const advisory of advisories) {
  const exception = exceptions.find((candidate) => matches(candidate, advisory));
  if (exception) listed.push({ advisory, exception });
  else unlisted.push(advisory);
}
const expired = exceptions.filter((entry) => entry.expires < today);
const unused = exceptions.filter((entry) => !advisories.some((advisory) => matches(entry, advisory)));

console.log(`Audit gate (high/critical), date ${today}`);
console.log(`Advisories found: ${advisories.length}`);

console.log(`\nListed and accepted: ${listed.length}`);
for (const { advisory, exception } of listed) {
  console.log(`  - ${advisory.id} ${advisory.package} (${advisory.severity}), expires ${exception.expires}: ${exception.reason}`);
}

console.log(`\nNot listed (FAIL): ${unlisted.length}`);
for (const advisory of unlisted) {
  console.log(`  - ${advisory.id} ${advisory.package} (${advisory.severity}): ${advisory.title}`);
}

console.log(`\nExpired exceptions (FAIL): ${expired.length}`);
for (const entry of expired) {
  console.log(`  - ${entry.id} ${entry.package}, expired ${entry.expires}`);
}

if (unused.length > 0) {
  console.log(`\nUnused exceptions (info, not a failure): ${unused.length}`);
  for (const entry of unused) {
    console.log(`  - ${entry.id} ${entry.package}, expires ${entry.expires}`);
  }
}

if (unlisted.length > 0 || expired.length > 0) {
  console.log('\nResult: FAIL');
  process.exit(1);
}
console.log('\nResult: PASS');
