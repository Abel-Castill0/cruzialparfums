/**
 * Cruzial Platform V2 - Phase 4F2B pure planning logic.
 *
 * No filesystem/network I/O here - every function takes plain data in and
 * returns plain data out, so it can be unit tested without a local Cloudinary
 * account or a running Supabase instance. scripts/migrate-client-media.mjs
 * is the thin I/O shell that reads img/perfumes/*.png, calls Cloudinary, and
 * talks to Postgres; it delegates every actual decision to this module.
 *
 * Terminology:
 * - "eligible record": a client-media-reconciliation.json record whose
 *   status is EXACT_MATCH or ALIAS_CONFIRMED - the only statuses this phase
 *   is allowed to migrate (docs: Phase 4F2B, section SOURCE).
 * - "slot": bottle/set are single-slot roles (at most one canonical asset
 *   per product); "additional" is a multi-slot role (any number of
 *   confirmed extra views per product).
 */

const ELIGIBLE_STATUSES = new Set(["EXACT_MATCH", "ALIAS_CONFIRMED"]);
const SINGLE_SLOT_ROLES = ["set", "bottle"];
const MIGRATION_SOURCE = "phase_4f2b_client_media";

/** Strips a path down to its filename without extension, for comparing a
 * client PNG's own name against the basename of the currently-deployed webp
 * it should correspond to under the documented 1:1 png-to-webp pipeline
 * (CLAUDE.md: "pure format/size conversion, zero content change"). */
export function basenameNoExt(pathOrFilename) {
  if (!pathOrFilename) return null;
  const parts = pathOrFilename.split("/").join("|").split("\\").join("|").split("|");
  const withoutDir = parts[parts.length - 1];
  const dot = withoutDir.lastIndexOf(".");
  return dot <= 0 ? withoutDir : withoutDir.slice(0, dot);
}

/** Filters the manifest's flat records array down to EXACT_MATCH and
 * ALIAS_CONFIRMED only. Every other status (AMBIGUOUS, NO_MATCH,
 * CLIENT_ASSET_MISSING) is excluded here - nothing downstream ever sees
 * them, so there is no code path that could accidentally migrate one. */
export function selectEligibleRecords(manifest) {
  const records = manifest && manifest.records ? manifest.records : [];
  return records.filter(function (record) {
    return ELIGIBLE_STATUSES.has(record.status);
  });
}

/** Groups records already scoped to one product by media_role only. The
 * caller (planProductMedia) guarantees single-product scope, so there is no
 * external product-id string that could ever fall out of sync with the
 * records' own legacy_product_id field. */
function groupByRole(recordsForOneProduct) {
  const groups = {};
  for (const record of recordsForOneProduct) {
    const role = record.media_role;
    if (!groups[role]) groups[role] = [];
    groups[role].push(record);
  }
  return groups;
}

/**
 * Resolves a single-slot (bottle/set) group with more than one eligible
 * candidate down to exactly one CANONICAL record for that role, using ONLY
 * the group's own current_legacy_image field (the currently-deployed
 * IMG_MAP path - AGENTS.md's own "CURRENT PUBLIC SOURCE OF TRUTH") - never a
 * heuristic invented for this migration. A candidate is selected as
 * canonical only when its filename (minus extension) exactly matches the
 * basename (minus extension) of current_legacy_image. If zero or more than
 * one candidate satisfies that, this is a real, unresolvable duplicate:
 * return a conflict instead of guessing.
 *
 * The other, non-canonical candidates are NOT discarded here — both records
 * already reconcile authoritatively to the same legacy_product_id, which is
 * sufficient product association on its own; a confirmed candidate is only
 * ever dropped for being a byte-identical copy of something already kept
 * (checked by the caller via checksum), never merely for losing the
 * canonical-role tiebreak. See planProductMedia for how `otherCandidates`
 * is turned into either a duplicate_content exclusion or a preserved
 * supplemental media item.
 */
