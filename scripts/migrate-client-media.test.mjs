// Run with: node --test scripts/migrate-client-media.test.mjs
//
// Only the pure, network/filesystem-free decision points are unit tested
// here (docs: Phase 4F2B correctness patch, section 2) — cloudinaryPlan/
// cloudinaryApply themselves do real HTTP calls and stay covered by the
// live plan/apply/verify runs against the real account instead. Importing
// this module does NOT execute the CLI: see the `import.meta.url` guard at
// the bottom of migrate-client-media.mjs.
import { test } from "node:test";
import assert from "node:assert/strict";
import { hasFatalPlanIssues, planUploadDecision } from "./migrate-client-media.mjs";

function counts(overrides) {
  return {
    eligible: 10,
    already_present_verified: 0,
    would_upload: 0,
    conflicts: 0,
    blocked: 0,
    missing_local_file: 0,
    duplicate_content: 0,
    ...overrides,
  };
}

test("hasFatalPlanIssues is false for a clean plan", () => {
  assert.equal(hasFatalPlanIssues(counts({ would_upload: 10 })), false);
});

test("hasFatalPlanIssues is true when conflicts > 0", () => {
  assert.equal(hasFatalPlanIssues(counts({ conflicts: 1 })), true);
});

test("hasFatalPlanIssues is true when missing_local_file > 0", () => {
  assert.equal(hasFatalPlanIssues(counts({ missing_local_file: 1 })), true);
});

test("hasFatalPlanIssues is true when blocked > 0 (planning-level conflict)", () => {
  assert.equal(hasFatalPlanIssues(counts({ blocked: 1 })), true);
});

test("planUploadDecision refuses and uploads nothing when a confirmed eligible source file is missing", () => {
  const classified = [
    { publicId: "a", classification: "would_upload" },
    { publicId: "b", classification: "missing_local_file" },
  ];
  const decision = planUploadDecision(counts({ would_upload: 1, missing_local_file: 1 }), classified);
  assert.equal(decision.refused, true);
  assert.deepEqual(decision.toUpload, []);
  assert.deepEqual(decision.toKeep, []);
});

test("planUploadDecision refuses and uploads nothing when there is a planning-level unresolved conflict (blocked)", () => {
  const classified = [{ publicId: "a", classification: "would_upload" }];
  const decision = planUploadDecision(counts({ would_upload: 1, blocked: 1 }), classified);
  assert.equal(decision.refused, true);
  assert.deepEqual(decision.toUpload, []);
  assert.deepEqual(decision.toKeep, []);
});

test("planUploadDecision refuses and uploads nothing when a Cloudinary-side checksum conflict exists", () => {
  const classified = [{ publicId: "a", classification: "conflict" }];
  const decision = planUploadDecision(counts({ conflicts: 1 }), classified);
  assert.equal(decision.refused, true);
  assert.deepEqual(decision.toUpload, []);
});

test("planUploadDecision proceeds on a clean plan: separates would_upload from already_present_verified", () => {
  const classified = [
    { publicId: "a", classification: "would_upload" },
    { publicId: "b", classification: "already_present_verified" },
  ];
  const decision = planUploadDecision(counts({ would_upload: 1, already_present_verified: 1 }), classified);
  assert.equal(decision.refused, false);
  assert.equal(decision.toUpload.length, 1);
  assert.equal(decision.toUpload[0].publicId, "a");
  assert.equal(decision.toKeep.length, 1);
  assert.equal(decision.toKeep[0].publicId, "b");
});

test("planUploadDecision treats a clean plan with zero duplicate_content rows as non-fatal (deliberate dedup, not an error)", () => {
  const classified = [{ publicId: "a", classification: "would_upload" }];
  const decision = planUploadDecision(counts({ would_upload: 1, duplicate_content: 2 }), classified);
  assert.equal(decision.refused, false);
});
