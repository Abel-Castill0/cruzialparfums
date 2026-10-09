import assert from "node:assert/strict";
import test from "node:test";
import { ALLOWED_ADVISORIES, collectAdvisories, evaluate } from "./audit-dev-gate.mjs";

const advisory = (id, severity, name) => ({ name, severity, title: `t-${id}`, url: `https://github.com/advisories/${id}` });
const report = (vulnerabilities) => ({ vulnerabilities });

test("collects only high/critical advisories, ignoring transitive string links and lower severities", () => {
  const found = collectAdvisories(
    report({
      braces: { via: [advisory("GHSA-vfj7-8cjw-p6xm", "high", "braces")] },
      micromatch: { via: ["braces"] },
      minor: { via: [advisory("GHSA-low", "moderate", "minor")] },
      worse: { via: [advisory("GHSA-crit", "critical", "worse")] },
    }),
  );
  assert.deepEqual(found.map((item) => item.id).sort(), ["GHSA-crit", "GHSA-vfj7-8cjw-p6xm"]);
});

test("the documented braces exception passes and any other high advisory fails", () => {
  const clean = evaluate(report({ braces: { via: [advisory("GHSA-vfj7-8cjw-p6xm", "high", "braces")] } }));
  assert.equal(clean.unexpected.length, 0);
  assert.equal(clean.accepted.length, 1);

  const dirty = evaluate(
    report({
      braces: { via: [advisory("GHSA-vfj7-8cjw-p6xm", "high", "braces")] },
      other: { via: [advisory("GHSA-new-one", "high", "other")] },
    }),
  );
  assert.deepEqual(dirty.unexpected.map((item) => item.id), ["GHSA-new-one"]);
});

test("an exception that is no longer reported is flagged as stale", () => {
  const result = evaluate(report({}));
  assert.deepEqual(result.stale.map((entry) => entry.id), ALLOWED_ADVISORIES.map((entry) => entry.id));
});

test("every exception documents why it cannot be fixed", () => {
  for (const entry of ALLOWED_ADVISORIES) {
    assert.match(entry.id, /^GHSA-[a-z0-9-]+$/);
    assert.ok(entry.reason.length > 80);
  }
});