function resolveSingleSlotGroup(records) {
  if (records.length === 1) {
    return { selected: records[0], otherCandidates: [], conflict: null };
  }

  let targetBasename = null;
  for (const record of records) {
    if (record.current_legacy_image) {
      targetBasename = basenameNoExt(record.current_legacy_image);
      break;
    }
  }

  const matches = targetBasename
    ? records.filter(function (record) {
        return basenameNoExt(record.client_original_filename) === targetBasename;
      })
    : [];

  if (matches.length === 1) {
    const selected = matches[0];
    return {
      selected,
      otherCandidates: records.filter(function (record) {
        return record !== selected;
      }),
      conflict: null,
    };
  }

  return {
    selected: null,
    otherCandidates: [],
    conflict: {
      code: "DUPLICATE_SLOT_UNRESOLVED",
      legacy_product_id: records[0].legacy_product_id,
      media_role: records[0].media_role,
      candidates: records.map(function (record) {
        return record.client_original_filename;
      }),
    },
  };
}

/**
 * Deduplicates a group of records by content: two records whose local files
 * hash identically are the same physical photo under two filenames, so only
 * one is kept (sorted by filename first, so which one survives is
 * deterministic). checksumOf(record) is injected so this stays pure - the
 * caller supplies pre-computed SHA-256 hashes. A record whose checksum
 * cannot be determined (checksumOf returns a falsy value — e.g. no local
 * file) is never treated as a duplicate of anything: identity can only be
 * disproved, never assumed, so it is always kept here and left for the
 * Cloudinary-plan I/O layer to classify as missing_local_file.
 */
function dedupeByContent(records, checksumOf) {
  const sorted = records.slice().sort(function (a, b) {
    return a.client_original_filename.localeCompare(b.client_original_filename);
  });
  const seenChecksums = {};
  const kept = [];
  const duplicates = [];
  for (const record of sorted) {
    const checksum = checksumOf(record);
    if (checksum && seenChecksums[checksum]) {
      duplicates.push(record);
      continue;
    }
    if (checksum) seenChecksums[checksum] = true;
    kept.push(record);
  }
  return { kept, duplicates };
}

/**
 * Builds the deterministic, portable stable-asset-id suffix used in the
 * Cloudinary public_id: "bottle", "set", or "additional-01", "additional-02",
 * ... for multi-slot roles, ordered by filename (never filesystem
 * enumeration order).
 */
export function stableAssetId(mediaRole, ordinal) {
  if (mediaRole !== "additional") return mediaRole;
  const padded = ordinal < 10 ? "0" + ordinal : String(ordinal);
  return "additional-" + padded;
}

/**
 * Stable-asset-id for a "supplemental" item: a confirmed candidate that lost
 * the canonical bottle/set tiebreak (see resolveSingleSlotGroup) but has
 * distinct content from the canonical asset, so it is preserved rather than
 * discarded. Content-addressed (not ordinal) on purpose: it must never
 * collide with, renumber, or otherwise disturb the ordinal
 * additional-01/additional-02/... ids already assigned to genuine
 * multi-slot "additional"-role records (some of which are already migrated
 * — see docs: Phase 4F2B correctness patch, section 1), and it must stay
 * identical across reruns regardless of how many other supplemental items
 * exist or in what order they are discovered.
 */
export function supplementalAssetId(checksum) {
  return "additional-" + checksum.slice(0, 12);
}

/** cruzial/parfums/catalog/<legacy_id>/<stable-asset-id> - no environment
 * UUID anywhere, so the same id is valid in staging and future production. */
export function computePortablePublicId(legacyProductId, assetId) {
  return "cruzial/parfums/catalog/" + legacyProductId + "/" + assetId;
}

/**
 * Resolves the full migration plan for one product's eligible records.
 * Determines primary (docs: "Do NOT assume bottle = primary" - mirrors
 * assets/data.js's own `p.img = imgs.set || imgs.bottle`: set is primary
 * when present, bottle is primary only when set has no eligible record for
 * this product) and deterministic sort_order (set/bottle first, then
 * additional views sorted by filename).
 *
 * @param {string} legacyProductId
 * @param {Array} recordsForProduct eligible records for this product only
 * @param {(record: object) => string | null} checksumOf
 */
