#!/usr/bin/env node
/**
 * Full (dev + prod) dependency audit gate with an explicit, justified allow-list.
 *
 * `npm audit --omit=dev --audit-level=high` already blocks production
 * dependencies in CI. This gate covers the rest: it fails on ANY high/critical
 * advisory, except the ones named below. An exception must name its advisory,
 * say why it cannot be fixed, and is reported on every run so it cannot be
 * forgotten; an exception that no longer applies is reported as stale.
 *
 * Usage (from apps/web):  node ../../scripts/audit-dev-gate.mjs
 */
import { spawnSync } from "node:child_process";
import { fileURLToPath } from "node:url";

export const ALLOWED_ADVISORIES = [
  {
    id: "GHSA-vfj7-8cjw-p6xm",
    pkg: "braces",
    reason:
      "No patched release exists (npm latest braces 3.0.3 is the vulnerable ceiling). Reached only through " +
      "eslint-config-next -> @next/eslint-plugin-next -> fast-glob -> micromatch -> braces (lint tooling, " +
      "devDependency, never in the production bundle; `npm audit --omit=dev` is clean). eslint-config-next is " +
      "already at its latest release. Resolve by upgrading once braces (or fast-glob/micromatch) ships a fix.",
  },
];

const BLOCKING = new Set(["high", "critical"]);

/** Collects every high/critical advisory id present in an `npm audit --json` report. */
export function collectAdvisories(report) {
  const found = new Map();
  for (const [name, vulnerability] of Object.entries(report?.vulnerabilities ?? {})) {
    for (const via of vulnerability.via ?? []) {
      if (typeof via !== "object" || !via?.url || !BLOCKING.has(via.severity)) continue;
      const id = via.url.split("/").pop();
      if (!found.has(id)) found.set(id, { id, pkg: via.name ?? name, title: via.title ?? "", severity: via.severity });
    }
  }
  return [...found.values()];
}

export function evaluate(report, allowed = ALLOWED_ADVISORIES) {
  const advisories = collectAdvisories(report);
  const allowedIds = new Set(allowed.map((entry) => entry.id));
  return {
    unexpected: advisories.filter((advisory) => !allowedIds.has(advisory.id)),
    accepted: advisories.filter((advisory) => allowedIds.has(advisory.id)),
    stale: allowed.filter((entry) => !advisories.some((advisory) => advisory.id === entry.id)),
  };
}

function main() {
  const run = spawnSync("npm", ["audit", "--json"], { encoding: "utf8", shell: process.platform === "win32", maxBuffer: 64 * 1024 * 1024 });
  let report;
  try {
    report = JSON.parse(run.stdout);
  } catch {
    console.error("audit-dev-gate: could not parse `npm audit --json` output (registry unreachable?)");
    process.exit(2);
  }
  if (report.error) {
    console.error(`audit-dev-gate: npm audit failed: ${report.error.summary ?? report.error.code}`);
    process.exit(2);
  }
  const { unexpected, accepted, stale } = evaluate(report);
  for (const advisory of accepted) {
    const entry = ALLOWED_ADVISORIES.find((item) => item.id === advisory.id);
    console.log(`accepted exception ${advisory.id} (${advisory.pkg}): ${entry.reason}`);
  }
  for (const entry of stale) console.log(`stale exception ${entry.id} (${entry.pkg}) no longer reported: remove it from ALLOWED_ADVISORIES`);
  if (unexpected.length > 0) {
    for (const advisory of unexpected) console.error(`UNEXPECTED ${advisory.severity} advisory ${advisory.id} in ${advisory.pkg}: ${advisory.title}`);
    process.exit(1);
  }
  console.log(`audit-dev-gate: PASS (${accepted.length} documented exception(s), 0 unexpected)`);
}

if (process.argv[1] && fileURLToPath(import.meta.url) === process.argv[1]) main();