export function planProductMedia(legacyProductId, recordsForProduct, checksumOf) {
  const byRole = groupByRole(recordsForProduct);
  const conflicts = [];
  const excluded = [];
  const resolvedSingleSlot = {};
  const supplementalCandidates = [];

  for (const role of SINGLE_SLOT_ROLES) {
    const records = byRole[role];
    if (!records) continue;
    const resolved = resolveSingleSlotGroup(records);
    if (resolved.conflict) {
      conflicts.push(resolved.conflict);
      continue;
    }
    resolvedSingleSlot[role] = resolved.selected;

    // A non-canonical candidate is dropped only when it is a byte-identical
    // copy of the canonical asset (checksum confirmed equal) — never merely
    // for losing the bottle/set tiebreak. Both records already reconcile to
    // this product, which is sufficient association on its own; distinct
    // content is preserved as a supplemental media item, not discarded.
    const canonicalChecksum = resolved.selected ? checksumOf(resolved.selected) : null;
    for (const candidate of resolved.otherCandidates) {
      const candidateChecksum = checksumOf(candidate);
      if (candidateChecksum && canonicalChecksum && candidateChecksum === canonicalChecksum) {
        excluded.push(Object.assign({}, candidate, { exclusion_reason: "duplicate_content" }));
      } else {
        supplementalCandidates.push(candidate);
      }
    }
  }

  const additionalRecords = byRole.additional || [];
  const additionalResolved = dedupeByContent(additionalRecords, checksumOf);
  for (const record of additionalResolved.duplicates) {
    excluded.push(Object.assign({}, record, { exclusion_reason: "duplicate_content" }));
  }

  // Supplemental candidates are deduplicated against each other by the same
  // content rule (two lost-tiebreak candidates from different single-slot
  // roles could themselves coincide), independently of the genuine
  // "additional"-role group above so its ordinal ids never shift.
  const supplementalResolved = dedupeByContent(supplementalCandidates, checksumOf);
  for (const record of supplementalResolved.duplicates) {
    excluded.push(Object.assign({}, record, { exclusion_reason: "duplicate_content" }));
  }

  const primaryRole = resolvedSingleSlot.set ? "set" : resolvedSingleSlot.bottle ? "bottle" : null;

  const items = [];
  let sortOrder = 0;

  for (const role of ["set", "bottle"]) {
    const record = resolvedSingleSlot[role];
    if (!record) continue;
    items.push({
      record,
      mediaRole: role,
      assetId: stableAssetId(role, null),
      isPrimary: role === primaryRole,
      sortOrder: sortOrder++,
    });
  }

  const sortedAdditional = additionalResolved.kept.slice().sort(function (a, b) {
    return a.client_original_filename.localeCompare(b.client_original_filename);
  });
  sortedAdditional.forEach(function (record, index) {
    items.push({
      record,
      mediaRole: "additional",
      assetId: stableAssetId("additional", index + 1),
      isPrimary: false,
      sortOrder: sortOrder++,
    });
  });

  // Supplemental items (lost the canonical tiebreak, distinct content) are
  // still "additional" media role-wise, but get a content-addressed id
  // (never an ordinal one) so they can never collide with or renumber the
  // genuine additional-01/02/... ids assigned just above.
  const sortedSupplemental = supplementalResolved.kept.slice().sort(function (a, b) {
    return a.client_original_filename.localeCompare(b.client_original_filename);
  });
  sortedSupplemental.forEach(function (record) {
    const checksum = checksumOf(record);
    if (!checksum) {
      // No local file to hash — cannot mint a content-addressed id. Leave
      // it out of the plan's items entirely; the Cloudinary-plan I/O layer
      // (which has real filesystem access) is what actually classifies a
      // missing source file, so this never silently vanishes — it simply
      // isn't planned as an item here, matching how any other unresolved
      // record in this function behaves.
      excluded.push(Object.assign({}, record, { exclusion_reason: "missing_local_file" }));
      return;
    }
    items.push({
      record,
      mediaRole: "additional",
      assetId: supplementalAssetId(checksum),
      isPrimary: false,
      sortOrder: sortOrder++,
    });
  });

  return { legacyProductId, items, excluded, conflicts };
}

/**
 * Top-level entry point: eligible records in, one plan per product out.
 * checksumOf is injected (see module docstring) so this whole module stays
 * filesystem-free and unit-testable with synthetic fixtures.
 */
export function buildMediaMigrationPlan(manifest, checksumOf) {
  const eligible = selectEligibleRecords(manifest);
  const byProduct = {};
  const order = [];
  for (const record of eligible) {
    const id = record.legacy_product_id;
    if (!byProduct[id]) {
      byProduct[id] = [];
      order.push(id);
    }
    byProduct[id].push(record);
  }

  order.sort();
  const products = order.map(function (legacyProductId) {
    return planProductMedia(legacyProductId, byProduct[legacyProductId], checksumOf);
  });

  return { eligibleCount: eligible.length, products };
}

/**
 * Builds the deterministic, versioned result-manifest object written to
 * supabase/staging/client-media-cloudinary.json (docs: Phase 4F2B
 * correctness patch, section 4). Pure and I/O-free: `rows` is the already-
 * resolved list of migrated media (each carrying its Cloudinary metadata),
 * computed by the I/O shell. No timestamp, no "uploaded vs already present"
 * run-dependent counts — two clean runs over unchanged source files and
 * Cloudinary state must produce byte-identical JSON. Row order follows
 * `plan.products` (already sorted by legacy_product_id) x each product's
 * fixed item order — never input array order, never a Map/object key
 * iteration order.
 */
export function buildResultManifest({ plan, sourceFingerprints, rows }) {
  const rowsByPublicId = new Map();
  for (const row of rows) {
    if (!row?.publicId) throw new Error("Every resolved media row requires a publicId.");
    if (rowsByPublicId.has(row.publicId)) {
      throw new Error(`Duplicate resolved media publicId: ${row.publicId}`);
    }
    rowsByPublicId.set(row.publicId, row);
  }

  const orderedRows = [];
  for (const product of plan.products) {
    for (const item of product.items) {
      const publicId = computePortablePublicId(product.legacyProductId, item.assetId);
      const row = rowsByPublicId.get(publicId);
      if (!row) throw new Error(`Missing resolved media row for planned publicId: ${publicId}`);
      orderedRows.push(row);
      rowsByPublicId.delete(publicId);
    }
  }
  if (rowsByPublicId.size > 0) {
    throw new Error(`Resolved media contains ${rowsByPublicId.size} row(s) absent from the plan.`);
  }

  const manifestRows = orderedRows.map(function (row) {
    return {
      legacy_product_id: row.legacyProductId,
      client_original_filename: row.clientOriginalFilename,
      media_role: row.mediaRole,
      source_sha256: row.checksum,
      cloudinary_public_id: row.publicId,
      secure_url: row.secureUrl,
      width: row.width,
      height: row.height,
      bytes: row.bytes,
      format: row.format,
      source_reconciliation_status: row.reconciliationStatus,
      migration_status: "migrated",
      is_primary_intent: row.isPrimary,
      sort_order: row.sortOrder,
      variant_association_intent: null,
      alt: [row.brand, row.legacyProductName].filter(Boolean).join(" ") || null,
    };
  });

  const excludedByteDuplicates = plan.products.reduce(function (sum, product) {
    return (
      sum +
      product.excluded.filter(function (record) {
        return record.exclusion_reason === "duplicate_content";
      }).length
    );
  }, 0);

  const unresolved = plan.products.reduce(function (sum, product) {
    return (
      sum +
      product.conflicts.length +
      product.excluded.filter(function (record) {
        return record.exclusion_reason !== "duplicate_content";
      }).length
    );
  }, 0);

  return {
    schema_version: 2,
    purpose: "Phase 4F2B Cloudinary migration result — portable, no environment UUIDs, no secrets, deterministic.",
    migration_source: MIGRATION_SOURCE,
    source_fingerprints: sourceFingerprints ?? null,
    counts: {
      source_eligible_records: plan.eligibleCount,
      migrated_assets: manifestRows.length,
      excluded_byte_duplicates: excludedByteDuplicates,
      unresolved: unresolved,
    },
    rows: manifestRows,
  };
}

export { ELIGIBLE_STATUSES, SINGLE_SLOT_ROLES, MIGRATION_SOURCE };
